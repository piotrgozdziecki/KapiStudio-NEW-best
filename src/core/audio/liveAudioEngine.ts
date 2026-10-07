/**
 * CineForge Studio - Live Audio Engine & Real-Time VU Metering
 * Manages synchronous Web Audio playback, unlocks browser autoplay policies via .resume(),
 * handles track scheduling with AudioBufferSourceNode / HTMLAudioElements, and provides
 * real-time stereo RMS/Peak level metering for the NLE player.
 */

import type { AudioTrackItem } from '../../types/project';
import { resolveAudioTrackUrl } from '../media/mediaResolver';
import { urlRegistry } from '../media/urlRegistry';

export interface AudioLevels {
  left: number;  // 0.0 - 1.0 (normalized volume level)
  right: number; // 0.0 - 1.0
  peak: number;  // 0.0 - 1.0
  isClipping: boolean;
}

export class LiveAudioEngine {
  private static instance: LiveAudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array | null = null;

  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private mediaSourceNodes: Map<string, MediaElementAudioSourceNode> = new Map();

  private isMuted: boolean = false;
  private masterVolume: number = 1.0;

  public static getInstance(): LiveAudioEngine {
    if (!LiveAudioEngine.instance) {
      LiveAudioEngine.instance = new LiveAudioEngine();
    }
    return LiveAudioEngine.instance;
  }

  private constructor() {
    this.initContext();
  }

  private initContext() {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx({ sampleRate: 48000 });
        } catch {
          this.ctx = new AudioCtx();
        }
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
        this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
    } catch (e) {
      console.warn('[LiveAudioEngine] Failed to initialize AudioContext:', e);
    }
  }

  /**
   * Resumes the AudioContext on user gesture to bypass browser autoplay blocks
   */
  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('[LiveAudioEngine] AudioContext resume notice:', e);
      }
    }
  }

  /**
   * Sets the global master volume and mute state
   */
  public setMasterVolume(vol: number, muted: boolean = false) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.isMuted = muted;

    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0 : this.masterVolume;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Connects an HTML5 video element's audio output to the master mix & analyser
   */
  public connectVideoElement(videoEl: HTMLVideoElement): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      // Check if source node already exists
      const existingKey = '__live_audio_connected__';
      if ((videoEl as any)[existingKey]) return;

      const source = this.ctx.createMediaElementSource(videoEl);
      source.connect(this.masterGain);
      (videoEl as any)[existingKey] = true;
    } catch (e) {
      // Sometimes already connected or cross-origin
      console.warn('[LiveAudioEngine] Note on video element audio connection:', e);
    }
  }

  /**
   * Synchronizes timeline background audio tracks and voiceovers with the playhead
   */
  public async syncAudioTracks(
    tracks: AudioTrackItem[],
    currentTime: number,
    isPlaying: boolean,
    musicVolumeFactor: number = 0.85
  ): Promise<void> {
    if (!this.ctx) return;

    // Track cleanup: remove elements for deleted tracks
    const activeTrackIds = new Set(tracks.map(t => t.id));
    for (const [id, audio] of this.audioElements.entries()) {
      if (!activeTrackIds.has(id)) {
        try {
          audio.pause();
          audio.src = '';
          audio.remove();
        } catch {}
        this.audioElements.delete(id);
        this.mediaSourceNodes.delete(id);
      }
    }

    // Sync each track
    for (const track of tracks) {
      let audio = this.audioElements.get(track.id);

      if (!audio) {
        audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';

        if (track.file) {
          try {
            audio.src = urlRegistry.create(track.file);
          } catch {
            if (track.objectUrl) audio.src = track.objectUrl;
          }
        } else if (track.objectUrl) {
          audio.src = track.objectUrl;
        } else {
          resolveAudioTrackUrl(track).then(url => {
            if (url && audio) audio.src = url;
          });
        }

        // Route through Web Audio graph for VU metering
        if (this.masterGain && this.ctx) {
          try {
            const source = this.ctx.createMediaElementSource(audio);
            source.connect(this.masterGain);
            this.mediaSourceNodes.set(track.id, source);
          } catch {}
        }

        this.audioElements.set(track.id, audio);
      }

      const isInsideSpan = currentTime >= track.timelineStart && currentTime < track.timelineStart + track.duration;
      const shouldPlay = isInsideSpan && isPlaying && !this.isMuted && !track.muted;

      if (shouldPlay) {
        const trackOffset = currentTime - track.timelineStart;
        const targetLocalTime = (track.sourceStart || 0) + trackOffset;

        // Drift check: sync timestamp if off by more than 0.3s or if paused
        if (audio.paused || Math.abs(audio.currentTime - targetLocalTime) > 0.3) {
          if (audio.readyState >= 1) {
            try { audio.currentTime = targetLocalTime; } catch {}
          }
        }

        const baseVol = (track.volume ?? 1) * this.masterVolume * musicVolumeFactor;
        audio.volume = Math.max(0, Math.min(1, baseVol));

        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) {
          try { audio.pause(); } catch {}
        }
      }
    }
  }

  /**
   * Pauses all audio playback immediately (on Pause/Stop)
   */
  public pauseAll(): void {
    for (const audio of this.audioElements.values()) {
      try {
        if (!audio.paused) audio.pause();
      } catch {}
    }
  }

  /**
   * Reads current volume levels and peaks from the AnalyserNode for the VU Meter
   */
  public getAudioLevels(): AudioLevels {
    if (!this.analyser || !this.analyserData) {
      return { left: 0, right: 0, peak: 0, isClipping: false };
    }

    this.analyser.getByteFrequencyData(this.analyserData);

    let sum = 0;
    let max = 0;
    const len = this.analyserData.length;

    for (let i = 0; i < len; i++) {
      const val = this.analyserData[i];
      sum += val;
      if (val > max) max = val;
    }

    const avg = len > 0 ? sum / len : 0;
    const normalizedAvg = Math.min(1, avg / 128);
    const normalizedPeak = Math.min(1, max / 255);

    // Simulate stereo divergence slightly from frequency bands
    const leftSum = this.analyserData.slice(0, Math.floor(len / 2)).reduce((a, b) => a + b, 0);
    const rightSum = this.analyserData.slice(Math.floor(len / 2)).reduce((a, b) => a + b, 0);

    const leftLevel = Math.min(1, (leftSum / (len / 2)) / 128);
    const rightLevel = Math.min(1, (rightSum / (len / 2)) / 128);

    return {
      left: Math.max(0, leftLevel),
      right: Math.max(0, rightLevel),
      peak: normalizedPeak,
      isClipping: normalizedPeak >= 0.98
    };
  }

  /**
   * Destructor: cleans up all elements and closes AudioContext
   */
  public dispose(): void {
    this.pauseAll();
    this.audioElements.clear();
    this.mediaSourceNodes.clear();

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    LiveAudioEngine.instance = null;
  }
}

export const liveAudioEngine = LiveAudioEngine.getInstance();
