import { 
  FitMode, 
  ClipColorAdjustments, 
  LookPreset, 
  TransitionType, 
  TextLayer, 
  TitleCard,
  ClipDedication
} from '../../types/project';

export type AnyCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LayerRenderContext {
  ctx: AnyCanvasContext;
  width: number;
  height: number;
  timeSec: number;
  frameIndex: number;
  fps: number;
}

export interface CompositeFrameParams {
  width: number;
  height: number;
  mediaEl?: CanvasImageSource | null;
  srcWidth?: number;
  srcHeight?: number;
  fitMode?: FitMode;
  rotation?: number;
  scale?: number;
  position?: { x: number; y: number };
  crop?: { x: number; y: number; width: number; height: number };
  colorAdjustments?: ClipColorAdjustments;
  globalPreset?: string;
  titleCard?: TitleCard | null;
  outroCard?: TitleCard | null;
  dedication?: ClipDedication | null;
  timeInItem?: number;
  itemDuration?: number;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number;
  textLayers?: TextLayer[];
  currentTimeSec?: number;
  letterbox?: string;
  watermark?: { enabled: boolean; text: string; position: string; opacity: number };
  sessionId?: string;
}

export interface EncoderFrameResult {
  bufferCanvas: OffscreenCanvas | HTMLCanvasElement;
  bufferCtx: AnyCanvasContext;
  createVideoFrame: (timestampMicros?: number, durationMicros?: number) => VideoFrame;
  videoFrame?: VideoFrame;
}

export class FrameCompositor {
  private static offscreenBuffers: Map<string, {
    canvas: OffscreenCanvas | HTMLCanvasElement;
    ctx: AnyCanvasContext;
  }> = new Map();

  /**
   * Creates an OffscreenCanvas or fallback HTMLCanvasElement for high-throughput headless frame drawing
   */
  static createOffscreenCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Retrieves or initializes a hardware-accelerated OffscreenCanvas intermediate buffer.
   * Reuses buffer memory across frames to prevent GC pressure during high-FPS video encoding.
   */
  static getOffscreenBuffer(width: number, height: number, sessionId: string = 'default'): {
    canvas: OffscreenCanvas | HTMLCanvasElement;
    ctx: AnyCanvasContext;
  } {
    const key = `${sessionId}_${width}x${height}`;
    let buffer = this.offscreenBuffers.get(key);
    
    if (
      !buffer ||
      buffer.canvas.width !== width ||
      buffer.canvas.height !== height
    ) {
      const canvas = this.createOffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      }) as AnyCanvasContext;
      buffer = { canvas, ctx };
      this.offscreenBuffers.set(key, buffer);
    } else {
      buffer.ctx.clearRect(0, 0, width, height);
    }

    // Always ensure a solid black background base to prevent transparent frames/leakage
    buffer.ctx.fillStyle = '#000000';
    buffer.ctx.fillRect(0, 0, width, height);

    return buffer;
  }

  /**
   * Cleans up offscreen canvas buffers associated with a given session ID to free memory.
   */
  static cleanupSession(sessionId: string): void {
    for (const key of Array.from(this.offscreenBuffers.keys())) {
      if (key.startsWith(`${sessionId}_`)) {
        this.offscreenBuffers.delete(key);
      }
    }
  }

  /**
   * Composites a complete frame (media scaling, GPU color filter, title cards, overlays, transitions, text layers)
   * onto the hardware-accelerated OffscreenCanvas intermediate buffer.
   */
  static compositeFrameToBuffer(params: CompositeFrameParams): {
    canvas: OffscreenCanvas | HTMLCanvasElement;
    ctx: AnyCanvasContext;
  } {
    const { width, height, sessionId } = params;
    const { canvas, ctx } = this.getOffscreenBuffer(width, height, sessionId);

    // 1. Draw Media / Video Frame if provided
    if (params.mediaEl) {
      const srcW = params.srcWidth || (params.mediaEl as any).videoWidth || (params.mediaEl as any).width || width;
      const srcH = params.srcHeight || (params.mediaEl as any).videoHeight || (params.mediaEl as any).height || height;

      this.drawMedia(
        ctx,
        params.mediaEl,
        srcW,
        srcH,
        width,
        height,
        {
          fitMode: params.fitMode || 'fit',
          rotation: params.rotation || 0,
          scale: params.scale || 1,
          position: params.position,
          crop: params.crop,
          colorAdjustments: params.colorAdjustments,
          globalPreset: params.globalPreset
        }
      );
    }

    // 2. Apply Title Card (Intro) if active
    let isTitleCardActive = false;
    if (params.titleCard && params.titleCard.enabled) {
      const cardDur = Math.min(Math.max(0.8, (params.itemDuration || 5) * 0.4), params.titleCard.duration || 3);
      if ((params.timeInItem ?? 0) < cardDur) {
        this.drawTitleCard(ctx, width, height, params.titleCard);
        isTitleCardActive = true;
      }
    }

    // 3. Apply Outro Card if active
    let isOutroCardActive = false;
    if (params.outroCard && params.outroCard.enabled) {
      const outroDur = Math.min(Math.max(1.0, (params.itemDuration || 5) * 0.5), params.outroCard.duration || 4);
      const outroStart = Math.max(0, (params.itemDuration || 5) - outroDur);
      if ((params.timeInItem ?? 0) >= outroStart) {
        this.drawTitleCard(ctx, width, height, params.outroCard);
        isOutroCardActive = true;
      }
    }

    // 4. Apply Transitions (In / Out)
    const timeIn = params.timeInItem ?? 0;
    const itemDur = params.itemDuration ?? 0;
    const transIn = params.transitionIn || 'cut';
    const transInDur = params.transitionDuration || (transIn !== 'cut' ? 0.8 : 0);

    if (transInDur > 0 && transIn !== 'cut' && timeIn < transInDur) {
      const transProg = 1 - Math.max(0, Math.min(1, timeIn / transInDur));
      this.applyTransition(ctx, width, height, transProg, transIn);
    }

    const timeLeft = itemDur - timeIn;
    const transOut = params.transitionOut || 'cut';
    const transOutDur = params.transitionDuration || (transOut !== 'cut' ? 0.8 : 0);

    if (transOutDur > 0 && transOut !== 'cut' && itemDur > 0 && timeLeft < transOutDur) {
      const transProg = 1 - Math.max(0, Math.min(1, timeLeft / transOutDur));
      this.applyTransition(ctx, width, height, transProg, transOut);
    }

    // 4b. Draw Custom Dedication Overlay if active
    if (params.dedication && params.dedication.enabled) {
      this.drawDedication(
        ctx,
        width,
        height,
        params.dedication,
        params.timeInItem ?? 0,
        params.itemDuration ?? 5
      );
    }

    // 5. Draw Subtitles / Text Layers (Skip caption/subtitle/lower_third if title card or outro card is occupying the screen to prevent overlap)
    if (params.textLayers && params.textLayers.length > 0) {
      for (const textLayer of params.textLayers) {
        if ((isTitleCardActive || isOutroCardActive) && (textLayer.type === 'caption' || textLayer.type === 'subtitle' || textLayer.type === 'lower_third')) {
          continue;
        }
        this.drawTextLayer(ctx, width, height, textLayer, params.currentTimeSec ?? 0);
      }
    }

    // 6. Apply Letterbox (e.g. CinemaScope 2.39:1)
    if (params.letterbox) {
      this.applyLetterbox(ctx, width, height, params.letterbox);
    }

    // 7. Apply Watermark
    if (params.watermark) {
      this.applyWatermark(ctx, width, height, params.watermark);
    }

    return { canvas, ctx };
  }

  /**
   * Constructs a VideoFrame directly from the hardware-accelerated OffscreenCanvas intermediate buffer.
   */
  static createEncoderVideoFrame(
    sourceBuffer?: OffscreenCanvas | HTMLCanvasElement,
    timestampMicros: number = 0,
    durationMicros: number = 33333
  ): VideoFrame {
    const buffer = sourceBuffer || Array.from(this.offscreenBuffers.values())[0]?.canvas;
    if (!buffer) {
      throw new Error('FrameCompositor: OffscreenCanvas buffer nie został zainicjalizowany.');
    }
    return new VideoFrame(buffer as CanvasImageSource, {
      timestamp: timestampMicros,
      duration: durationMicros
    });
  }

  /**
   * Refactored pipeline entry point: Composites frame onto OffscreenCanvas buffer,
   * optionally blits to display context, and returns ready-to-encode buffer & VideoFrame helper.
   */
  static renderAndTransferToEncoder(
    params: CompositeFrameParams,
    displayCtx?: AnyCanvasContext,
    timestampMicros?: number,
    durationMicros?: number
  ): EncoderFrameResult {
    const { canvas, ctx } = this.compositeFrameToBuffer(params);

    // Blit intermediate OffscreenCanvas buffer to display canvas if provided
    if (displayCtx) {
      displayCtx.drawImage(canvas, 0, 0, params.width, params.height);
    }

    const createVideoFrame = (tsMicros = timestampMicros ?? 0, durMicros = durationMicros ?? 33333) => {
      return this.createEncoderVideoFrame(canvas, tsMicros, durMicros);
    };

    let videoFrame: VideoFrame | undefined;
    if (typeof timestampMicros === 'number' && typeof durationMicros === 'number' && typeof VideoFrame !== 'undefined') {
      try {
        videoFrame = createVideoFrame(timestampMicros, durationMicros);
      } catch (e) {
        console.warn('[FrameCompositor] Could not construct VideoFrame:', e);
      }
    }

    return {
      bufferCanvas: canvas,
      bufferCtx: ctx,
      createVideoFrame,
      videoFrame
    };
  }

  /**
   * Generates composite CSS filter string for granular color grading + LUT look
   */
  static buildColorFilter(adjustments?: ClipColorAdjustments, globalPreset?: string): string {
    if (!adjustments && (!globalPreset || globalPreset === 'none')) {
      return 'none';
    }

    const filters: string[] = [];
    
    // 1. Exposure / Brightness (-100 to 100)
    const exposure = adjustments?.exposure ?? 0;
    const brightness = adjustments?.brightness ?? 0;
    const netBrightness = 1 + (exposure * 0.005) + (brightness * 0.004);
    if (Math.abs(netBrightness - 1) > 0.01) {
      const clamped = Math.max(0.2, Math.min(2.5, netBrightness));
      filters.push(`brightness(${clamped.toFixed(3)})`);
    }

    // 2. Contrast (-100 to 100)
    const contrast = adjustments?.contrast ?? 0;
    if (contrast !== 0) {
      const contrastVal = 1 + (contrast * 0.006);
      const clamped = Math.max(0.3, Math.min(2.5, contrastVal));
      filters.push(`contrast(${clamped.toFixed(3)})`);
    }

    // 3. Saturation (-100 to 100)
    const saturation = adjustments?.saturation ?? 0;
    if (saturation !== 0) {
      const satVal = 1 + (saturation * 0.008);
      const clamped = Math.max(0, Math.min(3.0, satVal));
      filters.push(`saturate(${clamped.toFixed(3)})`);
    }

    // 4. Temperature & Tint
    const temperature = adjustments?.temperature ?? 0; // Warm (+) / Cool (-)
    if (temperature > 0) {
      // Warm golden tint
      filters.push(`sepia(${(temperature * 0.003).toFixed(3)})`);
    } else if (temperature < 0) {
      // Cool blueish tint
      filters.push(`hue-rotate(${(temperature * 0.15).toFixed(1)}deg)`);
    }

    const tint = adjustments?.tint ?? 0; // Green (-) / Magenta (+)
    if (tint !== 0) {
      filters.push(`hue-rotate(${(tint * 0.2).toFixed(1)}deg)`);
    }

    // 5. Look Preset with Intensity
    const look = (adjustments?.lookPreset || globalPreset) as LookPreset | undefined;
    const lookIntensity = (adjustments?.lookIntensity ?? 100) / 100;

    if (look && look !== 'none' && lookIntensity > 0) {
      switch (look) {
        case 'golden_hour':
          filters.push(`sepia(${(0.25 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.08 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.2 * lookIntensity).toFixed(2)})`);
          break;
        case 'cinematic':
          filters.push(`contrast(${(1 + 0.25 * lookIntensity).toFixed(2)}) brightness(${(1 - 0.05 * lookIntensity).toFixed(2)}) saturate(${(1 - 0.3 * lookIntensity).toFixed(2)})`);
          break;
        case 'warm':
          filters.push(`sepia(${(0.18 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.12 * lookIntensity).toFixed(2)})`);
          break;
        case 'cool':
          filters.push(`hue-rotate(${(-12 * lookIntensity).toFixed(1)}deg) saturate(${(1 - 0.1 * lookIntensity).toFixed(2)})`);
          break;
        case 'vintage':
          filters.push(`sepia(${(0.3 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.12 * lookIntensity).toFixed(2)}) brightness(${(1 - 0.04 * lookIntensity).toFixed(2)})`);
          break;
        case 'bw':
          filters.push(`grayscale(${(1 * lookIntensity).toFixed(2)}) contrast(${(1 + 0.2 * lookIntensity).toFixed(2)})`);
          break;
        case 'film':
          filters.push(`contrast(${(1 + 0.15 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.15 * lookIntensity).toFixed(2)})`);
          break;
        case 'natural':
          filters.push(`contrast(${(1 + 0.08 * lookIntensity).toFixed(2)}) saturate(${(1 + 0.1 * lookIntensity).toFixed(2)})`);
          break;
      }
    }

    return filters.length > 0 ? filters.join(' ') : 'none';
  }

  /**
   * Draw media frame with high precision transform, crop, aspect ratio, and backdrop
   */
  static drawMedia(
    ctx: AnyCanvasContext,
    media: CanvasImageSource,
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number,
    options: {
      fitMode: FitMode;
      rotation?: number;
      scale?: number;
      position?: { x: number; y: number };
      crop?: { x: number; y: number; width: number; height: number };
      colorAdjustments?: ClipColorAdjustments;
      globalPreset?: string;
    }
  ): void {
    if (!srcWidth || !srcHeight || targetWidth <= 0 || targetHeight <= 0) return;

    const {
      fitMode = 'fit',
      rotation = 0,
      scale = 1,
      position = { x: 0, y: 0 },
      crop,
      colorAdjustments,
      globalPreset
    } = options;

    const sourceAspect = srcWidth / srcHeight;
    const targetAspect = targetWidth / targetHeight;
    const aspectDiff = Math.abs(sourceAspect - targetAspect);

    // 1. IV.1 Smart Ambient Background Blur: Eliminates black bars on vertical/horizontal mixed clips
    const needsSmartBackground = (fitMode === 'fit' || fitMode === 'original') && (aspectDiff > 0.02);
    if (needsSmartBackground) {
      ctx.save();
      ctx.filter = 'blur(35px) brightness(0.42) contrast(1.15)';
      let bgW = targetWidth;
      let bgH = targetHeight;
      if (sourceAspect > targetAspect) {
        bgH = targetHeight;
        bgW = targetHeight * sourceAspect * 1.05;
      } else {
        bgW = targetWidth;
        bgH = (targetWidth / sourceAspect) * 1.05;
      }
      const bgX = (targetWidth - bgW) / 2;
      const bgY = (targetHeight - bgH) / 2;
      ctx.drawImage(media, bgX, bgY, bgW, bgH);
      
      // Semi-transparent dark wash for high contrast against sharp foreground
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.restore();
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Apply color filter
    const filter = this.buildColorFilter(colorAdjustments, globalPreset);
    if (filter !== 'none') {
      ctx.filter = filter;
    }

    // Determine Foreground Crop / Scale Bounds
    let sX = 0, sY = 0, sW = srcWidth, sH = srcHeight;
    if (crop) {
      sX = Math.max(0, Math.min(srcWidth, crop.x * srcWidth));
      sY = Math.max(0, Math.min(srcHeight, crop.y * srcHeight));
      sW = Math.max(1, Math.min(srcWidth - sX, crop.width * srcWidth));
      sH = Math.max(1, Math.min(srcHeight - sY, crop.height * srcHeight));
    }

    const effectiveAspect = sW / sH;
    let renderW = targetWidth;
    let renderH = targetHeight;
    let renderX = 0;
    let renderY = 0;

    if (fitMode === 'fit') {
      if (effectiveAspect > targetAspect) {
        renderW = targetWidth;
        renderH = targetWidth / effectiveAspect;
        renderY = (targetHeight - renderH) / 2;
      } else {
        renderH = targetHeight;
        renderW = targetHeight * effectiveAspect;
        renderX = (targetWidth - renderW) / 2;
      }
    } else if (fitMode === 'fill' || fitMode === 'smart_crop') {
      if (effectiveAspect > targetAspect) {
        renderH = targetHeight;
        renderW = targetHeight * effectiveAspect;
        renderX = (targetWidth - renderW) / 2;
      } else {
        renderW = targetWidth;
        renderH = targetWidth / effectiveAspect;
        // Top-biased crop (0.35 from top instead of 0.5 center) to keep faces in frame
        renderY = (targetHeight - renderH) * 0.35;
      }
    } else if (fitMode === 'original') {
      renderW = sW;
      renderH = sH;
      renderX = (targetWidth - renderW) / 2;
      renderY = (targetHeight - renderH) / 2;
    }

    const centerX = renderX + renderW / 2;
    const centerY = renderY + renderH / 2;

    ctx.translate(centerX, centerY);

    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    if (position && (position.x !== 0 || position.y !== 0)) {
      const offsetX = position.x * targetWidth * 0.5;
      const offsetY = position.y * targetHeight * 0.5;
      ctx.translate(offsetX, offsetY);
    }

    const effectiveScale = scale || 1;
    if (effectiveScale !== 1) {
      ctx.scale(effectiveScale, effectiveScale);
    }

    // Drop shadow for fitted foreground on ambient background to create depth
    if (needsSmartBackground) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
    }

    ctx.drawImage(media, sX, sY, sW, sH, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    // Vignette overlay
    if (colorAdjustments?.vignette && colorAdjustments.vignette > 0) {
      this.applyVignette(ctx, targetWidth, targetHeight, colorAdjustments.vignette);
    }
  }

  /**
   * Applies vignette gradient
   */
  static applyVignette(ctx: AnyCanvasContext, width: number, height: number, intensity: number): void {
    if (intensity <= 0) return;
    ctx.save();
    const radius = Math.max(width, height) * 0.75;
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, radius * 0.35,
      width / 2, height / 2, radius
    );
    const alpha = Math.min(0.85, (intensity / 100) * 0.85);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${alpha.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  /**
   * Renders advanced transition effects (Transitions 2.0)
   */
  static applyTransition(
    ctx: AnyCanvasContext,
    width: number,
    height: number,
    progress: number, // 0.0 (start) to 1.0 (fully active / peak)
    type: TransitionType
  ): void {
    if (type === 'cut' || progress <= 0) return;

    const clampedProg = Math.max(0, Math.min(1, progress));
    // Smoothstep interpolation (Hermite curve) for cinematic organic transitions
    const smoothProg = clampedProg * clampedProg * (3 - 2 * clampedProg);

    ctx.save();

    switch (type) {
      case 'fade':
      case 'dissolve':
      case 'dip_black': {
        ctx.fillStyle = `rgba(0, 0, 0, ${smoothProg.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'dip_white': {
        ctx.fillStyle = `rgba(255, 255, 255, ${smoothProg.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'zoom': {
        // Dramatic smooth vignette zoom darkening
        const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width * 0.7);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, `rgba(0, 0, 0, ${(smoothProg * 0.85).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'slide': {
        // Lateral wash with subtle cinematic edge shadow
        const shadowWidth = width * 0.15;
        const currentX = width * smoothProg;
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.6 * smoothProg).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'wipe': {
        // Soft-edge feathered cinematic wipe
        const wipeX = width * smoothProg;
        const feather = Math.max(30, width * 0.08);
        const startX = Math.max(0, wipeX - feather);
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, startX, height);

        const grad = ctx.createLinearGradient(startX, 0, wipeX, 0);
        grad.addColorStop(0, '#000000');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(startX, 0, feather, height);
        break;
      }

      case 'blur': {
        ctx.fillStyle = `rgba(14, 12, 18, ${(smoothProg * 0.85).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'light_leak': {
        // Warm anamorphic golden cinema lens flare
        const grad = ctx.createLinearGradient(0, 0, width * 0.9, height * 0.85);
        const a = (smoothProg * 0.85).toFixed(3);
        const coreA = (smoothProg * 0.95).toFixed(3);
        grad.addColorStop(0, `rgba(254, 240, 138, ${coreA})`); // Warm gold core
        grad.addColorStop(0.35, `rgba(212, 175, 55, ${a})`);   // True amber gold
        grad.addColorStop(0.7, `rgba(249, 115, 22, ${(smoothProg * 0.55).toFixed(3)})`); // Amber edge
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }

      case 'film_burn': {
        // 35mm analog film burn with warm radiant core
        const grad = ctx.createRadialGradient(width * 0.6, height * 0.4, 20, width * 0.5, height * 0.5, width * 0.75);
        const a = (smoothProg * 0.92).toFixed(3);
        grad.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        grad.addColorStop(0.25, `rgba(253, 224, 71, ${a})`);
        grad.addColorStop(0.6, `rgba(234, 88, 12, ${(smoothProg * 0.7).toFixed(3)})`);
        grad.addColorStop(1, `rgba(120, 53, 15, ${(smoothProg * 0.35).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Renders animated Text / Subtitle / Lower Third Layer with subframe deterministic precision
   */
  static drawTextLayer(
    ctx: AnyCanvasContext,
    width: number,
    height: number,
    layer: TextLayer,
    currentTimelineSec: number
  ): void {
    const elapsed = currentTimelineSec - layer.timelineStart;
    if (elapsed < 0 || elapsed > layer.duration) return;

    const remaining = layer.duration - elapsed;

    ctx.save();

    // Compute Animation State
    let opacity = layer.opacity ?? 1;
    let offsetY = 0;
    let scaleFactor = 1;
    let displayText = layer.text;

    const animDuration = 0.35; // 350ms smooth transition window

    if (layer.animation === 'fade') {
      if (elapsed < animDuration) {
        opacity *= (elapsed / animDuration);
      } else if (remaining < animDuration) {
        opacity *= (remaining / animDuration);
      }
    } else if (layer.animation === 'slide') {
      if (elapsed < animDuration) {
        const t = 1 - (elapsed / animDuration);
        offsetY = t * 30 * (height / 1080);
        opacity *= (elapsed / animDuration);
      } else if (remaining < animDuration) {
        const t = 1 - (remaining / animDuration);
        offsetY = -t * 30 * (height / 1080);
        opacity *= (remaining / animDuration);
      }
    } else if (layer.animation === 'scale') {
      if (elapsed < animDuration) {
        const t = elapsed / animDuration;
        scaleFactor = 0.85 + (0.15 * t);
        opacity *= t;
      }
    } else if (layer.animation === 'bounce') {
      if (elapsed < 0.25) {
        const t = elapsed / 0.25;
        // Elastic overshoot bounce
        scaleFactor = 0.7 + (0.45 * Math.sin(t * Math.PI * 0.75));
        opacity *= Math.min(1, t * 1.5);
      }
    } else if (layer.animation === 'typewriter') {
      const typeDuration = Math.min(2.0, layer.duration * 0.75);
      const charProgress = Math.min(1, Math.max(0, elapsed / typeDuration));
      const charCount = Math.round(charProgress * layer.text.length);
      displayText = layer.text.substring(0, charCount);
    } else if (layer.animation === 'blur_in') {
      if (elapsed < animDuration) {
        const t = elapsed / animDuration;
        opacity *= t;
      }
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const posX = (layer.position?.x ?? 0.5) * width;
    const posY = ((layer.position?.y ?? 0.85) * height) + offsetY;

    const fontScale = height / 1080;
    const baseSize = Math.max(14, Math.round((layer.fontSize || 32) * fontScale * scaleFactor));
    const weight = layer.fontWeight || (layer.type === 'title' || layer.type === 'chapter' || layer.style === 'karaoke_glow' ? 'bold' : 'normal');
    
    let family = layer.fontFamily;
    if (!family) {
      if (layer.style === 'cinematic' || layer.style === 'elegant') {
        family = '"Cinzel", "Playfair Display", "Times New Roman", serif';
      } else if (layer.style === 'boxed_retro') {
        family = '"JetBrains Mono", "Roboto Mono", monospace';
      } else if (layer.style === 'neon_cyber' || layer.style === 'karaoke_glow') {
        family = '"Plus Jakarta Sans", "Montserrat", "Inter", sans-serif';
      } else {
        family = '"Inter", system-ui, sans-serif';
      }
    }

    ctx.font = `${weight} ${baseSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Support multiline text
    const lines = displayText.split('\n');
    const lineHeight = baseSize * 1.35;
    const totalTextHeight = lines.length * lineHeight;

    // Measure maximum line width
    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }

    const padX = baseSize * 0.75;
    const padY = baseSize * 0.45;
    const boxW = maxLineWidth + padX * 2;
    const boxH = totalTextHeight + padY * 2;

    // Draw Background Pill or Lower-Third Card
    if (layer.type === 'lower_third') {
      ctx.save();
      const ltGrad = ctx.createLinearGradient(posX - boxW / 2, posY - boxH / 2, posX + boxW / 2 + 100, posY + boxH / 2);
      ltGrad.addColorStop(0, 'rgba(10, 10, 14, 0.85)');
      ltGrad.addColorStop(0.7, 'rgba(24, 24, 30, 0.75)');
      ltGrad.addColorStop(1, 'rgba(10, 10, 14, 0)');
      ctx.fillStyle = ltGrad;
      ctx.fillRect(posX - boxW / 2, posY - boxH / 2, boxW + 80, boxH);
      // Gold accent bar
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(posX - boxW / 2, posY - boxH / 2, 4, boxH);
      ctx.restore();
    } else if (layer.style === 'karaoke_glow') {
      // Viral CapCut Style: Semi-transparent dark pill with subtle glow
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.beginPath();
      const radius = Math.round(boxH * 0.35);
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH, radius);
      } else {
        ctx.rect(posX - boxW / 2, posY - boxH / 2, boxW, boxH);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    } else if (layer.style === 'neon_cyber') {
      ctx.save();
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = Math.round(14 * fontScale);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.strokeRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH);
      ctx.fillStyle = 'rgba(6, 12, 24, 0.85)';
      ctx.fillRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH);
      ctx.restore();
    } else if (layer.backgroundColor) {
      ctx.save();
      ctx.fillStyle = layer.backgroundColor;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH, 8);
      } else {
        ctx.rect(posX - boxW / 2, posY - boxH / 2, boxW, boxH);
      }
      ctx.fill();
      ctx.restore();
    }

    // Drop Shadow
    if (layer.shadow !== false) {
      ctx.shadowColor = layer.style === 'neon_cyber' ? 'rgba(56, 189, 248, 0.8)' : 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.round(10 * fontScale);
      ctx.shadowOffsetX = Math.round(2 * fontScale);
      ctx.shadowOffsetY = Math.round(2 * fontScale);
    }

    // Render each line
    const startY = posY - (totalTextHeight / 2) + (lineHeight / 2);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const curY = startY + (i * lineHeight);

      // Outline
      if (layer.outlineWidth && layer.outlineWidth > 0) {
        ctx.strokeStyle = layer.outlineColor || '#000000';
        ctx.lineWidth = layer.outlineWidth * fontScale;
        ctx.strokeText(lineText, posX, curY);
      }

      // Main Text Fill
      if (layer.style === 'karaoke_glow') {
        ctx.fillStyle = '#FDE047'; // Vivid punchy yellow
      } else if (layer.style === 'neon_cyber') {
        ctx.fillStyle = '#E0F2FE';
      } else {
        ctx.fillStyle = layer.color || (layer.style === 'cinematic' ? '#D4AF37' : '#FFFFFF');
      }
      ctx.fillText(lineText, posX, curY);
    }

    // Optional Speaker Badge for subtitles
    if (layer.subtitleSpeaker) {
      ctx.save();
      const badgeFontSize = Math.max(11, Math.round(baseSize * 0.65));
      ctx.font = `600 ${badgeFontSize}px ${family}`;
      ctx.fillStyle = '#D4AF37';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(layer.subtitleSpeaker.toUpperCase(), posX, posY - (boxH / 2) - 8);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Applies CinemaScope (2.39:1) Hollywood black bars
   */
  static applyLetterbox(ctx: AnyCanvasContext, width: number, height: number, mode?: string): void {
    if (mode === 'cinemascope') {
      const activeHeight = Math.round(width / 2.39);
      const barHeight = Math.max(0, Math.round((height - activeHeight) / 2));
      if (barHeight > 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, barHeight);
        ctx.fillRect(0, height - barHeight, width, barHeight);
      }
    }
  }

  /**
   * Renders optional watermark branding
   */
  static applyWatermark(
    ctx: AnyCanvasContext,
    width: number,
    height: number,
    watermark?: { enabled: boolean; text: string; position: string; opacity: number }
  ): void {
    if (!watermark || !watermark.enabled || !watermark.text) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1, watermark.opacity || 0.4));
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;

    const pad = 30;
    const text = watermark.text;

    switch (watermark.position) {
      case 'top_left':
        ctx.textAlign = 'left';
        ctx.fillText(text, pad, pad + 16);
        break;
      case 'top_right':
        ctx.textAlign = 'right';
        ctx.fillText(text, width - pad, pad + 16);
        break;
      case 'bottom_left':
        ctx.textAlign = 'left';
        ctx.fillText(text, pad, height - pad);
        break;
      default: // bottom_right
        ctx.textAlign = 'right';
        ctx.fillText(text, width - pad, height - pad);
        break;
    }

    ctx.restore();
  }

  /**
   * Renders high-end commercial title cards (Intro, Chapter Slate, Outro & Credits)
   * Supports: cinematic, modern_bold, minimalist, studio_slate, cyber_neon, credits, elegant, classic.
   */
  static drawTitleCard(ctx: AnyCanvasContext, width: number, height: number, card: TitleCard): void {
    ctx.save();

    const fontScale = height / 1080;
    const isOutro = card.cardType === 'outro' || card.style === 'credits' || 
      (card.text && (card.text.toLowerCase().includes('napisy') || card.text.toLowerCase().includes('dziękujemy') || card.text.toLowerCase().includes('finał') || card.text.toLowerCase().includes('the end')));
    const text = card.text || (isOutro ? 'THE END' : 'PROLOG');
    const subtitle = card.subtitle || '';
    const style = card.style || (isOutro ? 'credits' : 'cinematic');

    // 1. Draw Background
    if (card.backgroundColor && card.backgroundColor !== 'gradient') {
      ctx.fillStyle = card.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else if (style === 'cyber_neon') {
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.1, width / 2, height / 2, width * 0.85);
      grad.addColorStop(0, '#091528');
      grad.addColorStop(0.5, '#050a14');
      grad.addColorStop(1, '#020408');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (style === 'modern_bold') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#111827');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (style === 'studio_slate') {
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, width, height);
    } else {
      // Default: Deep cinematic obsidian gradient
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, Math.round(width * 0.12),
        width / 2, height / 2, Math.round(width * 0.8)
      );
      grad.addColorStop(0, '#151821');
      grad.addColorStop(0.45, '#0c0e14');
      grad.addColorStop(1, '#050608');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 2. Render Specific Styles
    if (style === 'studio_slate') {
      // Film Production Clapper / Slate Card
      const boxW = Math.round(width * 0.76);
      const boxH = Math.round(height * 0.68);
      const boxX = (width - boxW) / 2;
      const boxY = (height - boxH) / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Top chevron stripe bar
      const barH = Math.round(36 * fontScale);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(boxX, boxY, boxW, barH);
      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${Math.max(12, Math.round(16 * fontScale))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('CINEMATIC PRODUCTION SLATE  //  STUDIO MASTER RECORD', boxX + 20, boxY + (barH / 2));

      // Title & Subtitle in center
      ctx.textAlign = 'center';
      const titleSize = Math.max(26, Math.round(52 * fontScale));
      ctx.font = `800 ${titleSize}px "Plus Jakarta Sans", "Manrope", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text.toUpperCase(), width / 2, boxY + boxH * 0.42);

      if (subtitle) {
        const subSize = Math.max(14, Math.round(22 * fontScale));
        ctx.font = `500 ${subSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#e5a93b';
        ctx.fillText(subtitle, width / 2, boxY + boxH * 0.58);
      }

      // Bottom metadata bar
      ctx.textAlign = 'center';
      ctx.font = `400 ${Math.max(11, Math.round(14 * fontScale))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('SCENE: 01   •   TAKE: MASTER   •   FPS: 24/30   •   COLOR: REC.709', width / 2, boxY + boxH - 24);

    } else if (style === 'modern_bold') {
      // High-Impact Commercial / CapCut / Premiere Style
      const titleSize = Math.max(32, Math.round(72 * fontScale));
      const subSize = Math.max(16, Math.round(24 * fontScale));

      // Modern geometric accent pill/line
      const lineW = Math.round(100 * fontScale);
      const lineH = Math.max(4, Math.round(5 * fontScale));
      ctx.fillStyle = '#e5a93b';
      ctx.fillRect((width - lineW) / 2, (height / 2) - Math.round(70 * fontScale), lineW, lineH);

      ctx.font = `800 ${titleSize}px "Plus Jakarta Sans", "Manrope", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.round(18 * fontScale);
      ctx.fillText(text.toUpperCase(), width / 2, height / 2);

      if (subtitle) {
        ctx.font = `600 ${subSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.shadowBlur = Math.round(8 * fontScale);
        ctx.fillText(subtitle, width / 2, (height / 2) + Math.round(56 * fontScale));
      }

    } else if (style === 'cyber_neon') {
      // Cyber / Tech / Action Style
      const titleSize = Math.max(28, Math.round(60 * fontScale));
      const subSize = Math.max(15, Math.round(22 * fontScale));

      // Glowing outer frame
      const pad = Math.round(60 * fontScale);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
      ctx.shadowBlur = Math.round(16 * fontScale);
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      ctx.font = `700 ${titleSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      ctx.shadowBlur = Math.round(20 * fontScale);
      ctx.fillText(text.toUpperCase(), width / 2, (height / 2) - Math.round(20 * fontScale));

      if (subtitle) {
        ctx.font = `500 ${subSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#f8fafc';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
        ctx.shadowBlur = Math.round(10 * fontScale);
        ctx.fillText(`// ${subtitle} //`, width / 2, (height / 2) + Math.round(45 * fontScale));
      }

    } else if (isOutro || style === 'credits') {
      // Professional End Credits / Outro
      const pad = Math.round(50 * fontScale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      const titleSize = Math.max(26, Math.round(54 * fontScale));
      const subSize = Math.max(15, Math.round(22 * fontScale));

      ctx.font = `600 ${titleSize}px "Cinzel", "Plus Jakarta Sans", serif`;
      ctx.fillStyle = '#F8FAFC';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.round(12 * fontScale);
      ctx.fillText(text.toUpperCase(), width / 2, (height / 2) - Math.round(45 * fontScale));

      // Delicate accent divider
      ctx.strokeStyle = 'rgba(229, 169, 59, 0.6)';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * fontScale));
      const divW = Math.round(120 * fontScale);
      ctx.beginPath();
      ctx.moveTo((width - divW) / 2, (height / 2) - Math.round(12 * fontScale));
      ctx.lineTo((width + divW) / 2, (height / 2) - Math.round(12 * fontScale));
      ctx.stroke();

      if (subtitle) {
        ctx.font = `400 ${subSize}px "Plus Jakarta Sans", "Manrope", sans-serif`;
        ctx.fillStyle = '#D1D5DB';
        ctx.shadowBlur = Math.round(8 * fontScale);

        // Multi-line word wrap for credits/thank you message
        const maxWidth = width * 0.72;
        const words = subtitle.split(' ');
        let line = '';
        let lineY = (height / 2) + Math.round(25 * fontScale);
        const lineHeight = Math.round(32 * fontScale);

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line.trim(), width / 2, lineY);
            line = words[n] + ' ';
            lineY += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), width / 2, lineY);
      }

    } else if (style === 'minimalist') {
      // Swiss / Minimalist Luxury
      const titleSize = Math.max(22, Math.round(44 * fontScale));
      const subSize = Math.max(13, Math.round(18 * fontScale));

      ctx.font = `300 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, width / 2, subtitle ? (height / 2) - Math.round(18 * fontScale) : (height / 2));

      if (subtitle) {
        ctx.font = `400 ${subSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText(subtitle, width / 2, (height / 2) + Math.round(26 * fontScale));
      }

    } else {
      // Cinematic Master / Default
      const titleSize = Math.max(26, Math.round(56 * fontScale));
      const subSize = Math.max(15, Math.round(22 * fontScale));

      // Elegant cinematic double frame with corner cutouts
      const pad = Math.round(48 * fontScale);
      ctx.strokeStyle = 'rgba(229, 169, 59, 0.45)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      ctx.strokeStyle = 'rgba(229, 169, 59, 0.18)';
      ctx.lineWidth = 1;
      const innerPad = pad + Math.round(10 * fontScale);
      ctx.strokeRect(innerPad, innerPad, width - innerPad * 2, height - innerPad * 2);

      ctx.font = `bold ${titleSize}px "Cinzel", Georgia, serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(229, 169, 59, 0.4)';
      ctx.shadowBlur = Math.round(16 * fontScale);

      const titleY = subtitle ? (height / 2) - Math.round(28 * fontScale) : (height / 2);
      ctx.fillText(text.toUpperCase(), width / 2, titleY);

      if (subtitle) {
        ctx.font = `500 ${subSize}px "Plus Jakarta Sans", "Manrope", sans-serif`;
        ctx.fillStyle = '#E5A93B';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = Math.round(10 * fontScale);
        ctx.fillText(`♦   ${subtitle.toUpperCase()}   ♦`, width / 2, (height / 2) + Math.round(36 * fontScale));
      }
    }

    ctx.restore();
  }

  /**
   * Renders a lower-third / dedication overlay (text, occasion title, and author signature)
   * directly on top of the photo or video frame with professional cinematic aesthetics.
   */
  static drawDedication(
    ctx: AnyCanvasContext,
    width: number,
    height: number,
    dedication: ClipDedication,
    timeInItem: number,
    itemDuration: number
  ): void {
    if (!dedication || !dedication.enabled || !dedication.text) return;

    ctx.save();
    const fontScale = height / 1080;

    // Calculate smooth fade in/out opacity
    let opacity = 1.0;
    const fadeDuration = 0.45;
    if (timeInItem < fadeDuration) {
      opacity = Math.max(0, timeInItem / fadeDuration);
    } else if (itemDuration > fadeDuration && timeInItem > itemDuration - fadeDuration) {
      opacity = Math.max(0, (itemDuration - timeInItem) / fadeDuration);
    }
    opacity = Math.max(0, Math.min(1, opacity));
    ctx.globalAlpha = opacity;

    // Card dimensions & positioning
    const cardWidth = Math.round(width * 0.86);
    const cardHeight = Math.round(Math.max(140, Math.min(280, 210 * fontScale)));
    const x = Math.round((width - cardWidth) / 2);
    let y = Math.round(height - cardHeight - 55 * fontScale); // default 'bottom'
    if (dedication.position === 'center') {
      y = Math.round((height - cardHeight) / 2);
    } else if (dedication.position === 'top') {
      y = Math.round(65 * fontScale);
    }

    const radius = Math.round(18 * fontScale);

    // Rounded rectangle path
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + cardWidth - radius, y);
    ctx.quadraticCurveTo(x + cardWidth, y, x + cardWidth, y + radius);
    ctx.lineTo(x + cardWidth, y + cardHeight - radius);
    ctx.quadraticCurveTo(x + cardWidth, y + cardHeight, x + cardWidth - radius, y + cardHeight);
    ctx.lineTo(x + radius, y + cardHeight);
    ctx.quadraticCurveTo(x, y + cardHeight, x, y + cardHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    // Background styling
    if (dedication.style === 'romantic_script') {
      const grad = ctx.createLinearGradient(x, y, x, y + cardHeight);
      grad.addColorStop(0, 'rgba(32, 16, 20, 0.88)');
      grad.addColorStop(1, 'rgba(14, 8, 10, 0.92)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(244, 194, 194, 0.55)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      ctx.stroke();
    } else if (dedication.style === 'cinematic_lower_third') {
      const grad = ctx.createLinearGradient(x, y, x + cardWidth, y);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
      grad.addColorStop(0.12, 'rgba(6, 6, 6, 0.92)');
      grad.addColorStop(0.88, 'rgba(6, 6, 6, 0.92)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.75)';
      ctx.lineWidth = Math.max(2, Math.round(2.5 * fontScale));
      ctx.beginPath();
      ctx.moveTo(x + cardWidth * 0.08, y);
      ctx.lineTo(x + cardWidth * 0.92, y);
      ctx.moveTo(x + cardWidth * 0.08, y + cardHeight);
      ctx.lineTo(x + cardWidth * 0.92, y + cardHeight);
      ctx.stroke();
    } else if (dedication.style === 'modern_clean') {
      ctx.fillStyle = 'rgba(10, 10, 14, 0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // Default: 'gold_luxury'
      const grad = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
      grad.addColorStop(0, 'rgba(22, 17, 10, 0.90)');
      grad.addColorStop(0.5, 'rgba(10, 8, 5, 0.94)');
      grad.addColorStop(1, 'rgba(26, 20, 12, 0.90)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Outer gold border
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * fontScale));
      ctx.stroke();

      // Inner hairline
      const inset = Math.round(7 * fontScale);
      ctx.strokeRect(x + inset, y + inset, cardWidth - inset * 2, cardHeight - inset * 2);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Typography
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let currentY = y + Math.round(30 * fontScale);

    // Title / Occasion Header
    if (dedication.title) {
      const titleSize = Math.max(13, Math.round(19 * fontScale));
      ctx.font = `bold ${titleSize}px "Cinzel", "Playfair Display", Georgia, serif`;
      ctx.fillStyle = '#D4AF37';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
      ctx.shadowBlur = Math.round(10 * fontScale);
      ctx.fillText(`✦  ${dedication.title.toUpperCase()}  ✦`, width / 2, currentY);
      currentY += Math.round(26 * fontScale);
    }

    // Main Dedication Text (multi-line word wrap)
    const textSize = Math.max(14, Math.round(21 * fontScale));
    ctx.font = `italic 400 ${textSize}px "Playfair Display", "Georgia", serif`;
    ctx.fillStyle = '#FAF7F0';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = Math.round(8 * fontScale);

    const maxTextWidth = cardWidth - Math.round(80 * fontScale);
    const words = dedication.text.split(' ');
    let line = '';
    const lineHeight = Math.round(28 * fontScale);
    const lines: string[] = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim().length > 0) {
      lines.push(line.trim());
    }

    // Render up to 3 lines
    const displayLines = lines.slice(0, 3);
    for (let i = 0; i < displayLines.length; i++) {
      ctx.fillText(displayLines[i], width / 2, currentY + (i * lineHeight));
    }
    currentY += displayLines.length * lineHeight;

    // Author Signature / Date
    if (dedication.author) {
      const authorSize = Math.max(11, Math.round(14 * fontScale));
      ctx.font = `600 ${authorSize}px "Montserrat", sans-serif`;
      ctx.fillStyle = '#D4AF37';
      ctx.shadowBlur = Math.round(6 * fontScale);
      ctx.fillText(`— ${dedication.author} —`, width / 2, currentY + Math.round(10 * fontScale));
    }

    ctx.restore();
  }
}
