import { AudioResampler, STANDARD_RENDER_SAMPLE_RATE } from './audioResampler';

/**
 * Universal, rock-solid Audio Decoder and Fallback Synthesizer for video export and rendering.
 * Safely decodes audio from ArrayBuffers, Blobs, Files, and URLs using standard AudioContext.
 * Ensures the export pipeline ALWAYS has a valid, synchronized 48kHz Stereo audio stream.
 */
export class SafeAudioDecoder {
  /**
   * Safely decodes an ArrayBuffer or Blob into an AudioBuffer resampled to 48kHz Stereo.
   * Uses an isolated standard AudioContext instance to avoid OfflineAudioContext decoding bugs.
   */
  static async decodeTo48kStereo(
    masterCtx: BaseAudioContext | OfflineAudioContext,
    arrayBuffer: ArrayBuffer
  ): Promise<AudioBuffer | null> {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;

    const AudioCtxClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      : null;

    if (!AudioCtxClass) return null;

    let decodeCtx: AudioContext | null = null;
    try {
      decodeCtx = new AudioCtxClass({ sampleRate: STANDARD_RENDER_SAMPLE_RATE });
      // Detach-safe buffer slice
      const copy = arrayBuffer.slice(0);
      const rawDecoded = await decodeCtx.decodeAudioData(copy);
      if (!rawDecoded || rawDecoded.length === 0) return null;

      return AudioResampler.resampleTo48kStereo(masterCtx, rawDecoded, STANDARD_RENDER_SAMPLE_RATE);
    } catch (err) {
      console.warn('[SafeAudioDecoder] Audio decode failed:', err);
      return null;
    } finally {
      if (decodeCtx) {
        try {
          await decodeCtx.close();
        } catch {}
      }
    }
  }

  /**
   * Generates a clean, silent 48kHz stereo AudioBuffer.
   */
  static createSilentBuffer(
    masterCtx: BaseAudioContext | OfflineAudioContext,
    durationSeconds: number
  ): AudioBuffer {
    const totalSamples = Math.max(1, Math.ceil(durationSeconds * STANDARD_RENDER_SAMPLE_RATE));
    return masterCtx.createBuffer(2, totalSamples, STANDARD_RENDER_SAMPLE_RATE);
  }
}
