import { ProjectState } from '../../types/project';
import { IStorageProvider, StorageUsageStats } from './storageTypes';
import { migrateProjectToLatest, sanitizeProjectForStorage } from '../validation/projectMigration';

const DB_NAME = 'cineforge_studio_db';
const DB_VERSION = 3;

const STORES = {
  PROJECTS: 'projects',
  MEDIA_BLOBS: 'media_blobs',
  PREVIEW_CACHE: 'preview_cache',
  EXPORTED_VIDEOS: 'exported_videos'
};

export interface ExportedVideoRecord {
  id: string;
  title: string;
  fileName: string;
  blob: Blob;
  sizeBytes: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  resolution: string;
  videoCodec: string;
  createdAt: number;
  thumbnailUrl?: string;
}

export class IndexedDBStorageProvider implements IStorageProvider {
  id = 'indexed_db';
  name = 'Pamięć lokalna urządzenia (IndexedDB)';

  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB nie jest obsługiwany w tej przeglądarce.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MEDIA_BLOBS)) {
          db.createObjectStore(STORES.MEDIA_BLOBS, { keyPath: 'clipId' });
        }
        if (!db.objectStoreNames.contains(STORES.PREVIEW_CACHE)) {
          db.createObjectStore(STORES.PREVIEW_CACHE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.EXPORTED_VIDEOS)) {
          db.createObjectStore(STORES.EXPORTED_VIDEOS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Błąd otwierania IndexedDB'));
    });

    return this.dbPromise;
  }

  async saveProjectDraft(project: ProjectState): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PROJECTS, 'readwrite');
        const store = tx.objectStore(STORES.PROJECTS);
        
        // Clean project state before saving to avoid cyclic references or raw Blobs in JSON
        const serialized = sanitizeProjectForStorage(project);

        const req = store.put(serialized);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async loadProjectDraft(id: string = 'main-project'): Promise<ProjectState | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readonly');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.get(id);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        try {
          const migrated = migrateProjectToLatest(req.result);
          resolve(migrated);
        } catch (err) {
          console.error('Error migrating loaded project from IDB:', err);
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async listProjectDrafts(): Promise<{ id: string; name: string; updatedAt: string }[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readonly');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result || []).map((p: any) => ({
          id: p.id,
          name: p.name || 'Bez nazwy',
          updatedAt: p.updatedAt || p.createdAt || new Date().toISOString()
        }));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteProjectDraft(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROJECTS, 'readwrite');
      const store = tx.objectStore(STORES.PROJECTS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async enforceStorageQuota(blobSizeToSave: number): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota || 8 * 1024 * 1024 * 1024; // 8GB default
      const usage = estimate.usage || 0;

      // Trigger LRU eviction if we exceed 95% of quota or have less than 50MB of free space
      const limitThreshold = quota * 0.95;
      const minFreeSpace = 50 * 1024 * 1024;

      if (usage + blobSizeToSave > limitThreshold || (quota - (usage + blobSizeToSave)) < minFreeSpace) {
        console.warn(`[localIndexedDB] Low storage detected. Usage: ${(usage / (1024*1024)).toFixed(1)}MB, Quota: ${(quota / (1024*1024)).toFixed(1)}MB. Free space would be less than 150MB. Starting LRU eviction...`);
        
        const db = await this.getDB();
        
        // Fetch all cached media blobs to find candidates
        const allRecords: { clipId: string; size: number; updatedAt: number }[] = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.MEDIA_BLOBS, 'readonly');
          const store = tx.objectStore(STORES.MEDIA_BLOBS);
          const req = store.getAll();
          
          req.onsuccess = () => {
            const records = (req.result || []).map((r: any) => ({
              clipId: r.clipId,
              size: r.blob?.size || 0,
              updatedAt: r.updatedAt || 0
            }));
            resolve(records);
          };
          req.onerror = () => reject(req.error);
        });

        // Sort candidates by updatedAt ascending (oldest first)
        allRecords.sort((a, b) => a.updatedAt - b.updatedAt);

        let freedBytes = 0;
        let evictedCount = 0;
        const targetToFree = blobSizeToSave + (250 * 1024 * 1024); // Attempt to free the new blob size plus 250MB safety padding

        for (const record of allRecords) {
          if (freedBytes >= targetToFree) break;
          
          // Delete from IndexedDB
          await new Promise<void>((resolveDelete, rejectDelete) => {
            const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
            const store = tx.objectStore(STORES.MEDIA_BLOBS);
            const req = store.delete(record.clipId);
            req.onsuccess = () => resolveDelete();
            req.onerror = () => rejectDelete(req.error);
          });

          freedBytes += record.size;
          evictedCount++;
          console.log(`[localIndexedDB] Evicted old clip ${record.clipId} (${(record.size / (1024*1024)).toFixed(1)}MB) to free space.`);
        }

        console.warn(`[localIndexedDB] LRU eviction completed. Freed ${evictedCount} clip(s) totaling ${(freedBytes / (1024*1024)).toFixed(1)}MB.`);
      }
    } catch (e) {
      console.warn('[localIndexedDB] Storage quota check or eviction failed:', e);
    }
  }

  async saveMediaBlob(clipId: string, blob: Blob): Promise<void> {
    // Automatically enforce storage quota and evict oldest unused blobs using LRU before putting new ones
    await this.enforceStorageQuota(blob.size);

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.put({ clipId, blob, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getMediaBlob(clipId: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.get(clipId);
      req.onsuccess = () => {
        if (req.result) {
          // Asynchronously update its updatedAt timestamp to make it recently used (LRU)
          const record = req.result;
          record.updatedAt = Date.now();
          store.put(record);
          resolve(record.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMediaBlob(clipId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.delete(clipId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMediaBlobsForClips(clipIds: string[]): Promise<void> {
    if (!clipIds || clipIds.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      for (const id of clipIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAllMediaBlobs(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MEDIA_BLOBS, 'readwrite');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async savePreviewCache(key: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.put({ key, blob, createdAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPreviewCache(key: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readonly');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async clearPreviewCache(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
      const store = tx.objectStore(STORES.PREVIEW_CACHE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async saveExportedVideo(video: ExportedVideoRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.EXPORTED_VIDEOS, 'readwrite');
        const store = tx.objectStore(STORES.EXPORTED_VIDEOS);
        const req = store.put(video);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async listExportedVideos(): Promise<ExportedVideoRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.EXPORTED_VIDEOS, 'readonly');
        const store = tx.objectStore(STORES.EXPORTED_VIDEOS);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []).sort((a: ExportedVideoRecord, b: ExportedVideoRecord) => b.createdAt - a.createdAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteExportedVideo(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.EXPORTED_VIDEOS, 'readwrite');
        const store = tx.objectStore(STORES.EXPORTED_VIDEOS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async saveMasterRenderBlob(
    projectId: string, 
    blob: Blob, 
    meta: {
      fileName: string;
      duration: number;
      width: number;
      height: number;
      sizeBytes: number;
      mimeType: string;
      resolution?: string;
      aspectRatio?: string;
      verifiedPlayable: boolean;
      diagnostics?: any;
    }
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `master_render_${projectId || 'default'}`;
        const record = {
          key,
          blob,
          meta,
          createdAt: Date.now()
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getMasterRenderBlob(projectId: string): Promise<{ blob: Blob; meta: any; createdAt: number } | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readonly');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `master_render_${projectId || 'default'}`;
        const req = store.get(key);
        req.onsuccess = () => {
          if (!req.result || !req.result.blob) {
            resolve(null);
          } else {
            resolve({
              blob: req.result.blob,
              meta: req.result.meta || {},
              createdAt: req.result.createdAt || Date.now()
            });
          }
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearMasterRenderBlob(projectId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `master_render_${projectId || 'default'}`;
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async saveRenderCheckpoint(checkpoint: {
    projectId: string;
    currentFrame: number;
    totalFrames: number;
    percent: number;
    stage: string;
    options: any;
    statusMessage?: string;
    timestamp: number;
  }): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `render_checkpoint_${checkpoint.projectId || 'default'}`;
        const req = store.put({
          key,
          checkpoint,
          createdAt: checkpoint.timestamp || Date.now()
        });
        req.onsuccess = () => {
          // Also save lightweight reference in localStorage for instant sync
          try {
            localStorage.setItem('cineforge_active_render_checkpoint', JSON.stringify(checkpoint));
          } catch (e) {}
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getRenderCheckpoint(projectId: string): Promise<any | null> {
    // Try localStorage first for synchronous fast read
    try {
      const local = localStorage.getItem('cineforge_active_render_checkpoint') || localStorage.getItem('wedding_studio_active_render_checkpoint');
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && (parsed.projectId === projectId || !projectId)) {
          // Check if checkpoint is not stale (less than 2 hours old)
          if (Date.now() - (parsed.timestamp || 0) < 7200000) {
            return parsed;
          }
        }
      }
    } catch (e) {}

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readonly');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `render_checkpoint_${projectId || 'default'}`;
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.checkpoint) {
            resolve(req.result.checkpoint);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearRenderCheckpoint(projectId: string): Promise<void> {
    try {
      localStorage.removeItem('cineforge_active_render_checkpoint');
      localStorage.removeItem('wedding_studio_active_render_checkpoint');
    } catch (e) {}

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.PREVIEW_CACHE, 'readwrite');
        const store = tx.objectStore(STORES.PREVIEW_CACHE);
        const key = `render_checkpoint_${projectId || 'default'}`;
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getStorageStats(): Promise<StorageUsageStats> {
    let quotaBytes = 8 * 1024 * 1024 * 1024; // 8GB default
    let usedBytes = 0;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota) quotaBytes = est.quota;
        if (est.usage) usedBytes = est.usage;
      } catch (e) {
        console.warn('Storage estimate not supported', e);
      }
    }

    // Read draft counts and preview cache size
    let projectCount = 0;
    let mediaBlobCount = 0;
    try {
      const db = await this.getDB();
      const pTx = db.transaction(STORES.PROJECTS, 'readonly');
      const pReq = pTx.objectStore(STORES.PROJECTS).count();
      projectCount = await new Promise(res => { pReq.onsuccess = () => res(pReq.result || 0); });

      const mTx = db.transaction(STORES.MEDIA_BLOBS, 'readonly');
      const mReq = mTx.objectStore(STORES.MEDIA_BLOBS).count();
      mediaBlobCount = await new Promise(res => { mReq.onsuccess = () => res(mReq.result || 0); });
    } catch (e) {
      // Non-blocking
    }

    const availableBytes = Math.max(0, quotaBytes - usedBytes);
    const percentUsed = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;

    return {
      quotaBytes,
      usedBytes,
      availableBytes,
      percentUsed,
      projectCount,
      mediaBlobCount,
      previewCacheBytes: 0,
      mediaBytes: usedBytes
    };
  }
}

export const localIndexedDB = new IndexedDBStorageProvider();
