/**
 * CineForge Studio - Audio Beat Detection & Rhythmic Sync Engine
 * High-precision onset detection, tempo (BPM) extraction, and automatic beat-alignment for video editing.
 */

import type { TimelineItem, MediaClip, TimelineMarker } from '../../types/project';

export interface BeatDetectionResult {
  bpm: number;
  beatTimestamps: number[];
  downbeatTimestamps: number[];
  confidence: number;
  duration: number;
}

export type BeatSyncPacing = 'every_beat' | 'every_2nd' | 'downbeats_only' | 'dynamic_build';

/**
 * Decodes audio from various sources into an AudioBuffer
 */
async function getAudioBuffer(source: AudioBuffer | Blob | File | string): Promise<AudioBuffer> {
  if (source instanceof AudioBuffer) {
    return source;
  }

  let arrayBuffer: ArrayBuffer;
  if (typeof source === 'string') {
    const res = await fetch(source);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await source.arrayBuffer();
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser environment');
  }

  const audioCtx = new AudioContextClass();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return decoded;
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * High-performance onset energy flux detector
 * Analyzes audio energy peaks and calculates tempo (BPM) + exact beat timestamps.
 */
export async function detectBeatsAndTempos(
  source: AudioBuffer | Blob | File | string,
  onProgress?: (percent: number, msg: string) => void
): Promise<BeatDetectionResult> {
  onProgress?.(10, 'Dekodowanie strumienia audio...');
  const audioBuffer = await getAudioBuffer(source);
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const duration = audioBuffer.duration;

  onProgress?.(30, 'Analiza widmowa i filtracja transjentów perkusyjnych...');

  // Step 1: Divide into analysis frames (~10ms hops, 20ms window)
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms
  const numFrames = Math.floor((totalSamples - frameSize) / hopSize);

  if (numFrames <= 0) {
    return {
      bpm: 120,
      beatTimestamps: [],
      downbeatTimestamps: [],
      confidence: 0,
      duration
    };
  }

  // Energy envelope & spectral flux
  const energyEnvelope = new Float32Array(numFrames);
  let maxEnergy = 0;

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    let sumSquares = 0;
    for (let j = 0; j < frameSize; j += 2) {
      const val = channelData[start + j];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / (frameSize / 2));
    energyEnvelope[i] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  onProgress?.(50, 'Detekcja impulsów rytmicznych (Onset Peak Picking)...');

  // Step 2: Compute spectral novelty / first derivative
  const novelty = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    const diff = energyEnvelope[i] - energyEnvelope[i - 1];
    novelty[i] = diff > 0 ? diff : 0; // Half-wave rectification
  }

  // Step 3: Adaptive moving-average thresholding for onset peak picking
  const winRadius = 15; // ~150ms neighborhood
  const multiplier = 1.35;
  const detectedPeaks: Array<{ frame: number; time: number; energy: number }> = [];

  for (let i = winRadius; i < numFrames - winRadius; i++) {
    let localSum = 0;
    for (let k = i - winRadius; k <= i + winRadius; k++) {
      localSum += novelty[k];
    }
    const localMean = localSum / (winRadius * 2 + 1);
    const threshold = localMean * multiplier + (maxEnergy * 0.015);

    if (novelty[i] > threshold) {
      // Check if it is a local maximum
      let isLocalMax = true;
      for (let k = i - 3; k <= i + 3; k++) {
        if (novelty[k] > novelty[i]) {
          isLocalMax = false;
          break;
        }
      }

      if (isLocalMax) {
        const timeSec = (i * hopSize) / sampleRate;
        // Avoid double-detecting onsets within 180ms
        const lastPeak = detectedPeaks[detectedPeaks.length - 1];
        if (!lastPeak || (timeSec - lastPeak.time > 0.18)) {
          detectedPeaks.push({
            frame: i,
            time: timeSec,
            energy: novelty[i]
          });
        }
      }
    }
  }

  onProgress?.(70, 'Obliczanie BPM i siatki metrum...');

  // Step 4: Estimate BPM using Inter-Onset Interval (IOI) histogram
  let estimatedBpm = 120;
  let confidence = 0.5;

  if (detectedPeaks.length >= 4) {
    const intervals: number[] = [];
    for (let i = 0; i < detectedPeaks.length - 1; i++) {
      const dt = detectedPeaks[i + 1].time - detectedPeaks[i].time;
      if (dt >= 0.28 && dt <= 1.5) { // 40 BPM to 214 BPM
        intervals.push(dt);
      }
    }

    if (intervals.length > 0) {
      // Build histogram of BPM candidates in 1-BPM bins
      const bpmBins = new Map<number, number>();
      for (const dt of intervals) {
        let rawBpm = Math.round(60 / dt);
        // Normalize tempo into typical music editing range: 70 - 160 BPM
        while (rawBpm < 70) rawBpm *= 2;
        while (rawBpm > 160) rawBpm = Math.round(rawBpm / 2);

        bpmBins.set(rawBpm, (bpmBins.get(rawBpm) || 0) + 1);
        // Also increment adjacent bins for smoothing
        bpmBins.set(rawBpm - 1, (bpmBins.get(rawBpm - 1) || 0) + 0.5);
        bpmBins.set(rawBpm + 1, (bpmBins.get(rawBpm + 1) || 0) + 0.5);
      }

      let bestBpm = 120;
      let highestCount = 0;
      bpmBins.forEach((count, bpm) => {
        if (count > highestCount) {
          highestCount = count;
          bestBpm = bpm;
        }
      });

      estimatedBpm = bestBpm;
      confidence = Math.min(1.0, highestCount / (intervals.length * 0.4));
    }
  }

  onProgress?.(85, 'Generowanie znaczników bitów i mocnych uderzeń (Downbeats)...');

  // Step 5: Regularize beat grid based on detected BPM and onsets
  const beatInterval = 60 / estimatedBpm;
  const beatTimestamps: number[] = [];
  const downbeatTimestamps: number[] = [];

  // Find optimal phase anchor from the most prominent onset
  let firstStrongOnset = detectedPeaks[0]?.time || 0;
  if (detectedPeaks.length > 0) {
    const strongest = detectedPeaks.slice(0, 10).reduce((prev, curr) => curr.energy > prev.energy ? curr : prev, detectedPeaks[0]);
    // Find phase relative to 0
    firstStrongOnset = strongest.time % beatInterval;
  }

  let curTime = firstStrongOnset;
  let beatCount = 0;
  while (curTime < duration) {
    // Snap to actual detected onset if within 50ms tolerance
    const closePeak = detectedPeaks.find(p => Math.abs(p.time - curTime) < 0.055);
    const actualTime = closePeak ? closePeak.time : curTime;

    beatTimestamps.push(Number(actualTime.toFixed(3)));

    // Every 4th beat is considered a bar downbeat (4/4 time signature)
    if (beatCount % 4 === 0) {
      downbeatTimestamps.push(Number(actualTime.toFixed(3)));
    }

    beatCount++;
    curTime += beatInterval;
  }

  onProgress?.(100, `Ukończono! Wykryto ${estimatedBpm} BPM oraz ${beatTimestamps.length} punktów rytmicznych.`);

  return {
    bpm: estimatedBpm,
    beatTimestamps,
    downbeatTimestamps,
    confidence: Number(confidence.toFixed(2)),
    duration
  };
}

/**
 * Creates TimelineMarkers from detected beats for visual snap guides on the timeline
 */
export function generateBeatTimelineMarkers(
  beatTimestamps: number[],
  downbeatTimestamps: number[]
): TimelineMarker[] {
  const downbeatSet = new Set(downbeatTimestamps);
  const markers: TimelineMarker[] = [];

  beatTimestamps.forEach((time, index) => {
    const isDownbeat = downbeatSet.has(time) || (index % 4 === 0);
    markers.push({
      id: `beat_${index}_${Math.round(time * 1000)}`,
      time,
      type: 'music',
      label: isDownbeat ? 'DOWNBEAT' : 'BEAT',
      color: isDownbeat ? '#F59E0B' : '#E5A93B'
    });
  });

  return markers;
}

/**
 * Automatically cuts and aligns timeline items so cut points fall on the closest musical beats
 */
export function alignTimelineToMusicBeats(
  timelineItems: TimelineItem[],
  beatTimestamps: number[],
  pacing: BeatSyncPacing = 'every_2nd'
): { updatedItems: TimelineItem[]; alignedCount: number } {
  if (timelineItems.length === 0 || beatTimestamps.length === 0) {
    return { updatedItems: timelineItems, alignedCount: 0 };
  }

  // Filter beats based on selected pacing
  let targetBeats = [...beatTimestamps];
  if (pacing === 'every_2nd') {
    targetBeats = beatTimestamps.filter((_, idx) => idx % 2 === 0);
  } else if (pacing === 'downbeats_only') {
    targetBeats = beatTimestamps.filter((_, idx) => idx % 4 === 0);
  }

  let alignedCount = 0;
  let runningTimelineStart = 0;

  const updatedItems: TimelineItem[] = [];

  for (let i = 0; i < timelineItems.length; i++) {
    const item = timelineItems[i];
    const isLast = i === timelineItems.length - 1;

    // Ideal duration target for this item based on beat grid
    const targetEndEstimate = runningTimelineStart + item.duration;

    // Find closest target beat timestamp after runningTimelineStart
    let closestBeat = targetBeats.find(b => b > runningTimelineStart + 0.6 && Math.abs(b - targetEndEstimate) < 2.0);

    if (!closestBeat) {
      // Find the nearest beat that is at least 0.8s away
      const candidateBeats = targetBeats.filter(b => b >= runningTimelineStart + 0.8);
      if (candidateBeats.length > 0) {
        closestBeat = candidateBeats.reduce((prev, curr) => 
          Math.abs(curr - targetEndEstimate) < Math.abs(prev - targetEndEstimate) ? curr : prev
        );
      }
    }

    let effectiveDuration = item.duration;
    if (closestBeat && closestBeat > runningTimelineStart) {
      const beatDuration = closestBeat - runningTimelineStart;
      if (beatDuration >= 0.5 && beatDuration <= (item.sourceEnd - item.sourceStart) * 2.5) {
        effectiveDuration = Number(beatDuration.toFixed(3));
        alignedCount++;
      }
    }

    const speed = item.speed || 1.0;
    const newSourceEnd = item.sourceStart + (effectiveDuration * speed);

    updatedItems.push({
      ...item,
      timelineStart: Number(runningTimelineStart.toFixed(3)),
      duration: effectiveDuration,
      sourceEnd: Number(newSourceEnd.toFixed(3))
    });

    runningTimelineStart += effectiveDuration;
  }

  return { updatedItems, alignedCount };
}

/**
 * Creates a brand new rhythmic sequence from media library clips cut to music beats
 */
export function createRhythmicAutoCutFromClips(
  clips: MediaClip[],
  beatTimestamps: number[],
  pacing: BeatSyncPacing = 'every_2nd',
  maxClips?: number
): TimelineItem[] {
  if (clips.length === 0 || beatTimestamps.length === 0) return [];

  // Filter beats according to pacing
  let syncBeats = beatTimestamps;
  if (pacing === 'every_2nd') {
    syncBeats = beatTimestamps.filter((_, idx) => idx % 2 === 0);
  } else if (pacing === 'downbeats_only') {
    syncBeats = beatTimestamps.filter((_, idx) => idx % 4 === 0);
  }

  const selectedClips = maxClips ? clips.slice(0, maxClips) : clips;
  const newTimelineItems: TimelineItem[] = [];

  let currentTimelineStart = 0;
  let beatIndex = 0;

  for (let i = 0; i < selectedClips.length; i++) {
    const clip = selectedClips[i % selectedClips.length];
    
    // Determine beat segment duration
    const currentBeat = syncBeats[beatIndex] || currentTimelineStart;
    const nextBeat = syncBeats[beatIndex + 1] || (currentBeat + 2.0);
    
    let segmentDuration = Math.max(0.6, nextBeat - currentBeat);
    if (pacing === 'dynamic_build') {
      // Accelerate cuts as sequence progresses (4 beats -> 2 beats -> 1 beat)
      const prog = i / selectedClips.length;
      if (prog > 0.7) {
        segmentDuration = Math.max(0.5, segmentDuration * 0.5);
      } else if (prog < 0.3) {
        segmentDuration = segmentDuration * 1.5;
      }
    }

    const usableStart = clip.analysis?.recommendedStart ?? 0;
    const usableEnd = Math.min(clip.duration, usableStart + segmentDuration);
    const finalDuration = Math.max(0.5, usableEnd - usableStart);

    newTimelineItems.push({
      id: `item_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      clipId: clip.id,
      trackId: 'track_video_main',
      sourceStart: Number(usableStart.toFixed(2)),
      sourceEnd: Number(usableEnd.toFixed(2)),
      timelineStart: Number(currentTimelineStart.toFixed(3)),
      duration: Number(finalDuration.toFixed(3)),
      speed: 1.0,
      volume: 1.0,
      fadeIn: i === 0 ? 0.4 : 0,
      fadeOut: i === selectedClips.length - 1 ? 0.6 : 0,
      muted: false,
      scale: 1.0,
      rotation: 0,
      transitionIn: i > 0 ? (i % 3 === 0 ? 'dissolve' : 'cut') : 'fade',
      transitionOut: 'cut',
      transitionDuration: 0.3
    });

    currentTimelineStart += finalDuration;
    beatIndex++;
  }

  return newTimelineItems;
}
