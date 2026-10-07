/**
 * Central LRU Cache Manager (ETAP 2)
 * 
 * Provides bounded in-memory caching with prioritized eviction:
 * - HIGH Priority: Clips currently visible or within +/- 10s of playhead
 * - MEDIUM Priority: Other clips on the active sequence timeline
 * - LOW Priority: Background media library items and inactive sequences
 * 
 * Protects RAM by evicting LOW items first upon memory pressure.
 */

export type CachePriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CacheEntry<T> {
  key: string;
  value: T;
  priority: CachePriority;
  sizeBytes: number;
  lastAccessed: number;
  expiresAt?: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private maxMemoryBytes = 80 * 1024 * 1024; // 80 MB default in-memory budget
  private currentMemoryBytes = 0;

  constructor(maxMemoryMb: number = 80) {
    this.maxMemoryBytes = maxMemoryMb * 1024 * 1024;
  }

  set<T>(key: string, value: T, priority: CachePriority = 'MEDIUM', approximateSizeBytes: number = 2048): void {
    // If entry exists, subtract old size
    if (this.cache.has(key)) {
      const old = this.cache.get(key)!;
      this.currentMemoryBytes -= old.sizeBytes;
    }

    // Ensure we have capacity; evict if needed
    if (this.currentMemoryBytes + approximateSizeBytes > this.maxMemoryBytes) {
      this.evict(approximateSizeBytes);
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      priority,
      sizeBytes: approximateSizeBytes,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.currentMemoryBytes += approximateSizeBytes;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check expiration if set
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Touch access time for LRU
    entry.lastAccessed = Date.now();
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.currentMemoryBytes -= entry.sizeBytes;
    return this.cache.delete(key);
  }

  updatePriority(key: string, priority: CachePriority): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.priority = priority;
      entry.lastAccessed = Date.now();
    }
  }

  /**
   * Promotes keys near the playhead to HIGH and demotes distant keys
   */
  rebalanceTimelinePriorities(activeClipIds: Set<string>, nearbyClipIds: Set<string>): void {
    this.cache.forEach((entry, key) => {
      let isHigh = false;
      let isMedium = false;

      activeClipIds.forEach(id => {
        if (key.includes(id)) isHigh = true;
      });

      if (!isHigh) {
        nearbyClipIds.forEach(id => {
          if (key.includes(id)) isMedium = true;
        });
      }

      if (isHigh) entry.priority = 'HIGH';
      else if (isMedium) entry.priority = 'MEDIUM';
      else entry.priority = 'LOW';
    });
  }

  /**
   * Evicts entries starting with LOW priority, then MEDIUM, sorted by LRU
   */
  private evict(neededBytes: number): void {
    const entries = Array.from(this.cache.values());

    // Sort: LOW first, then MEDIUM; oldest lastAccessed first
    const priorityWeight: Record<CachePriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

    entries.sort((a, b) => {
      const pDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.lastAccessed - b.lastAccessed;
    });

    let freed = 0;
    for (const item of entries) {
      // Never evict HIGH priority unless critical
      if (item.priority === 'HIGH' && this.currentMemoryBytes <= this.maxMemoryBytes) {
        continue;
      }

      this.cache.delete(item.key);
      this.currentMemoryBytes -= item.sizeBytes;
      freed += item.sizeBytes;

      if (this.currentMemoryBytes + neededBytes <= this.maxMemoryBytes) {
        break;
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;
  }

  getStats() {
    return {
      entriesCount: this.cache.size,
      usedMemoryBytes: this.currentMemoryBytes,
      usedMemoryMb: Math.round((this.currentMemoryBytes / (1024 * 1024)) * 10) / 10,
      maxMemoryMb: Math.round((this.maxMemoryBytes / (1024 * 1024)))
    };
  }
}

export const centralCacheManager = new CacheManager(100); // 100MB RAM budget
