/**
 * Real Proxy Engine (ETAP 2)
 * 
 * Generates lightweight, responsive editing proxies for high-resolution 4K/6K/8K source media:
 * - Profiles: 'low_540p' (ultra-fast scrubbing), 'medium_720p' (balanced), 'high_1080p'
 * - Concurrency queue regulated by AdaptiveResourceManager
 * - Persistent caching in IndexedDB / local URL registry
 * - Strict Separation: Proxies are used SOLELY for timeline preview/playback.
 *   Final export ALWAYS requires the original high-resolution media.
 */

import { MediaClip, ProxyProfile, ProxyStatus } from '../../types/project';
import { urlRegistry } from '../media/urlRegistry';
import { localIndexedDB } from '../storage/indexedDBProvider';
import { adaptiveResourceManager } from '../performance/adaptiveResourceManager';
import { centralCacheManager } from '../cache/cacheManager';

export interface ProxyTask {
  clipId: string;
  clipName: string;
  profile: ProxyProfile;
  status: ProxyStatus;
  progress: number;
  error?: string;
  proxyUrl?: string;
}

export type ProxyQueueListener = (tasks: ProxyTask[]) => void;

class ProxyEngine {
  private queue: ProxyTask[] = [];
  private activeTasks = 0;
  private listeners = new Set<ProxyQueueListener>();
  private activeAbortControllers = new Map<string, AbortController>();

  constructor() {}

  /**
   * Calculates downscaled dimensions preserving original aspect ratio
   */
  getProxyDimensions(origWidth: number, origHeight: number, profile: ProxyProfile): { width: number; height: number } {
    const isPortrait = origHeight > origWidth;
    let targetLongEdge = 1280;

    switch (profile) {
      case 'low_540p':
        targetLongEdge = 960;
        break;
      case 'medium_720p':
        targetLongEdge = 1280;
        break;
      case 'high_1080p':
        targetLongEdge = 1920;
        break;
    }

    const maxOrig = Math.max(origWidth, origHeight);
    if (maxOrig <= targetLongEdge) {
      // Original is already smaller or equal to proxy size
      return { width: origWidth, height: origHeight };
    }

    const scale = targetLongEdge / maxOrig;
    let width = Math.round((origWidth * scale) / 2) * 2;
    let height = Math.round((origHeight * scale) / 2) * 2;

    return { width, height };
  }

  /**
   * Enqueues a media clip for background proxy generation
   */
  enqueueClip(clip: MediaClip, profile: ProxyProfile = 'medium_720p'): void {
    if (clip.type !== 'video') return;

    // Check if already in queue or ready
    const existing = this.queue.find(t => t.clipId === clip.id);
    if (existing) {
      if (existing.status === 'PROXY_READY' || existing.status === 'PROXY_GENERATING') return;
      existing.status = 'PROXY_QUEUED';
      existing.profile = profile;
      this.notifyListeners();
      this.processNext();
      return;
    }

    const task: ProxyTask = {
      clipId: clip.id,
      clipName: clip.name,
      profile,
      status: 'PROXY_QUEUED',
      progress: 0
    };

    this.queue.push(task);
    this.notifyListeners();
    this.processNext();
  }

  /**
   * Removes or cancels a proxy task
   */
  cancelProxy(clipId: string): void {
    const abort = this.activeAbortControllers.get(clipId);
    if (abort) {
      abort.abort();
      this.activeAbortControllers.delete(clipId);
    }

    const task = this.queue.find(t => t.clipId === clipId);
    if (task) {
      task.status = 'PROXY_ERROR';
      task.error = 'Anulowano przez użytkownika';
    }

    this.queue = this.queue.filter(t => t.clipId !== clipId);
    this.notifyListeners();
  }

  /**
   * Processes the next task in the queue respecting device concurrency
   */
  private async processNext(): Promise<void> {
    const metrics = adaptiveResourceManager.getMetrics();
    const maxConcurrency = metrics.recommendedConcurrency;

    if (this.activeTasks >= maxConcurrency) return;

    const nextTask = this.queue.find(t => t.status === 'PROXY_QUEUED');
    if (!nextTask) return;

    this.activeTasks++;
    nextTask.status = 'PROXY_GENERATING';
    this.notifyListeners();

    try {
      adaptiveResourceManager.registerWorkerStart();
      const abortController = new AbortController();
      this.activeAbortControllers.set(nextTask.clipId, abortController);

      const result = await this.renderProxyFile(nextTask, abortController.signal);

      if (result) {
        nextTask.status = 'PROXY_READY';
        nextTask.progress = 100;
        nextTask.proxyUrl = result.url;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        nextTask.status = 'PROXY_ERROR';
        nextTask.error = 'Zadanie anulowane';
      } else {
        console.warn(`[ProxyEngine] Błąd generowania proxy dla ${nextTask.clipName}:`, err);
        nextTask.status = 'PROXY_ERROR';
        nextTask.error = err?.message || 'Błąd generowania proxy';
      }
    } finally {
      this.activeTasks--;
      this.activeAbortControllers.delete(nextTask.clipId);
      adaptiveResourceManager.registerWorkerEnd();
      this.notifyListeners();
      // Continue queue
      this.processNext();
    }
  }

  /**
   * Downscales video frames onto an OffscreenCanvas/MediaRecorder or WebCodecs pipeline
   */
  private async renderProxyFile(task: ProxyTask, signal: AbortSignal): Promise<{ url: string; size: number } | null> {
    // 1. Check if proxy already exists in local IndexedDB preview cache
    const cacheKey = `proxy_${task.clipId}_${task.profile}`;
    try {
      const cachedBlob = await localIndexedDB.getMediaBlob(cacheKey);
      if (cachedBlob && cachedBlob.size > 1024) {
        const url = urlRegistry.create(cachedBlob);
        centralCacheManager.set(cacheKey, url, 'MEDIUM', cachedBlob.size);
        return { url, size: cachedBlob.size };
      }
    } catch {}

    // 2. Fetch original media source URL
    let sourceUrl: string | null = null;
    const origBlob = await localIndexedDB.getMediaBlob(task.clipId);
    if (origBlob && origBlob.size > 0) {
      sourceUrl = urlRegistry.create(origBlob);
    }

    if (!sourceUrl) {
      throw new Error('Brak lokalnego pliku źródłowego do utworzenia proxy.');
    }

    // 3. Create video element to decode and downscale
    const video = document.createElement('video');
    video.src = sourceUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('error', onError);
        reject(new Error('Nie można odczytać źródła wideo'));
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      setTimeout(() => reject(new Error('Timeout dekodowania źródła')), 20000);
    });

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const origW = video.videoWidth || 1920;
    const origH = video.videoHeight || 1080;
    const duration = video.duration || 10;
    const { width, height } = this.getProxyDimensions(origW, origH, task.profile);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) throw new Error('Nie można utworzyć kontekstu Canvas dla Proxy');

    // 4. Capture Stream with MediaRecorder
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm');

    let bitrate = 1_500_000;
    if (task.profile === 'medium_720p') bitrate = 2_800_000;
    if (task.profile === 'high_1080p') bitrate = 5_000_000;

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.start(100);

    // Fast playback / frame stepping to record proxy
    const frameIntervalSec = 1 / 30;
    const totalFrames = Math.max(1, Math.round(duration * 30));
    const stepCount = Math.min(totalFrames, 300); // Sample up to 300 representative frames or real duration

    for (let i = 0; i < stepCount; i++) {
      if (signal.aborted) {
        recorder.stop();
        throw new DOMException('Aborted', 'AbortError');
      }

      const targetTime = (i / stepCount) * duration;
      video.currentTime = targetTime;

      await new Promise<void>((r) => {
        const onSeek = () => {
          video.removeEventListener('seeked', onSeek);
          r();
        };
        video.addEventListener('seeked', onSeek);
        setTimeout(r, 60);
      });

      ctx.drawImage(video, 0, 0, width, height);

      // Throttling breathing room to maintain 60fps UI
      if (i % 15 === 0) {
        task.progress = Math.round((i / stepCount) * 95);
        this.notifyListeners();
        await new Promise(r => setTimeout(r, 4));
      }
    }

    recorder.stop();

    const proxyBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(recordedChunks, { type: mimeType }));
      };
    });

    // 5. Store Proxy Blob in IndexedDB & memory registry
    try {
      await localIndexedDB.saveMediaBlob(cacheKey, proxyBlob);
    } catch {}

    const proxyUrl = urlRegistry.create(proxyBlob);
    centralCacheManager.set(cacheKey, proxyUrl, 'MEDIUM', proxyBlob.size);

    return { url: proxyUrl, size: proxyBlob.size };
  }

  /**
   * Resolves the optimal playback URL for timeline editing & preview:
   * Returns Proxy URL if enabled and ready; otherwise returns original URL.
   */
  resolveEditingUrl(clip: MediaClip, mode: 'auto' | 'proxy' | 'original' = 'auto'): string | null {
    if (mode === 'proxy' || mode === 'auto') {
      if (clip.proxyUrl) return clip.proxyUrl;

      // Check central cache
      const cached = centralCacheManager.get<string>(`proxy_${clip.id}_medium_720p`)
        || centralCacheManager.get<string>(`proxy_${clip.id}_low_540p`);
      if (cached) return cached;
    }

    // Fallback to original object URL
    return clip.objectUrl || null;
  }

  /**
   * CRITICAL EXPORT SAFETY RULE:
   * Final rendering pipeline MUST ALWAYS resolve the original master media.
   * If the original source is unavailable, this method throws an error rather than
   * silently degrading export quality to low-resolution proxy.
   */
  resolveMasterExportSource(clip: MediaClip): { url: string; file?: File; isOriginal: boolean } {
    if (clip.file) {
      return {
        url: clip.objectUrl || urlRegistry.create(clip.file),
        file: clip.file,
        isOriginal: true
      };
    }

    if (clip.objectUrl && !clip.objectUrl.includes('proxy_')) {
      return {
        url: clip.objectUrl,
        isOriginal: true
      };
    }

    throw new Error(
      `ORIGINAL_SOURCE_MISSING: Oryginalny plik w pełnej rozdzielczości dla "${clip.name}" jest niedostępny. Eksport końcowy nie może zostać wykonany z plików proxy.`
    );
  }

  getTasks(): ProxyTask[] {
    return [...this.queue];
  }

  subscribe(listener: ProxyQueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getTasks());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const tasks = this.getTasks();
    this.listeners.forEach(fn => {
      try { fn(tasks); } catch {}
    });
  }
}

export const proxyEngine = new ProxyEngine();
