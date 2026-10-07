import { ClipOrientation } from '../../types/project';
import { urlRegistry } from './urlRegistry';
import { thumbnailCache } from './thumbnailCache';

export interface ProbedMediaMetadata {
  duration: number;
  width: number;
  height: number;
  orientation: ClipOrientation;
  aspectRatio: string;
  fps: number;
  hasAudio: boolean;
  thumbnailUrl?: string;
  thumbnailBlob?: Blob;
  size: number;
  bitrate?: number; // bps
  resolutionLabel?: string; // e.g. "4K UHD", "1080p FHD"
}

/**
 * Formats duration into SMPTE-like HH:MM:SS or MM:SS.ms
 */
export function formatTimecode(seconds: number, includeMs: boolean = false): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  if (includeMs) {
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats file size in B, KB, MB, GB
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Formats bitrate in kbps or Mbps
 */
export function formatBitrate(bps?: number): string {
  if (!bps || bps <= 0) return 'N/A';
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1000)} kbps`;
}

/**
 * Returns human-readable resolution tier
 */
export function getResolutionTier(width: number, height: number): string {
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 3800 || minDim >= 2100) return '4K UHD';
  if (maxDim >= 2500 || minDim >= 1400) return '2.7K QHD';
  if (maxDim >= 1900 || minDim >= 1000) return '1080p FHD';
  if (maxDim >= 1200 || minDim >= 700) return '720p HD';
  return `${width}×${height}`;
}

/**
 * Calculates simplified aspect ratio string like "16:9", "9:16", "4:3", "1:1"
 */
export function calculateAspectRatioString(width: number, height: number): string {
  if (!width || !height) return '16:9';
  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.08) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.08) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.08) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.08) return '3:4';
  if (Math.abs(ratio - 1) < 0.08) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.1) return '21:9';

  return ratio > 1 ? '16:9' : '9:16';
}

/**
 * Generates a fast compressed thumbnail and probes exact metadata from video
 */
export async function probeVideoMetadata(fileOrBlobOrUrl: Blob | File | string, knownSize?: number): Promise<ProbedMediaMetadata> {
  const isStringUrl = typeof fileOrBlobOrUrl === 'string';
  const objectUrl = isStringUrl ? fileOrBlobOrUrl : urlRegistry.create(fileOrBlobOrUrl);
  const fileSize = isStringUrl ? (knownSize || 0) : fileOrBlobOrUrl.size;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    if (typeof objectUrl === 'string' && (objectUrl.startsWith('http://') || objectUrl.startsWith('https://') || objectUrl.startsWith('/'))) {
      video.crossOrigin = 'anonymous';
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      console.warn('[MetadataProber] Video probe timed out for large file, applying resilient fallback metadata.');
      resolve({
        width: 1920,
        height: 1080,
        duration: 10,
        orientation: 'landscape',
        aspectRatio: '16:9',
        fps: 30,
        hasAudio: true,
        size: fileSize,
        resolutionLabel: '1080p FHD'
      });
    }, 45000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.src = '';
      video.load();
      if (!isStringUrl) {
        urlRegistry.release(objectUrl);
      }
    };

    video.onerror = () => {
      cleanup();
      // Provide resilient fallback metadata rather than failing user import
      console.warn('[MetadataProber] Video element codec check notice, generating fallback profile.');
      resolve({
        width: 1920,
        height: 1080,
        duration: 10,
        orientation: 'landscape',
        aspectRatio: '16:9',
        fps: 30,
        hasAudio: true,
        size: fileSize,
        resolutionLabel: '1080p FHD'
      });
    };

    // Helper to resolve real finite duration (handles Chromium Infinity bug on WebM / streamed MP4 & Google Drive streams)
    const resolveFiniteDuration = async (): Promise<number> => {
      const rawDur = video.duration;
      if (typeof rawDur === 'number' && Number.isFinite(rawDur) && !isNaN(rawDur) && rawDur > 0.1) {
        return rawDur;
      }

      return new Promise<number>((res) => {
        let isDone = false;
        const complete = (val: number) => {
          if (!isDone) {
            isDone = true;
            video.removeEventListener('durationchange', check);
            video.removeEventListener('timeupdate', check);
            video.removeEventListener('canplay', check);
            res(Math.max(0.1, val));
          }
        };

        const check = () => {
          const testDur = video.duration;
          if (typeof testDur === 'number' && Number.isFinite(testDur) && !isNaN(testDur) && testDur > 0.1) {
            complete(testDur);
            return;
          }
          try {
            if (video.seekable && video.seekable.length > 0) {
              const end = video.seekable.end(video.seekable.length - 1);
              if (Number.isFinite(end) && end > 0.1) {
                complete(end);
                return;
              }
            }
          } catch (e) {}
        };

        video.addEventListener('durationchange', check);
        video.addEventListener('timeupdate', check);
        video.addEventListener('canplay', check);

        // Force Chromium duration calculation trick for streamed media (seek to large number)
        try {
          if (video.duration === Infinity || isNaN(video.duration)) {
            video.currentTime = 1e101;
          } else {
            video.currentTime = 0.05;
          }
        } catch (e) {}

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          check();
          const d = video.duration;
          if (typeof d === 'number' && Number.isFinite(d) && !isNaN(d) && d > 0.1) {
            clearInterval(interval);
            complete(d);
          } else if (attempts >= 15) {
            clearInterval(interval);
            try {
              if (video.seekable && video.seekable.length > 0) {
                const end = video.seekable.end(video.seekable.length - 1);
                if (Number.isFinite(end) && end > 0.1) {
                  complete(end);
                  return;
                }
              }
            } catch (e) {}
            // Final fallback: reset currentTime to 0 and resolve if duration becomes available
            const finalDur = video.duration;
            complete(typeof finalDur === 'number' && Number.isFinite(finalDur) && finalDur > 0.1 ? finalDur : 10);
          }
        }, 200);
      });
    };

    video.onloadedmetadata = async () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const resolvedDuration = await resolveFiniteDuration();
      const duration = Math.max(0.1, Math.round(resolvedDuration * 10) / 10);
      const orientation: ClipOrientation = height > width ? 'portrait' : (width === height ? 'square' : 'landscape');
      const aspectRatio = calculateAspectRatioString(width, height);

      // Web Audio / HTML5 audio check
      let hasAudio = true;
      if ((video as any).mozHasAudio !== undefined) {
        hasAudio = Boolean((video as any).mozHasAudio);
      } else if ((video as any).audioTracks && (video as any).audioTracks.length > 0) {
        hasAudio = true;
      } else if ((video as any).webkitAudioDecodedByteCount !== undefined && (video as any).webkitAudioDecodedByteCount > 0) {
        hasAudio = true;
      } else {
        // Standard video recordings from smartphones and cameras contain audio tracks. Default to true so audio is preserved.
        hasAudio = true;
      }

      const calculatedBitrate = fileSize > 0 && duration > 0 ? Math.round((fileSize * 8) / duration) : undefined;
      const resolutionLabel = getResolutionTier(width, height);

      // Capture high-quality non-black thumbnail via intelligent cache
      try {
        const thumbResult = await thumbnailCache.captureOptimalThumbnail(video, duration);
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio,
          thumbnailUrl: thumbResult?.url,
          thumbnailBlob: thumbResult?.blob,
          size: fileSize,
          bitrate: calculatedBitrate,
          resolutionLabel
        });
      } catch (e) {
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio,
          size: fileSize,
          bitrate: calculatedBitrate,
          resolutionLabel
        });
      }
    };

    video.src = objectUrl;
  });
}

/**
 * Probes photo/image metadata and generates thumbnail
 */
export async function probeImageMetadata(fileOrBlob: Blob | File): Promise<ProbedMediaMetadata> {
  const objectUrl = urlRegistry.create(fileOrBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Przekroczono limit czasu analizy zdjęcia.'));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      urlRegistry.release(objectUrl);
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Nie udało się wczytać pliku graficznego.'));
    };

    img.onload = () => {
      const width = img.naturalWidth || 1920;
      const height = img.naturalHeight || 1080;
      const duration = 5; // Default 5 seconds for photo on timeline
      const orientation: ClipOrientation = height > width ? 'portrait' : (width === height ? 'square' : 'landscape');
      const aspectRatio = calculateAspectRatioString(width, height);

      // Create compressed thumbnail
      const canvas = document.createElement('canvas');
      const thumbWidth = 320;
      const thumbHeight = Math.round((height / width) * thumbWidth);
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
        canvas.toBlob((thumbBlob) => {
          let thumbUrl: string | undefined = undefined;
          if (thumbBlob) {
            thumbUrl = urlRegistry.create(thumbBlob);
          }
          cleanup();
          resolve({
            duration,
            width,
            height,
            orientation,
            aspectRatio,
            fps: 30,
            hasAudio: false,
            thumbnailUrl: thumbUrl,
            thumbnailBlob: thumbBlob || undefined,
            size: fileOrBlob.size
          });
        }, 'image/jpeg', 0.75);
      } else {
        cleanup();
        resolve({
          duration,
          width,
          height,
          orientation,
          aspectRatio,
          fps: 30,
          hasAudio: false,
          size: fileOrBlob.size
        });
      }
    };

    img.src = objectUrl;
  });
}
