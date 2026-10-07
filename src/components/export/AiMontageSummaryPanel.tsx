import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Clock, 
  Film, 
  CheckCircle2, 
  Zap, 
  Play, 
  Cpu, 
  Maximize2, 
  Eye, 
  Layers, 
  Volume2, 
  Sliders, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle,
  Calendar, 
  Palette, 
  Music, 
  X,
  HardDrive
} from 'lucide-react';
import type { ProjectState, MediaClip, TimelineItem, VideoChapter, ClipCategory } from '../../types/project';
import { videoExportService } from '../../core/export/videoExportService';
import { ExportPreset, ExportResolution, VideoCodecOption, ContainerFormat } from '../../core/export/videoExportTypes';

interface AiMontageSummaryPanelProps {
  project: ProjectState;
  resolution: ExportResolution;
  fps: number;
  quality: 'standard' | 'high' | 'maximum';
  fitMode: string;
  videoCodec?: VideoCodecOption;
  container?: ContainerFormat;
  onVideoCodecChange?: (c: VideoCodecOption) => void;
  onContainerChange?: (c: ContainerFormat) => void;
  isExporting: boolean;
  onConfirmRender: () => Promise<void> | void;
}

interface ChapterPreviewData {
  id: string;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  clipCount: number;
  keyframeUrl?: string;
  emotion: string;
  timeOfDay: string;
  transition: string;
  representativeClipName: string;
}

export function AiMontageSummaryPanel({
  project,
  resolution,
  fps,
  quality,
  fitMode,
  videoCodec = 'auto',
  container = 'auto',
  onVideoCodecChange,
  onContainerChange,
  isExporting,
  onConfirmRender
}: AiMontageSummaryPanelProps) {
  const [isOptimizingGpu, setIsOptimizingGpu] = useState(false);
  const [gpuStatusMsg, setGpuStatusMsg] = useState<string | null>(null);
  const [lightboxKeyframe, setLightboxKeyframe] = useState<ChapterPreviewData | null>(null);

  // Compute total duration and clips
  const { totalDurationSec, totalClipsCount, timelineItems } = useMemo(() => {
    const items = project.timelineItems || [];
    const dur = items.reduce((acc, it) => acc + (it.duration || 0), 0);
    return {
      totalDurationSec: dur > 0 ? dur : (project.mediaLibrary || []).reduce((acc, c) => acc + (c.duration || 0), 0),
      totalClipsCount: items.length > 0 ? items.length : (project.mediaLibrary || []).length,
      timelineItems: items
    };
  }, [project.timelineItems, project.mediaLibrary]);

  // Compute Estimated Render Metrics via GPU engine
  const metrics = useMemo(() => {
    return videoExportService.calculateEstimatedRenderMetrics(
      totalDurationSec,
      fps,
      resolution,
      quality,
      videoCodec
    );
  }, [totalDurationSec, fps, resolution, quality, videoCodec]);

  // Format seconds to MM:SS or HH:MM:SS
  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Human-readable resolution label
  const resolutionDisplay = useMemo(() => {
    switch (resolution) {
      case '4k': return '4K Ultra HD (3840 × 2160)';
      case '1440p': return '2K QHD (2560 × 1440)';
      case '720p': return 'HD (1280 × 720)';
      case 'vertical_1080p': return 'Pionowy 9:16 (1080 × 1920 Reels)';
      case 'vertical_4k': return 'Pionowy 4K (2160 × 3840 Ultra HD)';
      case 'square_1080p': return 'Kwadrat 1:1 (1080 × 1080 Social)';
      default: return 'Full HD (1920 × 1080)';
    }
  }, [resolution]);

  // Category Polish Labels & Emojis
  const categoryDictionary: Record<string, { label: string; icon: string; defaultEmotion: string; defaultTime: string }> = {
    opening: { label: 'Prolog i Wprowadzenie', icon: '🎬', defaultEmotion: 'Tajemniczy & Epicki', defaultTime: 'Wprowadzenie' },
    intro: { label: 'Czołówka i Prezentacja', icon: '✨', defaultEmotion: 'Wciągający', defaultTime: 'Początek' },
    a_roll: { label: 'Główny Wątek i Postacie', icon: '🎥', defaultEmotion: 'Autentyczny', defaultTime: 'Główna Scena' },
    b_roll: { label: 'Przebitki Atmosferyczne', icon: '🎞️', defaultEmotion: 'Klimatyczny', defaultTime: 'Przebitki' },
    interview: { label: 'Głos Świadków i Relacje', icon: '🎙️', defaultEmotion: 'Szczery & Osobisty', defaultTime: 'Rozmowa' },
    action: { label: 'Dynamiczna Sekwencja', icon: '⚡', defaultEmotion: 'Eksplozywny & Dynamiczny', defaultTime: 'Punkt Zwrotny' },
    dialogue: { label: 'Scena Dialogowa', icon: '💬', defaultEmotion: 'Emocjonalny', defaultTime: 'Konfrontacja' },
    scenery: { label: 'Majestat Krajobrazu', icon: '🌄', defaultEmotion: 'Kontemplacyjny', defaultTime: 'Złota Godzina' },
    drone: { label: 'Ujęcia z Lotu Ptaka', icon: '🚁', defaultEmotion: 'Przestrzenny', defaultTime: 'Dron' },
    climax: { label: 'Punkt Kulminacyjny', icon: '🔥', defaultEmotion: 'Maksymalne Napięcie', defaultTime: 'Kulminacja' },
    ending: { label: 'Finał i Kredyty', icon: '🌟', defaultEmotion: 'Spektakularny & Refleksyjny', defaultTime: 'Zakończenie' },
    outro: { label: 'Napisy Końcowe', icon: '🏁', defaultEmotion: 'Uroczysty', defaultTime: 'Koniec' },
    preparations: { label: 'Prolog & Przygotowania', icon: '🎬', defaultEmotion: 'Skupiony & Spokojny', defaultTime: 'Początek' },
    ceremony: { label: 'Główny Moment Uroczystości', icon: '👑', defaultEmotion: 'Wzruszający & Dostojny', defaultTime: 'Kulminacja' },
    congratulations: { label: 'Radość i Gratulacje', icon: '🥂', defaultEmotion: 'Radość & Uściski', defaultTime: 'Celebracja' },
    first_dance: { label: 'Scena Artystyczna', icon: '💃', defaultEmotion: 'Artystyczny & Dynamiczny', defaultTime: 'Złota Godzina' },
    toast: { label: 'Toasty i Przemowy', icon: '🍾', defaultEmotion: 'Wzruszenie & Wiwaty', defaultTime: 'Wieczór' },
    party: { label: 'Energia i Zabawa', icon: '🎉', defaultEmotion: 'Czysta Energia & Ruch', defaultTime: 'Akcja' },
    cake: { label: 'Uroczysty Moment', icon: '🎂', defaultEmotion: 'Słodki & Radosny', defaultTime: 'Wieczór' },
    outdoor: { label: 'Sesja Plenerowa', icon: '🌿', defaultEmotion: 'Naturalny & Spokojny', defaultTime: 'Złota Godzina' }
  };

  // Derive chapter keyframes and visual structure
  const chapterPreviews: ChapterPreviewData[] = useMemo(() => {
    const clipMap = new Map<string, MediaClip>((project.mediaLibrary || []).map(c => [c.id, c]));
    
    // 1. If project has explicit chapters defined
    if (project.chapters && project.chapters.length > 0) {
      return project.chapters.map((chap, idx) => {
        // Find matching timeline clips in chapter span
        const matchedItems = timelineItems.filter(
          item => item.timelineStart >= chap.startTime - 0.5 && item.timelineStart < chap.endTime + 0.5
        );
        const firstClip = matchedItems[0] ? clipMap.get(matchedItems[0].clipId) : undefined;
        const meta = categoryDictionary[chap.chapterKey] || {
          label: chap.name,
          icon: '🎬',
          defaultEmotion: 'Romantyczny',
          defaultTime: 'Złota Godzina'
        };

        const emotion = (firstClip?.analysis as any)?.emotion || meta.defaultEmotion;
        const timeOfDay = (firstClip?.analysis as any)?.timeOfDay || meta.defaultTime;
        const transition = matchedItems[0]?.transitionIn || (idx === 0 ? 'dip_black' : 'dissolve');

        return {
          id: chap.id,
          key: chap.chapterKey,
          name: chap.name || meta.label,
          startTime: chap.startTime,
          endTime: chap.endTime,
          duration: Math.max(1, chap.endTime - chap.startTime),
          clipCount: Math.max(1, matchedItems.length),
          keyframeUrl: firstClip?.thumbnailUrl,
          emotion: typeof emotion === 'string' ? emotion : meta.defaultEmotion,
          timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : meta.defaultTime,
          transition,
          representativeClipName: firstClip?.name || `Ujęcie ${idx + 1}`
        };
      });
    }

    // 2. Synthesize chapters from timeline items and categories
    if (timelineItems.length > 0) {
      const groups: {
        category: string;
        items: TimelineItem[];
        startTime: number;
        endTime: number;
      }[] = [];

      let currentGroup: { category: string; items: TimelineItem[]; startTime: number; endTime: number } | null = null;

      timelineItems.forEach((item) => {
        const clip = clipMap.get(item.clipId);
        const cat = (clip?.category as string) || 'ceremony';

        if (!currentGroup || currentGroup.category !== cat) {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            category: cat,
            items: [item],
            startTime: item.timelineStart,
            endTime: item.timelineStart + (item.duration || 5)
          };
        } else {
          currentGroup.items.push(item);
          currentGroup.endTime = item.timelineStart + (item.duration || 5);
        }
      });

      if (currentGroup) groups.push(currentGroup);

      return groups.map((g, idx) => {
        const meta = categoryDictionary[g.category] || {
          label: `Scena ${idx + 1}`,
          icon: '🎬',
          defaultEmotion: 'Romantyczny',
          defaultTime: 'Popołudnie'
        };

        const firstClip = clipMap.get(g.items[0]?.clipId);
        const emotion = (firstClip?.analysis as any)?.emotion || meta.defaultEmotion;
        const timeOfDay = (firstClip?.analysis as any)?.timeOfDay || meta.defaultTime;
        const transition = g.items[0]?.transitionIn || (idx === 0 ? 'dip_black' : 'dissolve');

        return {
          id: `chap_synth_${idx}`,
          key: g.category,
          name: `${meta.icon} ${meta.label}`,
          startTime: g.startTime,
          endTime: g.endTime,
          duration: Math.max(1, g.endTime - g.startTime),
          clipCount: g.items.length,
          keyframeUrl: firstClip?.thumbnailUrl,
          emotion: typeof emotion === 'string' ? emotion : meta.defaultEmotion,
          timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : meta.defaultTime,
          transition,
          representativeClipName: firstClip?.name || `Klip ${idx + 1}`
        };
      });
    }

    // 3. Fallback when timeline is not populated yet
    return (project.mediaLibrary || []).slice(0, 6).map((c, idx) => {
      const meta = categoryDictionary[c.category || 'ceremony'] || {
        label: c.name,
        icon: '🎬',
        defaultEmotion: 'Romantyczny',
        defaultTime: 'Złota Godzina'
      };
      return {
        id: `lib_${c.id}`,
        key: c.category || 'ceremony',
        name: `${meta.icon} ${c.name}`,
        startTime: idx * 10,
        endTime: (idx + 1) * 10,
        duration: c.duration || 10,
        clipCount: 1,
        keyframeUrl: c.thumbnailUrl,
        emotion: meta.defaultEmotion,
        timeOfDay: meta.defaultTime,
        transition: idx === 0 ? 'dip_black' : 'dissolve',
        representativeClipName: c.name
      };
    });
  }, [project.chapters, timelineItems, project.mediaLibrary]);

  // Handle Master Confirm Button with real GPU Optimization trigger
  const handleConfirmWithGpuOptimization = async () => {
    if (isExporting || isOptimizingGpu) return;

    setIsOptimizingGpu(true);
    setGpuStatusMsg('Rozgrzewanie potoku GPU i testowanie enkodera WebCodecs...');

    try {
      const targetPreset: ExportPreset = {
        resolution,
        width: resolution === '4k' ? 3840 : (resolution === '1440p' ? 2560 : 1920),
        height: resolution === '4k' ? 2160 : (resolution === '1440p' ? 1440 : 1080),
        fps,
        videoCodec,
        container,
        audioCodec: container === 'webm' ? 'Opus' : 'AAC',
        bitrate: resolution === '4k' ? 55_000_000 : 18_000_000,
        quality,
        fitMode: fitMode as any
      };

      const result = await videoExportService.optimizeGpuPipeline(targetPreset);
      setGpuStatusMsg(result.details);

      // Brief visual affirmation before launching export
      setTimeout(async () => {
        setIsOptimizingGpu(false);
        setGpuStatusMsg(null);
        await onConfirmRender();
      }, 350);
    } catch (err: any) {
      console.warn('[AiMontageSummaryPanel] GPU optimization warning:', err);
      setIsOptimizingGpu(false);
      setGpuStatusMsg(null);
      await onConfirmRender();
    }
  };

  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl animate-fadeIn space-y-6">
      {/* Ambient lighting */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4 relative z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-400 font-mono">
              AUDYT PRZEDEKSPORTOWY • PRE-FLIGHT MASTER
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-heading tracking-tight flex items-center gap-2.5">
            <Film className="w-5 h-5 text-indigo-400" />
            Panel Podsumowujący: Montaż Studio
          </h2>
          <p className="text-xs text-zinc-400">
            Kompletny scenariusz produkcji ({totalClipsCount} ujęć, {formatTime(totalDurationSec)}) ze sprzętową akceleracją GPU.
          </p>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-bold font-mono self-start sm:self-auto shadow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>GOTOWY DO RENDEROWANIA MASTER</span>
        </div>
      </div>

      {/* Warnings & Validation */}
      {(resolution.includes('4k') && totalClipsCount > 20) && (
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 flex items-start gap-3 relative z-10">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider">
              Złożony Projekt 4K
            </h4>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              Projekt zawiera ponad 20 ujęć w rozdzielczości 4K. Renderowanie sprzętowe WebCodecs wykorzysta akcelerację GPU. Nie zamykaj karty przeglądarki podczas generowania pliku.
            </p>
          </div>
        </div>
      )}

      {/* Real-time Render Estimation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
        <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Czas Renderu:</span>
          </div>
          <div className="text-base font-bold text-white font-mono">
            ~{metrics.estimatedSeconds < 60 ? `${metrics.estimatedSeconds}s` : `${Math.floor(metrics.estimatedSeconds / 60)}m ${metrics.estimatedSeconds % 60}s`}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono block">
            Prędkość: ~{metrics.renderSpeedFactor}x RT
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-400">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>Szacowany Rozmiar:</span>
          </div>
          <div className="text-base font-bold text-emerald-300 font-mono">
            ~{metrics.estimatedSizeMb} MB
          </div>
          <span className="text-[10px] text-zinc-500 font-mono block">
            Jakość: {quality === 'maximum' ? 'Master Bitrate' : quality === 'high' ? 'Studio Bitrate' : 'Standard'}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>Klatki Łącznie:</span>
          </div>
          <div className="text-base font-bold text-purple-300 font-mono">
            {metrics.totalFrames.toLocaleString()} klatek
          </div>
          <span className="text-[10px] text-zinc-500 font-mono block">
            {fps} FPS ({resolution})
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1">
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-zinc-400">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Enkoder:</span>
          </div>
          <div className="text-base font-bold text-cyan-300 font-mono truncate">
            {videoCodec === 'auto' ? 'WebCodecs GPU' : videoCodec}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono block truncate">
            Format: {container.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Soundwave & Feature Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono relative z-10">
        <div className="flex items-center gap-2 text-indigo-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Akceleracja WebCodecs</span>
        </div>
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Automatyczny Crossfade</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Ducking mowy (-18dB)</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Potok GPU Zero-Copy</span>
        </div>
      </div>

      {/* GPU STATUS BANNER */}
      {gpuStatusMsg && (
        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-indigo-500/50 text-xs font-mono text-indigo-300 flex items-center gap-2.5 animate-pulse relative z-10">
          <Zap className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>{gpuStatusMsg}</span>
        </div>
      )}

      {/* MASTER ACTION BUTTON */}
      <div className="pt-2 relative z-10">
        <button
          onClick={handleConfirmWithGpuOptimization}
          disabled={isExporting || isOptimizingGpu || totalClipsCount === 0}
          className="group relative w-full py-4 px-8 rounded-2xl btn-primary hover:brightness-110 active:scale-[0.99] text-white font-bold text-sm sm:text-base tracking-wider uppercase transition-all shadow-xl shadow-indigo-600/30 disabled:opacity-50 cursor-pointer overflow-hidden flex items-center justify-center gap-3"
        >
          {isOptimizingGpu ? (
            <>
              <Zap className="w-5 h-5 text-white animate-spin" />
              <span>OPTYMALIZACJA POTOKU GPU W TOKU...</span>
            </>
          ) : isExporting ? (
            <>
              <Film className="w-5 h-5 text-white animate-pulse" />
              <span>RENDEROWANIE W TOKU...</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Play className="w-4 h-4 fill-white text-white" />
              </div>
              <span>POTWIERDŹ RENDEROWANIE (OPTYMALIZACJA GPU & EXPORT)</span>
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/20 border border-white/20 font-bold">
                <Cpu className="w-3 h-3" /> MASTER 4K/1080P
              </div>
            </>
          )}
        </button>
      </div>

      {/* LIGHTBOX KEYFRAME DETAIL MODAL */}
      {lightboxKeyframe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setLightboxKeyframe(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400" />
              <h3 className="text-base font-bold text-white">
                Podgląd Klatki Kluczowej: {lightboxKeyframe.name}
              </h3>
            </div>

            <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-zinc-800 bg-black">
              {lightboxKeyframe.keyframeUrl ? (
                <img
                  src={lightboxKeyframe.keyframeUrl}
                  alt={lightboxKeyframe.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
                  Brak wygenerowanej miniatury dla tego rozdziału
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-white">
                Oś czasu: {formatTime(lightboxKeyframe.startTime)} – {formatTime(lightboxKeyframe.endTime)} ({formatTime(lightboxKeyframe.duration)})
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Liczba ujęć:</span>
                <span className="font-bold text-white">{lightboxKeyframe.clipCount} ujęć</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Kategoria:</span>
                <span className="font-bold text-indigo-300">{lightboxKeyframe.emotion}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Pora Dnia:</span>
                <span className="font-bold text-cyan-300">{lightboxKeyframe.timeOfDay}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Przejście:</span>
                <span className="font-bold text-white">{lightboxKeyframe.transition}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setLightboxKeyframe(null)}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-xs font-bold font-mono cursor-pointer transition-colors"
              >
                Zamknij Podgląd
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
