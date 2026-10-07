/**
 * CineForge Studio - Smart Cut & Silence Detection Engine
 * High-performance audio analysis calculating RMS/Peak dB to detect silences,
 * pauses, and generate frame-accurate Ripple Trim cuts for video timeline clips.
 */

import type { TimelineItem } from '../../types/project';

export interface SilenceRegion {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  duration: number; // in seconds
  averageDb: number;
}

export interface SpeechRegion {
  id: string;
  start: number;
  end: number;
  duration: number;
}

export interface SmartCutAnalysisOptions {
  silenceThresholdDb?: number; // default: -38 dB
  minSilenceDurationSec?: number; // default: 0.45s
  padBeforeSec?: number; // keep breathing room before speech (default: 0.08s)
  padAfterSec?: number;  // keep breathing room after speech (default: 0.12s)
  windowSizeMs?: number; // analysis frame size in ms (default: 25ms)
}

export interface SmartCutResult {
  totalDuration: number;
  silenceRegions: SilenceRegion[];
  speechRegions: SpeechRegion[];
  totalSilenceDuration: number;
  totalSpeechDuration: number;
  silencePercentage: number;
  suggestedTimelineSplits: number[];
}

export class SmartCutAnalyzer {
  /**
   * Analyzes an AudioBuffer and detects all silent intervals and speech segments
   */
  public static analyzeAudioBuffer(
    audioBuffer: AudioBuffer,
    options: SmartCutAnalysisOptions = {}
  ): SmartCutResult {
    const {
      silenceThresholdDb = -38,
      minSilenceDurationSec = 0.45,
      padBeforeSec = 0.08,
      padAfterSec = 0.12,
      windowSizeMs = 25
    } = options;

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;
    const totalDuration = audioBuffer.duration;

    const windowSamples = Math.max(64, Math.floor((windowSizeMs / 1000) * sampleRate));
    const totalWindows = Math.floor(totalSamples / windowSamples);

    // Extract audio channel data
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    // Compute RMS and dB per window
    const windowDbValues = new Float32Array(totalWindows);

    for (let w = 0; w < totalWindows; w++) {
      const startIdx = w * windowSamples;
      const endIdx = Math.min(totalSamples, startIdx + windowSamples);
      let sumSquares = 0;
      let count = 0;

      for (let i = startIdx; i < endIdx; i++) {
        for (let c = 0; c < channels; c++) {
          const val = channelData[c][i];
          sumSquares += val * val;
          count++;
        }
      }

      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      // Convert RMS to dBFS (0 dB is maximum peak, silence approaches -infinity)
      const db = rms > 0.000001 ? 20 * Math.log10(rms) : -100;
      windowDbValues[w] = db;
    }

    // Detect continuous silence intervals
    const rawSilenceRegions: Array<{ startWin: number; endWin: number; avgDb: number }> = [];
    let inSilence = false;
    let silenceStartWin = 0;
    let dbAccum = 0;
    let dbCount = 0;

    for (let w = 0; w < totalWindows; w++) {
      const isSilent = windowDbValues[w] < silenceThresholdDb;

      if (isSilent) {
        if (!inSilence) {
          inSilence = true;
          silenceStartWin = w;
          dbAccum = windowDbValues[w];
          dbCount = 1;
        } else {
          dbAccum += windowDbValues[w];
          dbCount++;
        }
      } else {
        if (inSilence) {
          inSilence = false;
          const duration = ((w - silenceStartWin) * windowSamples) / sampleRate;
          if (duration >= minSilenceDurationSec) {
            rawSilenceRegions.push({
              startWin: silenceStartWin,
              endWin: w,
              avgDb: dbCount > 0 ? dbAccum / dbCount : -100
            });
          }
        }
      }
    }

    if (inSilence) {
      const duration = ((totalWindows - silenceStartWin) * windowSamples) / sampleRate;
      if (duration >= minSilenceDurationSec) {
        rawSilenceRegions.push({
          startWin: silenceStartWin,
          endWin: totalWindows,
          avgDb: dbCount > 0 ? dbAccum / dbCount : -100
        });
      }
    }

    // Convert windows to seconds with safety padding
    const silenceRegions: SilenceRegion[] = [];
    for (let i = 0; i < rawSilenceRegions.length; i++) {
      const r = rawSilenceRegions[i];
      let rawStart = (r.startWin * windowSamples) / sampleRate;
      let rawEnd = (r.endWin * windowSamples) / sampleRate;

      // Apply padding (avoid clipping ends/starts of words)
      const paddedStart = Math.min(rawEnd, rawStart + padAfterSec);
      const paddedEnd = Math.max(paddedStart, rawEnd - padBeforeSec);
      const duration = paddedEnd - paddedStart;

      if (duration >= 0.2) {
        silenceRegions.push({
          id: `silence_${i}_${Math.round(paddedStart * 100)}`,
          start: paddedStart,
          end: paddedEnd,
          duration,
          averageDb: Math.round(r.avgDb * 10) / 10
        });
      }
    }

    // Build speech regions from non-silent areas
    const speechRegions: SpeechRegion[] = [];
    let currentPos = 0;

    for (let i = 0; i < silenceRegions.length; i++) {
      const sil = silenceRegions[i];
      if (sil.start > currentPos + 0.1) {
        speechRegions.push({
          id: `speech_${i}_${Math.round(currentPos * 100)}`,
          start: currentPos,
          end: sil.start,
          duration: sil.start - currentPos
        });
      }
      currentPos = sil.end;
    }

    if (currentPos < totalDuration - 0.1) {
      speechRegions.push({
        id: `speech_end_${Math.round(currentPos * 100)}`,
        start: currentPos,
        end: totalDuration,
        duration: totalDuration - currentPos
      });
    }

    const totalSilenceDuration = silenceRegions.reduce((sum, r) => sum + r.duration, 0);
    const totalSpeechDuration = Math.max(0, totalDuration - totalSilenceDuration);
    const silencePercentage = totalDuration > 0 ? (totalSilenceDuration / totalDuration) * 100 : 0;

    // Collect suggested timeline split timestamps
    const splitPoints = new Set<number>();
    for (const sil of silenceRegions) {
      if (sil.start > 0.2) splitPoints.add(Math.round(sil.start * 100) / 100);
      if (sil.end < totalDuration - 0.2) splitPoints.add(Math.round(sil.end * 100) / 100);
    }

    return {
      totalDuration,
      silenceRegions,
      speechRegions,
      totalSilenceDuration,
      totalSpeechDuration,
      silencePercentage: Math.round(silencePercentage * 10) / 10,
      suggestedTimelineSplits: Array.from(splitPoints).sort((a, b) => a - b)
    };
  }

  /**
   * Applies Ripple Trim on an existing TimelineItem based on detected speech segments,
   * returning an array of non-silent sub-clips properly aligned on the timeline.
   */
  public static generateRippleTrimmedItems(
    originalItem: TimelineItem,
    analysis: SmartCutResult
  ): TimelineItem[] {
    const speechSegments = analysis.speechRegions;
    if (speechSegments.length === 0) return [originalItem];

    const resultItems: TimelineItem[] = [];
    let currentTimelineStart = originalItem.timelineStart;

    for (let i = 0; i < speechSegments.length; i++) {
      const seg = speechSegments[i];
      const sourceStart = originalItem.sourceStart + seg.start;
      const duration = seg.duration;

      if (duration < 0.2) continue;

      resultItems.push({
        ...originalItem,
        id: `${originalItem.id}_smartcut_${i}_${Date.now()}`,
        timelineStart: currentTimelineStart,
        sourceStart,
        duration,
        name: `${originalItem.name || 'Klip'} [Mowa #${i + 1}]`
      });

      currentTimelineStart += duration;
    }

    return resultItems.length > 0 ? resultItems : [originalItem];
  }
}
