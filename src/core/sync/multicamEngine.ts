/**
 * Multi-Cam Engine & Automatic Media Synchronization (ETAP 2)
 * 
 * Provides professional multi-camera angle synchronization and switching:
 * - Angles: CAM 1, CAM 2, CAM 3, CAM 4...
 * - Auto-sync via Audio Waveform Correlation, Creation Timestamp, or Manual Offset
 * - Confidence scoring: HIGH, MEDIUM, LOW
 * - Low confidence never applies automatically without user confirmation
 * - Angle switching during playback without re-rendering original files
 */

import { MediaClip, MultiCamAngle, TimelineItem } from '../../types/project';
import { getOrGenerateWaveform } from '../audio/waveformGenerator';

export interface MultiCamSyncResult {
  referenceClipId: string;
  angles: MultiCamAngle[];
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  diagnosticNotes: string[];
}

export class MultiCamEngine {
  /**
   * Synchronizes multiple camera angles against a reference angle
   */
  static async syncClips(
    clips: MediaClip[],
    referenceClipIndex: number = 0,
    preferredMethod: 'audio_waveform' | 'timestamp' = 'audio_waveform'
  ): Promise<MultiCamSyncResult> {
    if (clips.length < 2) {
      throw new Error('Do synchronizacji wielokamerowej wymagane są co najmniej 2 ujęcia.');
    }

    const refClip = clips[referenceClipIndex] || clips[0];
    const angles: MultiCamAngle[] = [];
    const notes: string[] = [];

    // Reference angle is always 0 offset with HIGH confidence
    angles.push({
      id: `cam_0`,
      name: `Kamera 1 (Baza: ${refClip.name})`,
      clipId: refClip.id,
      offsetSeconds: 0,
      syncConfidence: 'HIGH',
      syncMethod: 'manual'
    });

    let highCount = 1;
    let lowCount = 0;

    // Try synchronizing subsequent angles
    for (let i = 1; i < clips.length; i++) {
      const targetClip = clips[i];
      let offset = 0;
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      let method: 'audio_waveform' | 'timestamp' | 'timecode' = preferredMethod;

      if (preferredMethod === 'audio_waveform' && refClip.hasAudio !== false && targetClip.hasAudio !== false) {
        try {
          const syncData = await this.correlateAudioWaveforms(refClip, targetClip);
          offset = syncData.offsetSeconds;
          confidence = syncData.confidence;
          notes.push(`Kamera ${i + 1} (${targetClip.name}): audio-sync przesunięcie ${offset.toFixed(2)}s (Pewność: ${confidence})`);
        } catch (e) {
          // Fallback to timestamp
          method = 'timestamp';
        }
      }

      if (method === 'timestamp' || confidence === 'LOW') {
        const timeRef = new Date(refClip.capturedAt || refClip.createdAt).getTime();
        const timeTarget = new Date(targetClip.capturedAt || targetClip.createdAt).getTime();

        if (!isNaN(timeRef) && !isNaN(timeTarget)) {
          const deltaSec = (timeTarget - timeRef) / 1000;
          offset = deltaSec;
          confidence = Math.abs(deltaSec) < 3600 ? 'MEDIUM' : 'LOW';
          notes.push(`Kamera ${i + 1} (${targetClip.name}): timestamp-sync przesunięcie ${offset.toFixed(2)}s (Pewność: ${confidence})`);
        }
      }

      if (confidence === 'HIGH') highCount++;
      if (confidence === 'LOW') lowCount++;

      angles.push({
        id: `cam_${i}`,
        name: `Kamera ${i + 1} (${targetClip.name})`,
        clipId: targetClip.id,
        offsetSeconds: Math.round(offset * 100) / 100,
        syncConfidence: confidence,
        syncMethod: method
      });
    }

    const overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      lowCount > 0 ? 'LOW' : (highCount === clips.length ? 'HIGH' : 'MEDIUM');

    return {
      referenceClipId: refClip.id,
      angles,
      overallConfidence,
      diagnosticNotes: notes
    };
  }

  /**
   * Cross-correlates audio waveforms of two clips to compute time lag
   */
  private static async correlateAudioWaveforms(
    clipA: MediaClip,
    clipB: MediaClip
  ): Promise<{ offsetSeconds: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }> {
    const urlA = clipA.objectUrl || clipA.thumbnailUrl;
    const urlB = clipB.objectUrl || clipB.thumbnailUrl;

    if (!urlA || !urlB) {
      return { offsetSeconds: 0, confidence: 'LOW' };
    }

    // Extract 128-point waveform samples
    const waveA = await getOrGenerateWaveform(urlA, `sync_${clipA.id}`, 128);
    const waveB = await getOrGenerateWaveform(urlB, `sync_${clipB.id}`, 128);

    if (waveA.length === 0 || waveB.length === 0) {
      return { offsetSeconds: 0, confidence: 'LOW' };
    }

    let maxCorrelation = -Infinity;
    let bestLag = 0;
    const maxLag = Math.min(64, Math.floor(waveA.length / 2));

    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let sum = 0;
      let count = 0;

      for (let i = 0; i < waveA.length; i++) {
        const j = i + lag;
        if (j >= 0 && j < waveB.length) {
          sum += waveA[i] * waveB[j];
          count++;
        }
      }

      if (count > 10) {
        const avg = sum / count;
        if (avg > maxCorrelation) {
          maxCorrelation = avg;
          bestLag = lag;
        }
      }
    }

    // Estimate seconds per sample
    const sampleDurationSec = Math.max(0.1, (clipA.duration || 10) / waveA.length);
    const offsetSeconds = bestLag * sampleDurationSec;

    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (maxCorrelation > 0.45) confidence = 'HIGH';
    else if (maxCorrelation > 0.25) confidence = 'MEDIUM';

    return { offsetSeconds, confidence };
  }
}
