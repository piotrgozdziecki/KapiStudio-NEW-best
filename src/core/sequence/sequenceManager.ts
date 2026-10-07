/**
 * Sequence Manager & Smart Reflow Engine (ETAP 2)
 * 
 * Manages multiple sequences per project (Master 16:9, Shorts 9:16, Reel, Trailer, Archive Cut):
 * - Sequences share the exact same media library without copying binary blobs
 * - Smart Reflow: automatically converts aspect ratio (16:9 -> 9:16 -> 1:1) with adaptive framing
 * - Preserves exact frame cut points, transitions, audio tracks, subtitles, and markers
 */

import { ProjectSequence, TimelineItem, FitMode } from '../../types/project';

export class SequenceManager {
  /**
   * Creates a fresh sequence
   */
  static createSequence(
    name: string,
    aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1' = '16:9',
    initialItems: TimelineItem[] = []
  ): ProjectSequence {
    return {
      id: `seq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      aspectRatio,
      targetResolution: aspectRatio === '9:16' ? '1080p' : '4k',
      targetFps: 30,
      tracks: [
        { id: 'v1', type: 'video', name: 'Wideo V1', muted: false, locked: false, hidden: false, volume: 1.0 },
        { id: 'v2', type: 'video', name: 'Wideo V2 (B-Roll)', muted: false, locked: false, hidden: false, volume: 1.0 },
        { id: 'a1', type: 'audio', name: 'Audio A1 (Muzyka)', muted: false, locked: false, hidden: false, volume: 1.0 },
        { id: 'a2', type: 'voiceover', name: 'Lektor A2', muted: false, locked: false, hidden: false, volume: 1.0 },
        { id: 'sub', type: 'text', name: 'Napisy', muted: false, locked: false, hidden: false, volume: 1.0 }
      ],
      timelineItems: [...initialItems],
      audioTracks: [],
      textLayers: [],
      markers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Duplicates an existing sequence without copying media
   */
  static duplicateSequence(
    sourceSequence: ProjectSequence,
    newName?: string
  ): ProjectSequence {
    return {
      ...sourceSequence,
      id: `seq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: newName || `${sourceSequence.name} (Kopia)`,
      timelineItems: sourceSequence.timelineItems.map(item => ({
        ...item,
        id: `ti_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      })),
      audioTracks: sourceSequence.audioTracks.map(track => ({
        ...track,
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      })),
      textLayers: sourceSequence.textLayers.map(tl => ({
        ...tl,
        id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      })),
      markers: [...sourceSequence.markers],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Smart Reflow: converts a sequence from 16:9 to 9:16 / 1:1
   * Recalculates framing and focal point while preserving every cut point, audio, and marker.
   */
  static smartReflow(
    sourceSequence: ProjectSequence,
    targetAspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1',
    reflowName?: string
  ): ProjectSequence {
    const duplicated = this.duplicateSequence(
      sourceSequence,
      reflowName || `${sourceSequence.name} [${targetAspectRatio}]`
    );

    duplicated.aspectRatio = targetAspectRatio;
    duplicated.targetResolution = targetAspectRatio === '9:16' ? '1080p' : '4k';

    // Recalculate framing for each timeline item
    duplicated.timelineItems = duplicated.timelineItems.map(item => {
      let smartFit: FitMode = item.fitMode || 'fit';
      let smartCropFocus: 'center' | 'top' | 'face_safe' | 'manual' = 'center';

      // For vertical Reels/TikTok (9:16)
      if (targetAspectRatio === '9:16') {
        smartFit = 'fill';
        smartCropFocus = 'face_safe';
      } else if (targetAspectRatio === '1:1') {
        smartFit = 'fill';
        smartCropFocus = 'center';
      }

      return {
        ...item,
        fitMode: smartFit,
        smartCropFocus
      };
    });

    // Adjust text subtitle positioning for new aspect ratio
    duplicated.textLayers = duplicated.textLayers.map(tl => {
      if (targetAspectRatio === '9:16') {
        return {
          ...tl,
          position: { x: 0.5, y: Math.min(0.78, tl.position?.y || 0.8) },
          fontSize: Math.max(16, Math.min(32, tl.fontSize * 1.15))
        };
      }
      return tl;
    });

    return duplicated;
  }
}
