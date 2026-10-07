/**
 * Professional Audio Engine (ETAP 2)
 * 
 * Expands existing audio capabilities:
 * - Waveform caching: computed once and cached, eliminating repetitive decode
 * - Audio Keyframes: non-destructive volume points over time
 * - Voice Ducking: automatically lowers background music whenever voice-over or dialogue is active
 * - Auto-Level Normalization: calculates peak gain factor without modifying original source files
 */

import { AudioTrackItem } from '../../types/project';
import { centralCacheManager } from '../cache/cacheManager';
import { getOrGenerateWaveform } from './waveformGenerator';

export interface AudioKeyframe {
  time: number; // in seconds
  volume: number; // 0.0 to 2.0 (1.0 = 100%)
}

export class AudioEngine {
  /**
   * Computes the effective volume at a specific timeline second using linear interpolation between keyframes
   */
  static getVolumeAtTime(
    baseVolume: number,
    keyframes: AudioKeyframe[] | undefined,
    currentTimeSec: number
  ): number {
    if (!keyframes || keyframes.length === 0) {
      return baseVolume;
    }

    // Sort keyframes by time
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);

    // If before first keyframe
    if (currentTimeSec <= sorted[0].time) {
      return sorted[0].volume;
    }

    // If after last keyframe
    if (currentTimeSec >= sorted[sorted.length - 1].time) {
      return sorted[sorted.length - 1].volume;
    }

    // Find surrounding keyframe pair
    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i];
      const k2 = sorted[i + 1];

      if (currentTimeSec >= k1.time && currentTimeSec <= k2.time) {
        const span = k2.time - k1.time;
        if (span <= 0) return k1.volume;
        const progress = (currentTimeSec - k1.time) / span;
        return k1.volume + progress * (k2.volume - k1.volume);
      }
    }

    return baseVolume;
  }

  /**
   * Voice Ducking: calculates dynamic music volume reduction when voiceover is present
   */
  static computeDuckedMusicVolume(
    baseMusicVolume: number,
    voiceTracks: AudioTrackItem[],
    currentTimeSec: number,
    duckingAmountPct: number = 60 // 60% default reduction
  ): number {
    if (voiceTracks.length === 0 || duckingAmountPct <= 0) {
      return baseMusicVolume;
    }

    let isVoiceActive = false;

    for (const vt of voiceTracks) {
      if (vt.muted) continue;
      const vStart = vt.timelineStart;
      const vEnd = vt.timelineStart + vt.duration;

      // Check if current playhead is within voiceover interval with smooth attack/release padding
      if (currentTimeSec >= vStart - 0.2 && currentTimeSec <= vEnd + 0.3) {
        isVoiceActive = true;
        break;
      }
    }

    if (!isVoiceActive) {
      return baseMusicVolume;
    }

    const reductionFactor = (100 - Math.min(95, duckingAmountPct)) / 100;
    return baseMusicVolume * reductionFactor;
  }

  /**
   * Fetches waveform from central cache or calculates once
   */
  static async getCachedWaveform(
    trackId: string,
    sourceUrlOrBlob: string | Blob,
    sampleCount: number = 64
  ): Promise<number[]> {
    const cacheKey = `wf_${trackId}_${sampleCount}`;
    const cached = centralCacheManager.get<number[]>(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    const wave = await getOrGenerateWaveform(sourceUrlOrBlob, cacheKey, sampleCount);
    centralCacheManager.set(cacheKey, wave, 'MEDIUM', wave.length * 8);
    return wave;
  }

  /**
   * Approximate Auto-Level normalization factor
   * Returns suggested volume multiplier without touching original file
   */
  static calculateNormalizationGain(waveform: number[]): { gainMultiplier: number; isApproximate: boolean } {
    if (!waveform || waveform.length === 0) {
      return { gainMultiplier: 1.0, isApproximate: true };
    }

    const peak = Math.max(0.01, ...waveform);
    // Target peak at ~0.9 (-1 dBFS headroom)
    const suggestedGain = Math.min(2.0, Math.max(0.5, 0.9 / peak));
    return {
      gainMultiplier: Math.round(suggestedGain * 100) / 100,
      isApproximate: true
    };
  }
}
