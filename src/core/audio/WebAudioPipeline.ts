/**
 * Kapi-Studio - Web Audio API Per-Track Processing Pipeline
 * Builds a professional per-track Web Audio processing chain:
 * AudioSource -> BiquadFilter (Equalizer) -> DynamicsCompressor (Master Compressor/Limiter) -> Gain (Fade In / Fade Out / Volume) -> Destination
 * Supports linear & logarithmic volume curves on clip edges via gain.gain.setValueCurveAtTime.
 */

export interface TrackAudioEffects {
  eqLowGainDb?: number;   // -12 to +12 dB
  eqMidGainDb?: number;   // -12 to +12 dB
  eqHighGainDb?: number;  // -12 to +12 dB
  volume?: number;        // 0.0 to 1.0 (default 1.0)
  muted?: boolean;
  fadeInSec?: number;     // 0.0 to 10.0
  fadeOutSec?: number;    // 0.0 to 10.0
  itemDurationSec?: number;
}

export class WebAudioTrackPipeline {
  private ctx: AudioContext | OfflineAudioContext;
  private inputNode: AudioNode;
  private eqLowNode: BiquadFilterNode;
  private eqMidNode: BiquadFilterNode;
  private eqHighNode: BiquadFilterNode;
  private compressorNode: DynamicsCompressorNode;
  private gainNode: GainNode;

  constructor(
    ctx: AudioContext | OfflineAudioContext,
    inputNode: AudioNode
  ) {
    this.ctx = ctx;
    this.inputNode = inputNode;

    // 1. Equalizer 3-Band Biquad Filters
    this.eqLowNode = ctx.createBiquadFilter();
    this.eqLowNode.type = 'lowshelf';
    this.eqLowNode.frequency.setValueAtTime(250, ctx.currentTime);

    this.eqMidNode = ctx.createBiquadFilter();
    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.setValueAtTime(1000, ctx.currentTime);
    this.eqMidNode.Q.setValueAtTime(1.0, ctx.currentTime);

    this.eqHighNode = ctx.createBiquadFilter();
    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.setValueAtTime(4000, ctx.currentTime);

    // 2. Dynamics Compressor (Soft-knee peak limiter)
    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-24, ctx.currentTime);
    this.compressorNode.knee.setValueAtTime(30, ctx.currentTime);
    this.compressorNode.ratio.setValueAtTime(12, ctx.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
    this.compressorNode.release.setValueAtTime(0.25, ctx.currentTime);

    // 3. Gain Node (Volume & Fade Curves)
    this.gainNode = ctx.createGain();

    // Connect Chain: Input -> EQ Low -> EQ Mid -> EQ High -> Compressor -> Gain -> Destination
    this.inputNode.connect(this.eqLowNode);
    this.eqLowNode.connect(this.eqMidNode);
    this.eqMidNode.connect(this.eqHighNode);
    this.eqHighNode.connect(this.compressorNode);
    this.compressorNode.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
  }

  /**
   * Applies real-time EQ, volume, and linear/logarithmic Fade In & Fade Out curves
   */
  public applyEffects(
    effects: TrackAudioEffects,
    startTimeSec: number
  ): void {
    const {
      eqLowGainDb = 0,
      eqMidGainDb = 0,
      eqHighGainDb = 0,
      volume = 1.0,
      muted = false,
      fadeInSec = 0,
      fadeOutSec = 0,
      itemDurationSec = 10
    } = effects;

    const now = this.ctx.currentTime;

    // Apply EQ gains
    this.eqLowNode.gain.setTargetAtTime(eqLowGainDb, now, 0.02);
    this.eqMidNode.gain.setTargetAtTime(eqMidGainDb, now, 0.02);
    this.eqHighNode.gain.setTargetAtTime(eqHighGainDb, now, 0.02);

    // Calculate Master Gain
    const targetVolume = muted ? 0 : Math.max(0, Math.min(1, volume));

    // Handle Fade In Curve
    if (fadeInSec > 0 && itemDurationSec > 0) {
      const curvePoints = 32;
      const fadeInCurve = new Float32Array(curvePoints);
      for (let i = 0; i < curvePoints; i++) {
        const t = i / (curvePoints - 1);
        // Logarithmic/Smooth s-curve fade in
        fadeInCurve[i] = Math.sin((t * Math.PI) / 2) * targetVolume;
      }
      this.gainNode.gain.setValueCurveAtTime(fadeInCurve, startTimeSec, fadeInSec);
    } else {
      this.gainNode.gain.setTargetAtTime(targetVolume, now, 0.02);
    }

    // Handle Fade Out Curve
    if (fadeOutSec > 0 && itemDurationSec > fadeOutSec) {
      const fadeOutStart = startTimeSec + (itemDurationSec - fadeOutSec);
      const curvePoints = 32;
      const fadeOutCurve = new Float32Array(curvePoints);
      for (let i = 0; i < curvePoints; i++) {
        const t = i / (curvePoints - 1);
        // Cosine smooth fade out
        fadeOutCurve[i] = Math.cos((t * Math.PI) / 2) * targetVolume;
      }
      this.gainNode.gain.setValueCurveAtTime(fadeOutCurve, fadeOutStart, fadeOutSec);
    }
  }

  public getOutputGainNode(): GainNode {
    return this.gainNode;
  }

  public disconnect(): void {
    try {
      this.gainNode.disconnect();
      this.compressorNode.disconnect();
      this.eqHighNode.disconnect();
      this.eqMidNode.disconnect();
      this.eqLowNode.disconnect();
      this.inputNode.disconnect();
    } catch {}
  }
}
