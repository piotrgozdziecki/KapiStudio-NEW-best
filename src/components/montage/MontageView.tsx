import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  SkipBack, 
  SkipForward, 
  Scissors, 
  Volume2, 
  VolumeX, 
  RotateCw, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Film, 
  Layers, 
  Clock, 
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Sparkles,
  ArrowRight,
  Monitor,
  Smartphone,
  Eye,
  ImageIcon,
  Gauge,
  Wand2,
  Type,
  Mic,
  Music,
  Upload,
  Activity,
  FileText,
  Flame,
  ZapOff,
  Zap,
  Plus,
  Copy,
  Split,
  Palette,
  Sun,
  Contrast,
  SlidersHorizontal
} from 'lucide-react';
import type { ProjectState, TimelineItem, MediaClip, FitMode, TransitionType, TitleCard, AudioTrackItem } from '../../types/project';
import { urlRegistry } from '../../core/media/urlRegistry';
import { thumbnailCache } from '../../core/media/thumbnailCache';
import { resolveClipMediaUrl, resolveAudioTrackUrl } from '../../core/media/mediaResolver';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';
import { useStudioToast } from '../common/ToastContext';
import { proxyEngine } from '../../core/proxy/proxyEngine';
import { adaptiveResourceManager, SystemMetrics } from '../../core/performance/adaptiveResourceManager';
import { SequenceManager } from '../../core/sequence/sequenceManager';
import { liveAudioEngine } from '../../core/audio/liveAudioEngine';
import { AudioVuMeter } from '../player/AudioVuMeter';

export type BeautyPreset = 
  | 'none' 
  | 'beauty_glow' 
  | 'hollywood_warm' 
  | 'teal_orange' 
  | 'glamour_soft' 
  | 'nordic_frost' 
  | 'vintage_35mm' 
  | 'moody_noir' 
  | 'vibrant_pop';

export interface BeautyGradeSettings {
  enabled: boolean;
  preset: BeautyPreset;
  skinGlow: number; // 0 - 100
  brightness: number; // 80 - 140 (%)
  contrast: number; // 80 - 150 (%)
  saturation: number; // 0 - 200 (%)
  warmth: number; // -50 to +50
  vignette: number; // 0 - 100
  sharpness: number; // 0 - 100
}

export const BEAUTY_PRESETS: Record<BeautyPreset, { name: string; icon: string; desc: string; settings: Omit<BeautyGradeSettings, 'preset'> }> = {
  none: {
    name: 'Oryginał',
    icon: '⭕',
    desc: 'Bez efektów kolorystycznych',
    settings: { enabled: false, skinGlow: 0, brightness: 100, contrast: 100, saturation: 100, warmth: 0, vignette: 0, sharpness: 0 }
  },
  beauty_glow: {
    name: 'Efekt Piękna Pro',
    icon: '✨',
    desc: 'Wygładzenie cery, naturalny blask, świeże oświetlenie',
    settings: { enabled: true, skinGlow: 45, brightness: 105, contrast: 104, saturation: 112, warmth: 8, vignette: 18, sharpness: 20 }
  },
  hollywood_warm: {
    name: 'Złoty Hollywood',
    icon: '🎬',
    desc: 'Ciepłe złociste tony kinowe i miękkie przejścia tonalne',
    settings: { enabled: true, skinGlow: 35, brightness: 104, contrast: 110, saturation: 118, warmth: 24, vignette: 25, sharpness: 15 }
  },
  teal_orange: {
    name: 'Teal & Orange',
    icon: '🎥',
    desc: 'Nowoczesna kinowa gradacja barwna z głębokim błękitem',
    settings: { enabled: true, skinGlow: 25, brightness: 102, contrast: 116, saturation: 125, warmth: -4, vignette: 30, sharpness: 25 }
  },
  glamour_soft: {
    name: 'Glamour Dream',
    icon: '💎',
    desc: 'Miękkie rozświetlenie, eteryczna poświata i redukcja szumu',
    settings: { enabled: true, skinGlow: 65, brightness: 108, contrast: 98, saturation: 105, warmth: 12, vignette: 22, sharpness: 5 }
  },
  nordic_frost: {
    name: 'Nordic Frost',
    icon: '❄️',
    desc: 'Chłodny, elegancki błękit i krystaliczna przejrzystość',
    settings: { enabled: true, skinGlow: 20, brightness: 102, contrast: 108, saturation: 92, warmth: -25, vignette: 20, sharpness: 20 }
  },
  vintage_35mm: {
    name: 'Vintage 35mm',
    icon: '🎞️',
    desc: 'Ciepły analogowy film, styl klasycznej taśmy filmowej',
    settings: { enabled: true, skinGlow: 30, brightness: 98, contrast: 112, saturation: 88, warmth: 18, vignette: 35, sharpness: 10 }
  },
  moody_noir: {
    name: 'Moody Noir',
    icon: '🖤',
    desc: 'Artystyczny czarno-biały kontrast z głęboką czernią',
    settings: { enabled: true, skinGlow: 0, brightness: 96, contrast: 135, saturation: 0, warmth: 0, vignette: 45, sharpness: 30 }
  },
  vibrant_pop: {
    name: 'Vibrant Pop',
    icon: '🌈',
    desc: 'Soczyste nasycenie kolorów, dynamika i żywy kontrast',
    settings: { enabled: true, skinGlow: 30, brightness: 103, contrast: 108, saturation: 140, warmth: 6, vignette: 12, sharpness: 25 }
  }
};

interface MontageViewProps {
  project: ProjectState;
  onUpdateTimelineItem: (id: string, updates: Partial<TimelineItem>) => void;
  onDeleteTimelineItem: (id: string) => void;
  onMoveTimelineItemOrder: (fromIndex: number, toIndex: number) => void;
  onNavigateTab: (tab: string) => void;
  onAddAudioTrack?: (track: AudioTrackItem) => void;
  onUpdateAudioTrack?: (id: string, updates: Partial<AudioTrackItem>) => void;
  onDeleteAudioTrack?: (id: string) => void;
  onUpdateTimelineItems?: (items: TimelineItem[]) => void;
  onOpenVoiceRecorder?: () => void;
  onOpenBeatSync?: () => void;
  onOpenAutoCaptions?: () => void;
  onSplitTimelineItem?: (id: string, splitAtSourceTime: number) => void;
  onCreateSequence?: (name: string, aspectRatio?: any) => void;
  onSwitchSequence?: (sequenceId: string) => void;
  onDuplicateSequence?: (sequenceId: string, newName?: string, targetAspectRatio?: any) => void;
  onDeleteSequence?: (sequenceId: string) => void;
}

type AspectRatioMode = '16:9' | '9:16' | '4:3' | '1:1';

const formatTimeSimple = (sec: number) => {
  const mins = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${parseFloat(s) < 10 ? '0' : ''}${s}`;
};

const formatTimePrecise = (sec: number) => {
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

/**
 * Highly optimized, memoized TimelineItemCard
 * Features:
 * - Asynchronous, lazy thumbnail and filmstrip loading via IntersectionObserver
 * - Cached thumbnail reuse from memory-bounded ThumbnailCache
 * - Isolated from 60fps playhead ticks: does not re-render on currentTime updates
 * - Multi-frame filmstrip tiles when zoomed in or on longer items
 */
interface TimelineItemCardProps {
  item: TimelineItem;
  clip: MediaClip | undefined;
  idx: number;
  isSelected: boolean;
  isDraggingThis: boolean;
  isTargetingThis: boolean;
  widthPct: number;
  timelineZoom: number;
  onSelect: (id: string, start: number) => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (idx: number, e: React.DragEvent) => void;
  onResolveClipUrl: (clip: MediaClip) => Promise<string | null>;
}

const TimelineItemCard = memo(function TimelineItemCard({
  item,
  clip,
  idx,
  isSelected,
  isDraggingThis,
  isTargetingThis,
  widthPct,
  timelineZoom,
  onSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onResolveClipUrl
}: TimelineItemCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cachedThumbnails, setCachedThumbnails] = useState<string[]>(() => {
    if (!clip) return [];
    const directKey = thumbnailCache.getCachedThumbnail(clip.id, item.sourceStart);
    if (directKey) return [directKey];
    if (clip.thumbnailUrl) return [clip.thumbnailUrl];
    return [];
  });
  const [isVisible, setIsVisible] = useState(false);

  // Lazy-load thumbnails only when card enters the viewport or buffer
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch or generate thumbnails when visible
  useEffect(() => {
    if (!isVisible || !clip) return;

    let isCancelled = false;

    const loadThumbnails = async () => {
      // If image, use thumbnail or image source directly
      if (clip.type === 'image') {
        const url = clip.thumbnailUrl || clip.objectUrl;
        if (url && !isCancelled) {
          setCachedThumbnails([url]);
        }
        return;
      }

      const getUrl = async () => onResolveClipUrl(clip);

      // Determine strip frame count based on zoom and duration
      const effectivePixelWidth = (widthPct / 100) * 1200 * (timelineZoom / 100);
      const targetFrames = effectivePixelWidth > 220 && item.duration > 3 ? 3 : (effectivePixelWidth > 110 ? 2 : 1);

      if (targetFrames > 1) {
        try {
          const strip = await thumbnailCache.getOrRequestTimelineStrip(
            clip.id,
            item.sourceStart,
            item.duration,
            getUrl,
            targetFrames
          );
          if (!isCancelled && strip.length > 0) {
            setCachedThumbnails(strip);
            return;
          }
        } catch (e) {
          // fallback to single thumbnail
        }
      }

      // Single frame at sourceStart
      try {
        const thumb = await thumbnailCache.getOrRequestThumbnail(
          clip.id,
          item.sourceStart,
          getUrl,
          { width: 140, height: 80, quality: 0.65 }
        );
        if (!isCancelled && thumb) {
          setCachedThumbnails([thumb]);
        } else if (!isCancelled && clip.thumbnailUrl) {
          setCachedThumbnails([clip.thumbnailUrl]);
        }
      } catch (e) {
        if (!isCancelled && clip.thumbnailUrl) {
          setCachedThumbnails([clip.thumbnailUrl]);
        }
      }
    };

    loadThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [isVisible, clip, item.sourceStart, item.duration, widthPct, timelineZoom, onResolveClipUrl]);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={(e) => onDragStart(idx, e)}
      onDragOver={(e) => onDragOver(idx, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(idx, e)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id, item.timelineStart);
      }}
      style={{ width: `${widthPct}%` }}
      className={`h-full border-r border-zinc-800/80 p-2 flex flex-col justify-between overflow-hidden transition-all relative cursor-grab active:cursor-grabbing select-none ${
        isDraggingThis ? 'opacity-40 scale-95 shadow-inner' : ''
      } ${
        isTargetingThis ? 'border-l-4 border-l-indigo-500' : ''
      } ${
        isSelected 
          ? 'bg-zinc-800/90 border-t-2 border-t-indigo-500 shadow-xl shadow-indigo-950/40 z-10' 
          : 'bg-zinc-900/90 hover:bg-zinc-850'
      }`}
    >
      {/* Background Filmstrip / Cached Thumbnail Preview with smooth gradient overlay */}
      {cachedThumbnails.length > 0 ? (
        <div className="absolute inset-0 flex pointer-events-none overflow-hidden opacity-30">
          {cachedThumbnails.map((tUrl, tIdx) => (
            <div 
              key={tIdx}
              className="flex-1 h-full bg-cover bg-center border-r border-black/40 last:border-r-0 transition-opacity duration-300"
              style={{ backgroundImage: `url(${tUrl})` }}
            />
          ))}
          {/* Subtle gradient vignette for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/70" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
          <Film className="w-8 h-8 text-white" />
        </div>
      )}

      {/* Header in Clip */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-mono drop-shadow-sm">
        <span className="font-bold text-zinc-100 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/10">
          #{idx + 1}
        </span>
        <span className="text-[10px] text-indigo-300 font-bold px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md border border-indigo-500/20">
          {item.duration.toFixed(1)}s
        </span>
      </div>

      {/* Clip Name */}
      <div className="relative z-10 text-[11px] text-zinc-200 truncate font-semibold drop-shadow-sm px-0.5">
        {clip?.name || 'Ujęcie'}
      </div>

      {/* Timeline In/Out boundaries */}
      <div className="relative z-10 text-[9px] text-zinc-400 font-mono flex justify-between drop-shadow-sm px-0.5">
        <span className="bg-black/50 px-1 rounded border border-white/5">{formatTimeSimple(item.timelineStart)}</span>
        <span className="bg-black/50 px-1 rounded border border-white/5">{formatTimeSimple(item.timelineStart + item.duration)}</span>
      </div>
    </div>
  );
});

export function MontageView({
  project,
  onUpdateTimelineItem,
  onDeleteTimelineItem,
  onMoveTimelineItemOrder,
  onNavigateTab,
  onAddAudioTrack,
  onUpdateAudioTrack,
  onDeleteAudioTrack,
  onUpdateTimelineItems,
  onOpenVoiceRecorder,
  onOpenBeatSync,
  onOpenAutoCaptions,
  onSplitTimelineItem,
  onCreateSequence,
  onSwitchSequence,
  onDuplicateSequence,
  onDeleteSequence
}: MontageViewProps) {
  const toast = useStudioToast();
  const fileAudioInputRef = useRef<HTMLInputElement>(null);

  const clips = project.mediaLibrary || [];
  const clipMap = useMemo(() => new Map<string, MediaClip>(clips.map(c => [c.id, c])), [clips]);

  const sortedItems = useMemo(() => {
    return [...(project.timelineItems || [])].sort((a, b) => a.timelineStart - b.timelineStart);
  }, [project.timelineItems]);

  const totalDuration = useMemo(() => {
    return sortedItems.reduce((acc, item) => Math.max(acc, item.timelineStart + item.duration), 0);
  }, [sortedItems]);

  // Selected Clip
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    sortedItems.length > 0 ? sortedItems[0].id : null
  );

  // Playback & Timing
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Display & Framing Options
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('16:9');
  const [fitStyle, setFitStyle] = useState<'fit' | 'fill' | 'blur'>('fit');
  const [timelineZoom, setTimelineZoom] = useState<number>(100); // 50% to 300%
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Proxy Playback & Adaptive Resource Engine (ETAP 2)
  const [useProxyPreview, setUseProxyPreview] = useState<boolean>(true);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>(adaptiveResourceManager.getMetrics());
  const [isGeneratingAllProxies, setIsGeneratingAllProxies] = useState<boolean>(false);

  // Studio Efektów Piękna & Color Grading (Beauty Polish, Skin Glow, Cinematic LUTs)
  const [beautyGrade, setBeautyGrade] = useState<BeautyGradeSettings>({
    enabled: true,
    preset: 'beauty_glow',
    skinGlow: 45,
    brightness: 105,
    contrast: 104,
    saturation: 112,
    warmth: 8,
    vignette: 18,
    sharpness: 20
  });
  const [isBeautyStudioOpen, setIsBeautyStudioOpen] = useState<boolean>(false);

  const beautyFilterStyle = useMemo(() => {
    if (!beautyGrade.enabled) return 'none';
    const b = beautyGrade.brightness / 100;
    const c = beautyGrade.contrast / 100;
    const s = beautyGrade.saturation / 100;
    const warmth = beautyGrade.warmth;
    const sepia = warmth > 0 ? (warmth / 100) * 0.28 : 0;
    const hue = warmth < 0 ? (warmth / 50) * 14 : (warmth / 50) * 6;
    
    return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sepia}) hue-rotate(${hue}deg)`;
  }, [beautyGrade]);

  const handleApplyBeautyPreset = useCallback((presetKey: BeautyPreset) => {
    const preset = BEAUTY_PRESETS[presetKey];
    if (!preset) return;
    setBeautyGrade({
      preset: presetKey,
      ...preset.settings
    });
    if (presetKey === 'none') {
      toast.showInfo('Wyłączono filtry barwne (Oryginalny obraz).');
    } else {
      toast.showSuccess(`✨ Zastosowano styl: ${preset.name}`);
    }
  }, [toast]);

  // Sequences Management Modal / Quick Creator
  const [isNewSeqModalOpen, setIsNewSeqModalOpen] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqAspect, setNewSeqAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');

  // Drag & drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Hover Scrub Tooltip
  const [hoverPosition, setHoverPosition] = useState<{ xPct: number; timeSec: number } | null>(null);

  // DOM Refs
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const offscreenAudioHostRef = useRef<HTMLDivElement>(null);
  const lastActiveClipIdRef = useRef<string | null>(null);

  // Target FPS
  const targetFps = project.settings?.targetFps || 30;
  const currentFrameIndex = Math.floor(currentTime * targetFps);

  // Subscribe to real-time adaptive resource load
  useEffect(() => {
    const unsub = adaptiveResourceManager.subscribe(setSystemMetrics);
    return unsub;
  }, []);

  // Sync selected item
  useEffect(() => {
    if (sortedItems.length > 0 && (!selectedItemId || !sortedItems.some(i => i.id === selectedItemId))) {
      setSelectedItemId(sortedItems[0].id);
    }
  }, [sortedItems, selectedItemId]);

  const selectedItem = sortedItems.find(i => i.id === selectedItemId);
  const selectedClip = selectedItem ? clipMap.get(selectedItem.clipId) : null;

  // Selected Clip thumbnail state for Inspector
  const [inspectorThumbnail, setInspectorThumbnail] = useState<string | null>(null);

  // Find active item at currentTime
  const activeTimelineItem = useMemo(() => {
    return sortedItems.find(item => 
      currentTime >= item.timelineStart && currentTime < (item.timelineStart + item.duration)
    ) || (currentTime >= totalDuration && sortedItems.length > 0 ? sortedItems[sortedItems.length - 1] : sortedItems[0]);
  }, [sortedItems, currentTime, totalDuration]);

  const activeClip = activeTimelineItem ? clipMap.get(activeTimelineItem.clipId) : null;

  const isPlayingProxy = useMemo(() => {
    if (!useProxyPreview || !activeClip || activeClip.type !== 'video') return false;
    return Boolean(activeClip.isProxyReady || activeClip.proxyUrl || activeClip.proxyStatus === 'PROXY_READY');
  }, [useProxyPreview, activeClip]);

  const activeDedication = useMemo(() => {
    if (!activeTimelineItem?.dedication?.enabled || !activeTimelineItem.dedication.text) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const maxDur = activeTimelineItem.dedication.displayDuration || activeTimelineItem.duration;
    if (itemOffset >= 0 && itemOffset <= maxDur) {
      return activeTimelineItem.dedication;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  // Asynchronously resolve active clip URL if missing or dead
  const [resolvedClipUrls, setResolvedClipUrls] = useState<Record<string, string>>({});

  const resolveClipUrl = useCallback(async (clip: MediaClip): Promise<string | null> => {
    if (!clip) return null;
    // If proxy requested and ready, prioritize proxy URL
    if (useProxyPreview && clip.type === 'video' && clip.proxyUrl && urlRegistry.isAlive(clip.proxyUrl)) {
      return clip.proxyUrl;
    }
    const fresh = await resolveClipMediaUrl(clip, useProxyPreview);
    if (fresh) {
      setResolvedClipUrls(prev => ({ ...prev, [clip.id]: fresh }));
      return fresh;
    }
    if (clip.objectUrl && (clip.objectUrl.startsWith('http') || clip.objectUrl.startsWith('data:') || urlRegistry.isAlive(clip.objectUrl))) {
      return clip.objectUrl;
    }
    if (clip.thumbnailUrl) {
      return clip.thumbnailUrl;
    }
    return null;
  }, [useProxyPreview]);

  // Split at current playhead frame
  const handleSplitAtPlayhead = useCallback(() => {
    if (!onSplitTimelineItem || totalDuration === 0) return;
    const itemAtPlayhead = sortedItems.find(
      i => currentTime >= i.timelineStart && currentTime < (i.timelineStart + i.duration)
    );
    if (!itemAtPlayhead) {
      toast.showWarning('Ustaw suwak czasu na ujęciu, które chcesz rozciąć.');
      return;
    }

    const localTimeSec = currentTime - itemAtPlayhead.timelineStart;
    const speed = itemAtPlayhead.speed || 1;
    const sourceSplitTime = itemAtPlayhead.sourceStart + (localTimeSec * speed);

    if (sourceSplitTime <= itemAtPlayhead.sourceStart + 0.1 || sourceSplitTime >= itemAtPlayhead.sourceEnd - 0.1) {
      toast.showWarning('Suwak czasu znajduje się zbyt blisko krawędzi ujęcia (margines min. 0.1s).');
      return;
    }

    onSplitTimelineItem(itemAtPlayhead.id, sourceSplitTime);
    toast.showSuccess(`✂️ Rozcięto ujęcie w czasie ${formatTimePrecise(currentTime)}.`);
  }, [onSplitTimelineItem, sortedItems, currentTime, totalDuration, toast]);

  // 1-Click batch generate proxies for all clips currently in timeline
  const handleBatchGenerateTimelineProxies = useCallback(() => {
    const videoItems = sortedItems.map(i => clipMap.get(i.clipId)).filter((c): c is MediaClip => Boolean(c && c.type === 'video'));
    const unproxied = videoItems.filter(c => !c.isProxyReady && c.proxyStatus !== 'PROXY_READY');
    if (unproxied.length === 0) {
      toast.showInfo('Wszystkie ujęcia na osi czasu posiadają już gotowe pliki robocze Proxy.');
      return;
    }

    setIsGeneratingAllProxies(true);
    unproxied.forEach(c => {
      proxyEngine.enqueueClip(c, 'medium_720p');
    });
    toast.showSuccess(`⚡ Dodano ${unproxied.length} ujęć z osi czasu do kolejki generowania Proxy 720p.`);
    setTimeout(() => setIsGeneratingAllProxies(false), 2500);
  }, [sortedItems, clipMap, toast]);

  // Pre-resolve all clips in timeline so switching between them has zero black frames
  useEffect(() => {
    if (sortedItems.length === 0) return;
    let isCancelled = false;
    sortedItems.forEach(item => {
      const clip = clipMap.get(item.clipId);
      if (clip && !resolvedClipUrls[clip.id]) {
        resolveClipUrl(clip).then(url => {
          if (!isCancelled && url) {
            setResolvedClipUrls(prev => ({ ...prev, [clip.id]: url }));
          }
        });
      }
    });
    return () => { isCancelled = true; };
  }, [sortedItems, clipMap, resolveClipUrl]);

  useEffect(() => {
    if (!activeClip) return;
    if (activeClip.objectUrl && (activeClip.objectUrl.startsWith('http') || activeClip.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeClip.objectUrl))) {
      return;
    }
    let isCancelled = false;
    resolveClipUrl(activeClip).then(fresh => {
      if (!isCancelled && fresh) {
        setResolvedClipUrls(prev => ({ ...prev, [activeClip.id]: fresh }));
      }
    });
    return () => { isCancelled = true; };
  }, [activeClip, resolveClipUrl]);

  // Update Inspector thumbnail when selected item or trim changes
  useEffect(() => {
    if (!selectedClip || !selectedItem) {
      setInspectorThumbnail(null);
      return;
    }
    let isCancelled = false;
    const direct = thumbnailCache.getCachedThumbnail(selectedClip.id, selectedItem.sourceStart);
    if (direct) {
      setInspectorThumbnail(direct);
      return;
    }
    if (selectedClip.thumbnailUrl) {
      setInspectorThumbnail(selectedClip.thumbnailUrl);
    }
    thumbnailCache.getOrRequestThumbnail(
      selectedClip.id,
      selectedItem.sourceStart,
      () => resolveClipUrl(selectedClip),
      { width: 240, height: 135, quality: 0.72 }
    ).then((thumb) => {
      if (!isCancelled && thumb) {
        setInspectorThumbnail(thumb);
      }
    });

    return () => { isCancelled = true; };
  }, [selectedClip, selectedItem?.sourceStart, resolveClipUrl]);

  const activeMediaSourceUrl = useMemo(() => {
    if (!activeClip) return '';
    // Prefer Proxy URL when Proxy Mode is active
    if (useProxyPreview && activeClip.type === 'video' && activeClip.proxyUrl && urlRegistry.isAlive(activeClip.proxyUrl)) {
      return activeClip.proxyUrl;
    }
    if (activeClip.objectUrl && (activeClip.objectUrl.startsWith('http') || activeClip.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeClip.objectUrl))) {
      return activeClip.objectUrl;
    }
    if (activeClip.file) {
      try {
        const u = urlRegistry.create(activeClip.file);
        activeClip.objectUrl = u;
        return u;
      } catch (e) {}
    }
    if (resolvedClipUrls[activeClip.id]) {
      return resolvedClipUrls[activeClip.id];
    }
    if (activeClip.type === 'image') {
      return activeClip.thumbnailUrl || '';
    }
    return '';
  }, [activeClip, resolvedClipUrls, useProxyPreview]);

  const activeTitleCard = useMemo(() => {
    if (!activeTimelineItem?.titleCard?.enabled) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const cardDuration = Math.min(Math.max(0.8, activeTimelineItem.duration * 0.35), activeTimelineItem.titleCard.duration || 2.5);
    if (itemOffset < cardDuration) {
      return activeTimelineItem.titleCard;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  const activeOutroCard = useMemo(() => {
    if (!activeTimelineItem?.outroCard?.enabled) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const cardDuration = Math.min(Math.max(1.0, activeTimelineItem.duration * 0.5), activeTimelineItem.outroCard.duration || 3.5);
    const outroStart = Math.max(0, activeTimelineItem.duration - cardDuration);
    if (itemOffset >= outroStart) {
      return activeTimelineItem.outroCard;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  // Playback Loop via rAF
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      audioPoolRef.current.forEach(a => { try { a.pause(); } catch(e) {} });
      return;
    }

    lastTickTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      const vid = videoRef.current;
      if (vid && !vid.paused && vid.readyState >= 2 && activeTimelineItem && activeClip?.type === 'video') {
        const speed = activeTimelineItem.speed || 1;
        const vidElapsed = Math.max(0, (vid.currentTime - activeTimelineItem.sourceStart) / speed);
        const syncCurrent = activeTimelineItem.timelineStart + vidElapsed;
        if (syncCurrent >= totalDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
          lastActiveClipIdRef.current = null;
          return;
        }
        setCurrentTime(syncCurrent);
      } else {
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= totalDuration) {
            setIsPlaying(false);
            lastActiveClipIdRef.current = null;
            return 0;
          }
          return next;
        });
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration, activeTimelineItem, activeClip]);

  // Sync HTML5 video element with active item and currentTime
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activeTimelineItem || !activeClip || activeClip.type === 'image') {
      lastActiveClipIdRef.current = null;
      return;
    }

    if (activeMediaSourceUrl && vid.src !== activeMediaSourceUrl) {
      vid.src = activeMediaSourceUrl;
    }

    const timeInItem = Math.max(0, currentTime - activeTimelineItem.timelineStart);
    const speed = activeTimelineItem.speed || 1;
    const targetSourceTime = activeTimelineItem.sourceStart + (timeInItem * speed);

    const isNewClip = lastActiveClipIdRef.current !== activeClip.id;
    if (isNewClip) {
      lastActiveClipIdRef.current = activeClip.id;
      if (Number.isFinite(targetSourceTime)) {
        try { vid.currentTime = targetSourceTime; } catch (e) {}
      }
    } else if (!isPlaying || Math.abs(vid.currentTime - targetSourceTime) > 0.8) {
      if (Number.isFinite(targetSourceTime)) {
        try { vid.currentTime = targetSourceTime; } catch (e) {}
      }
    }

    const finalMuted = isMuted || Boolean(activeTimelineItem.muted);
    const finalVolume = finalMuted ? 0 : Math.min(1, Math.max(0, volume * (activeTimelineItem.volume ?? 1)));
    if (vid.muted !== finalMuted) {
      vid.muted = finalMuted;
    }
    vid.volume = finalVolume;
    vid.playbackRate = speed;

    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [currentTime, activeTimelineItem, activeClip, isPlaying, volume, isMuted, activeMediaSourceUrl]);

  // Sync background audio tracks in MontageView with continuous playback across photo transitions
  useEffect(() => {
    liveAudioEngine.setMasterVolume(volume, isMuted);
    liveAudioEngine.syncAudioTracks(
      project.audioTracks || [],
      currentTime,
      isPlaying,
      project.settings?.audioBalance?.musicVolume ?? 0.85
    );
  }, [currentTime, isPlaying, isMuted, volume, project.audioTracks, project.settings?.audioBalance]);

  // Render lightweight blurred background if 'blur' style is enabled
  useEffect(() => {
    const vid = videoRef.current;
    const canvas = blurCanvasRef.current;
    if (!vid || !canvas || fitStyle !== 'blur') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use small 64x36 scratch canvas for blur efficiency without GPU lag
    canvas.width = 64;
    canvas.height = 36;
    try {
      ctx.drawImage(vid, 0, 0, 64, 36);
    } catch {}
  }, [currentTime, fitStyle, activeClip]);

  const handlePlayToggle = () => {
    if (totalDuration === 0) return;
    const next = !isPlaying;
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
      lastActiveClipIdRef.current = null;
    }

    // Unlock browser AudioContext immediately on user interaction
    liveAudioEngine.resume();
    liveAudioEngine.setMasterVolume(volume, isMuted);

    setIsPlaying(next);
    if (next) {
      if (videoRef.current && activeClip?.type === 'video') {
        videoRef.current.muted = isMuted || Boolean(activeTimelineItem?.muted);
        liveAudioEngine.connectVideoElement(videoRef.current);
        videoRef.current.play().catch(() => {});
      }
      liveAudioEngine.syncAudioTracks(
        project.audioTracks || [],
        currentTime,
        true,
        project.settings?.audioBalance?.musicVolume ?? 0.85
      );
    } else {
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      liveAudioEngine.pauseAll();
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
    liveAudioEngine.pauseAll();
  };

  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, totalDuration));
    setCurrentTime(clamped);
  };

  // Skip ±5 seconds
  const handleSkip = (seconds: number) => {
    handleSeek(currentTime + seconds);
  };

  // Step exact frames
  const handleStepFrames = (frames: number) => {
    const frameInterval = 1 / targetFps;
    handleSeek(currentTime + (frames * frameInterval));
  };

  // Trim Handler for Start and End handles
  const handleTrimChange = (type: 'start' | 'end', value: number) => {
    if (!selectedItem || !selectedClip) return;
    const sourceDuration = selectedClip.duration || 10;

    if (type === 'start') {
      const clampedStart = Math.max(0, Math.min(value, selectedItem.sourceEnd - 0.2));
      const newDur = selectedItem.sourceEnd - clampedStart;
      onUpdateTimelineItem(selectedItem.id, {
        sourceStart: clampedStart,
        duration: newDur
      });
      handleSeek(selectedItem.timelineStart);
    } else {
      const clampedEnd = Math.min(sourceDuration, Math.max(value, selectedItem.sourceStart + 0.2));
      const newDur = clampedEnd - selectedItem.sourceStart;
      onUpdateTimelineItem(selectedItem.id, {
        sourceEnd: clampedEnd,
        duration: newDur
      });
      handleSeek(selectedItem.timelineStart + newDur);
    }
  };

  // Upload custom MP3 / audio soundtrack file
  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAddAudioTrack) return;

    const trackId = `music_${Date.now()}`;
    const url = urlRegistry.create(file);

    try {
      await localIndexedDB.saveMediaBlob(trackId, file);
    } catch (err) {
      console.warn('Could not save audio file to IndexedDB:', err);
    }

    // Probe duration accurately
    let duration = 30;
    try {
      const probeAudio = new Audio(url);
      await new Promise<void>((resolve) => {
        probeAudio.onloadedmetadata = () => {
          if (probeAudio.duration && Number.isFinite(probeAudio.duration) && probeAudio.duration > 0) {
            duration = Math.round(probeAudio.duration * 10) / 10;
          }
          resolve();
        };
        probeAudio.onerror = () => resolve();
        setTimeout(resolve, 3000);
      });
    } catch {}

    const newTrack: AudioTrackItem = {
      id: trackId,
      name: file.name,
      file,
      objectUrl: url,
      duration,
      trackType: 'music',
      sourceStart: 0,
      sourceEnd: duration,
      timelineStart: 0,
      volume: 0.85,
      fadeIn: 1.0,
      fadeOut: 1.5
    };

    onAddAudioTrack(newTrack);
    toast.showSuccess(`Dodano własny podkład muzyczny MP3: ${file.name} (${duration.toFixed(1)}s)! Muzyka będzie grać w trybie ciągłym.`);
    if (fileAudioInputRef.current) fileAudioInputRef.current.value = '';
  };

  // Photo duration changer
  const handlePhotoDurationChange = (newDur: number) => {
    if (!selectedItem) return;
    const dur = Math.max(0.5, Math.min(60, Number(newDur.toFixed(1))));
    
    // Update item duration
    onUpdateTimelineItem(selectedItem.id, {
      duration: dur,
      sourceEnd: selectedItem.sourceStart + dur
    });
  };

  // Apply duration to all image items on timeline
  const handleApplyDurationToAllImages = (dur: number) => {
    const duration = Math.max(0.5, Math.min(60, Number(dur.toFixed(1))));
    const imageClipIds = new Set(project.mediaLibrary.filter(m => m.type === 'image').map(m => m.id));
    
    let t = 0;
    const resequenced = sortedItems.map(item => {
      const isImg = imageClipIds.has(item.clipId);
      const itemDur = isImg ? duration : item.duration;
      const updated = {
        ...item,
        timelineStart: t,
        duration: itemDur,
        sourceEnd: isImg ? (item.sourceStart + duration) : item.sourceEnd
      };
      t += itemDur;
      return updated;
    });

    if (onUpdateTimelineItems) {
      onUpdateTimelineItems(resequenced);
    } else {
      resequenced.forEach(i => onUpdateTimelineItem(i.id, i));
    }
    toast.showSuccess(`Ustawiono ${duration.toFixed(1)}s dla wszystkich zdjęć w filmie!`);
  };
  const handleStepTrim = (type: 'start' | 'end', frames: number) => {
    if (!selectedItem) return;
    const frameInterval = 1 / targetFps;
    const curVal = type === 'start' ? selectedItem.sourceStart : selectedItem.sourceEnd;
    handleTrimChange(type, curVal + (frames * frameInterval));
  };

  // Move Order
  const handleMoveOrder = (direction: 'prev' | 'next') => {
    if (!selectedItem) return;
    const currentIndex = sortedItems.findIndex(i => i.id === selectedItem.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < sortedItems.length) {
      onMoveTimelineItemOrder(currentIndex, targetIndex);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement && !isFullscreen) {
      playerContainerRef.current.requestFullscreen().catch(() => {
        // Fallback to in-window cinema mode if iframe restricts fullscreen API
        setIsFullscreen(true);
      });
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Keyboard Shortcuts (Space for Play/Pause, J/K/L Shuttle, S for Split, Delete/Backspace, Left/Right)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      } else if (e.key === 'j' || e.key === 'J') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleSkip(-2);
        }
      } else if (e.key === 'k' || e.key === 'K') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isPlaying) handlePlayToggle();
        }
      } else if (e.key === 'l' || e.key === 'L') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (!isPlaying) handlePlayToggle();
          else handleSkip(2);
        }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'b' || e.key === 'B') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleSplitAtPlayhead();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!e.ctrlKey && !e.metaKey && selectedItemId) {
          e.preventDefault();
          onDeleteTimelineItem(selectedItemId);
          setSelectedItemId(null);
          toast.showInfo('Usunięto ujęcie z osi czasu.');
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrames(e.shiftKey ? -5 : -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepFrames(e.shiftKey ? 5 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, totalDuration, currentTime, selectedItemId, handlePlayToggle, handleStepFrames, handleSplitAtPlayhead, handleSkip, onDeleteTimelineItem, toast]);

  // Handle timeline track click
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    handleSeek(pct * totalDuration);
  }, [totalDuration]);

  // Handle timeline track touch for mobile scrubbing (Poco F6 / Android / iOS)
  const handleTrackTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const pct = Math.max(0, Math.min(1, touchX / rect.width));
    liveAudioEngine.resume();
    handleSeek(pct * totalDuration);
  }, [totalDuration]);

  const handleTrackTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const xPct = Math.max(0, Math.min(100, (touchX / rect.width) * 100));
    const timeSec = (xPct / 100) * totalDuration;
    handleSeek(timeSec);
  }, [totalDuration]);

  // Handle hover scrub move
  const handleTrackMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xPct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const timeSec = (xPct / 100) * totalDuration;
    setHoverPosition({ xPct, timeSec });
  }, [totalDuration]);

  const handleTrackMouseLeave = useCallback(() => {
    setHoverPosition(null);
  }, []);

  // Drag handlers
  const handleCardDragStart = useCallback((idx: number, e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedIdx(idx);
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleCardDragOver = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }, [dragOverIdx]);

  const handleCardDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleCardDrop = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    setDraggedIdx(null);
    setDragOverIdx(null);
    if (!isNaN(fromIdx) && fromIdx !== idx) {
      onMoveTimelineItemOrder(fromIdx, idx);
      toast.showSuccess(`Przestawiono ujęcie na pozycję #${idx + 1}`);
    }
  }, [onMoveTimelineItemOrder, toast]);

  const handleCardSelect = useCallback((id: string, start: number) => {
    setSelectedItemId(id);
    handleSeek(start);
  }, []);

  return (
    <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase mb-0.5 font-mono">
            <Film className="w-3.5 h-3.5" />
            <span>Timeline 2.0 • Studio Montażu</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Podgląd i Precyzyjne Cięcie Sekwencji
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('export')}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer uppercase tracking-wider min-h-[44px]"
          >
            <span>SCAL I EKSPORTUJ</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-4 my-6">
          <Film className="w-10 h-10 text-zinc-600" />
          <h2 className="text-white font-bold text-lg">Brak filmów na osi czasu</h2>
          <p className="text-xs text-zinc-400 max-w-sm">Dodaj filmy, aby rozpocząć montaż, ustawić kolejność i precyzyjnie przyciąć klatki.</p>
          <button
            onClick={() => onNavigateTab('project')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer min-h-[44px]"
          >
            DODAJ FILMY
          </button>
        </div>
      ) : (
        <>
          {/* Main Cinema Video Player */}
          <div 
            ref={playerContainerRef}
            className={`bg-black border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center relative transition-all ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none justify-center p-2 sm:p-6 bg-black/98' : ''
            }`}
          >
            {/* Viewport with Aspect Ratio constraint */}
            <div 
              className={`relative w-full flex items-center justify-center overflow-hidden bg-[#09090b] transition-all select-none ${
                aspectMode === '16:9' ? 'aspect-video w-full h-[52vh] sm:h-[62vh] max-h-[720px] min-h-[340px]' :
                aspectMode === '9:16' ? 'aspect-[9/16] h-[56vh] sm:h-[66vh] max-h-[760px] min-h-[360px]' :
                aspectMode === '4:3' ? 'aspect-[4/3] h-[52vh] sm:h-[62vh] max-h-[700px] min-h-[340px]' :
                'aspect-square h-[52vh] sm:h-[60vh] max-h-[660px] min-h-[340px]'
              }`}
            >
              {/* Cinematic Ambient Blur Background for mixed horizontal/vertical clips */}
              {fitStyle === 'blur' && (activeMediaSourceUrl || activeClip?.thumbnailUrl) && (
                <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none">
                  {activeClip?.type === 'image' ? (
                    <img
                      src={activeMediaSourceUrl || activeClip.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover filter blur-3xl opacity-45 scale-125"
                    />
                  ) : (
                    <video
                      src={activeMediaSourceUrl}
                      muted
                      playsInline
                      className="w-full h-full object-cover filter blur-3xl opacity-45 scale-125"
                    />
                  )}
                </div>
              )}

              {/* Video Element with Real-Time GPU Color Grading & Beauty Filters */}
              <video
                ref={videoRef}
                playsInline
                style={{ filter: beautyFilterStyle }}
                className={`relative z-10 w-full h-full pointer-events-none transition-all duration-150 ${
                  activeClip?.type === 'video' ? 'block opacity-100' : 'hidden opacity-0'
                } ${
                  fitStyle === 'fill' ? 'object-cover' : 'object-contain'
                }`}
                onLoadedMetadata={() => {
                  if (videoRef.current && activeTimelineItem) {
                    const timeInItem = Math.max(0, currentTime - activeTimelineItem.timelineStart);
                    const target = activeTimelineItem.sourceStart + (timeInItem * (activeTimelineItem.speed || 1));
                    if (Number.isFinite(target)) {
                      try { videoRef.current.currentTime = target; } catch (e) {}
                    }
                  }
                }}
              />

              {/* Photo Element with Color Grading & Beauty Filters */}
              <img
                src={activeMediaSourceUrl || activeClip?.thumbnailUrl || ''}
                alt={activeClip?.name || 'Zdjęcie'}
                style={{ filter: beautyFilterStyle }}
                className={`relative z-10 w-full h-full pointer-events-none transition-all duration-150 ${
                  activeClip?.type === 'image' ? 'block opacity-100' : 'hidden opacity-0'
                } ${
                  fitStyle === 'fill' ? 'object-cover' : 'object-contain'
                }`}
              />

              {/* Cinematic Vignette Overlay Layer */}
              {beautyGrade.enabled && beautyGrade.vignette > 0 && (
                <div 
                  className="absolute inset-0 z-20 pointer-events-none transition-opacity duration-300"
                  style={{
                    background: `radial-gradient(circle at center, transparent ${Math.max(20, 100 - beautyGrade.vignette * 0.7)}%, rgba(0, 0, 0, ${(beautyGrade.vignette / 100) * 0.85}) 100%)`
                  }}
                />
              )}

              {/* Studio Beauty Skin Glow & Soft Diffuse Overlay Layer */}
              {beautyGrade.enabled && beautyGrade.skinGlow > 0 && (
                <div 
                  className="absolute inset-0 z-20 pointer-events-none mix-blend-screen transition-opacity duration-300"
                  style={{
                    opacity: (beautyGrade.skinGlow / 100) * 0.35,
                    background: 'radial-gradient(ellipse at 50% 40%, rgba(255, 237, 213, 0.5) 0%, rgba(254, 215, 170, 0.2) 40%, transparent 75%)'
                  }}
                />
              )}

              {/* Offscreen Audio Pool Host */}
              <div
                ref={offscreenAudioHostRef}
                style={{ position: 'fixed', bottom: 0, right: 0, width: 16, height: 16, opacity: 0.001, pointerEvents: 'none', zIndex: -9999 }}
                aria-hidden="true"
              />

              {/* Dedication Overlay Preview */}
              {activeDedication && (
                <div className="absolute inset-x-4 bottom-14 z-30 flex justify-center pointer-events-none animate-in fade-in duration-300">
                  <div className="bg-black/85 backdrop-blur-xl border border-indigo-500/40 rounded-2xl px-6 py-4 max-w-xl text-center shadow-2xl space-y-1">
                    {activeDedication.title && (
                      <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-indigo-300 uppercase block">
                        ✦ {activeDedication.title} ✦
                      </span>
                    )}
                    <p className="text-white text-xs sm:text-sm font-sans italic tracking-wide leading-relaxed">
                      „{activeDedication.text}”
                    </p>
                    {activeDedication.author && (
                      <div className="text-indigo-400 text-[10px] font-mono font-medium tracking-wider pt-0.5">
                        — {activeDedication.author} —
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTitleCard && (
                <div 
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: activeTitleCard.backgroundColor === 'gradient'
                      ? 'linear-gradient(135deg, #111827 0%, #030712 100%)'
                      : activeTitleCard.backgroundColor || 'rgba(0, 0, 0, 0.85)'
                  }}
                >
                  <h3 className="text-xl sm:text-3xl font-extrabold text-white tracking-widest uppercase text-center mb-2 font-sans">
                    {activeTitleCard.text}
                  </h3>
                  {activeTitleCard.subtitle && (
                    <p className="text-xs sm:text-sm font-sans tracking-wide text-indigo-300 text-center">
                      {activeTitleCard.subtitle}
                    </p>
                  )}
                </div>
              )}

              {/* Active Clip & Proxy Mode Status Badge */}
              {activeClip && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 flex-wrap">
                  <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-white flex items-center gap-2 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span className="font-semibold truncate max-w-[130px] sm:max-w-[200px]">{activeClip.name}</span>
                  </div>

                  {/* Real Proxy Active / Full Quality Pill */}
                  <div className={`px-2.5 py-1 rounded-lg backdrop-blur-md border text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-lg ${
                    isPlayingProxy 
                      ? 'bg-cyan-950/90 border-cyan-500/50 text-cyan-300' 
                      : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                  }`}>
                    {isPlayingProxy ? (
                      <>
                        <Zap className="w-3 h-3 text-cyan-400 animate-pulse" />
                        <span>PROXY 720p (PŁYNNE)</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-3 h-3 text-emerald-400" />
                        <span>ORYGINAŁ FULL QUALITY</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Hardware Performance & Frame Overlay */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                <div className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-zinc-300 hidden sm:flex items-center gap-2 shadow-lg">
                  <span className={systemMetrics.currentFps >= 50 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {systemMetrics.currentFps} FPS
                  </span>
                  <span>•</span>
                  <span>OBCIĄŻENIE: {systemMetrics.memoryPressureScore}%</span>
                </div>
                <div className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-mono text-indigo-300 shadow-lg">
                  KLATKA #{currentFrameIndex} • {formatTimePrecise(currentTime)}
                </div>
              </div>
            </div>

            {/* Transport Control Bar with Mobile & Desktop Auto-Scaling */}
            <div className="w-full bg-zinc-900/90 border-t border-zinc-800 p-2.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              {/* Transport Buttons */}
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <button
                  onClick={handleStop}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center border border-zinc-700/60"
                  title="Stop (Reset do początku)"
                >
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                </button>

                <button
                  onClick={() => handleSkip(-5)}
                  className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold min-h-[40px] sm:min-h-[44px] flex items-center justify-center border border-zinc-700/60"
                  title="Cofnij o 5 sekund"
                >
                  -5s
                </button>

                <button
                  onClick={() => handleStepFrames(-1)}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center font-mono text-xs border border-zinc-700/60"
                  title="Cofnij o 1 klatkę"
                >
                  -1 kl.
                </button>

                <button
                  onClick={handlePlayToggle}
                  className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold flex items-center gap-1.5 sm:gap-2 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer min-h-[40px] sm:min-h-[44px]"
                  title={isPlaying ? 'Pauza (Spacja)' : 'Odtwórz (Spacja)'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                  <span className="text-xs uppercase font-mono tracking-wider">{isPlaying ? 'PAUZA' : 'PLAY'}</span>
                </button>

                <button
                  onClick={() => handleStepFrames(1)}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center font-mono text-xs border border-zinc-700/60"
                  title="Następna klatka (+1)"
                >
                  +1 kl.
                </button>

                <button
                  onClick={() => handleSkip(5)}
                  className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold min-h-[40px] sm:min-h-[44px] flex items-center justify-center border border-zinc-700/60"
                  title="Przewiń o 5 sekund"
                >
                  +5s
                </button>

                {/* Razor Blade / Split at Playhead Button */}
                {onSplitTimelineItem && (
                  <button
                    onClick={handleSplitAtPlayhead}
                    className="px-3 py-1.5 sm:py-2 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/60 hover:border-indigo-400 text-indigo-200 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer min-h-[40px] sm:min-h-[44px] shadow-sm"
                    title="Rozetnij ujęcie w miejscu suwaka czasu (Skrót klawiszowy: S lub B)"
                  >
                    <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Rozetnij (S)</span>
                  </button>
                )}
              </div>

              {/* Timecode Display */}
              <div className="font-mono text-xs sm:text-sm text-zinc-200 flex items-center gap-1.5 sm:gap-2 bg-zinc-950 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-zinc-800 shrink-0">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-white font-bold">{formatTimePrecise(currentTime)}</span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400">{formatTimeSimple(totalDuration)}</span>
              </div>

              {/* Aspect Ratio, Fit Mode, Proxy Mode & Volume Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Proxy Preview Toggle Button */}
                <button
                  onClick={() => {
                    const next = !useProxyPreview;
                    setUseProxyPreview(next);
                    toast.showInfo(next ? '⚡ Włączono tryb podglądu PROXY (płynny montaż).' : 'Włączono tryb podglądu PEŁNEJ JAKOŚCI (oryginał).');
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition min-h-[36px] sm:min-h-[40px] ${
                    useProxyPreview
                      ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-md shadow-cyan-950/40'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title={useProxyPreview ? 'Podgląd Proxy aktywny (płynny montaż 720p). Kliknij, aby przełączyć na pełną jakość oryginału.' : 'Podgląd w pełnej jakości. Kliknij, aby przełączyć na lekkie Proxy.'}
                >
                  <Zap className={`w-3.5 h-3.5 ${useProxyPreview ? 'text-cyan-400 animate-pulse' : 'text-zinc-500'}`} />
                  <span>PROXY: {useProxyPreview ? 'WŁ' : 'WYŁ'}</span>
                </button>

                {/* Aspect Switcher */}
                <div className="flex items-center gap-0.5 sm:gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
                  {(['16:9', '9:16', '1:1'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setAspectMode(mode)}
                      className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg transition-colors cursor-pointer text-[11px] sm:text-xs ${
                        aspectMode === mode ? 'bg-indigo-600 text-white font-bold shadow' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Studio Efektów Piękna & Color Studio Button */}
                <button
                  onClick={() => setIsBeautyStudioOpen(!isBeautyStudioOpen)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition min-h-[36px] sm:min-h-[40px] ${
                    beautyGrade.enabled
                      ? 'bg-gradient-to-r from-amber-500/20 via-pink-500/15 to-indigo-500/20 border-amber-400/50 text-amber-200 shadow-md shadow-amber-950/40'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title="Studio Kolorów i Efektów Piękna (LUTy kinowe, wygładzenie cery, złoty blask, winieta, nasycenie)"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${beautyGrade.enabled ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}`} />
                  <span className="hidden sm:inline">PIĘKNO:</span>
                  <span>{beautyGrade.enabled ? BEAUTY_PRESETS[beautyGrade.preset]?.name || 'Aktywne' : 'WYŁ'}</span>
                </button>

                {/* Framing Fit Mode */}
                <button
                  onClick={() => {
                    const next = fitStyle === 'fit' ? 'blur' : (fitStyle === 'blur' ? 'fill' : 'fit');
                    setFitStyle(next);
                  }}
                  className="px-2.5 sm:px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white flex items-center gap-1.5 hover:border-indigo-500/50 cursor-pointer min-h-[36px] sm:min-h-[40px]"
                  title="Przełącz styl kadrowania: Dopasuj, Kinowe Rozmycie tła lub Wypełnij"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-bold text-[11px] sm:text-xs">
                    {fitStyle === 'fit' ? 'Dopasuj' : fitStyle === 'blur' ? 'Rozmyte tło' : 'Wypełnij'}
                  </span>
                </button>

                {/* Volume & Mute with Real-Time VU Meter */}
                <div className="flex items-center gap-1.5 sm:gap-2 bg-zinc-950 px-2.5 py-1.5 rounded-xl border border-zinc-800 min-h-[36px] sm:min-h-[40px]">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                    title={isMuted ? 'Wyłącz wyciszenie' : 'Wycisz dźwięk'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      if (isMuted) setIsMuted(false);
                    }}
                    className="w-12 sm:w-16 accent-indigo-500 cursor-pointer"
                  />
                  <AudioVuMeter isPlaying={isPlaying} isMuted={isMuted} className="hidden xs:flex border-none !p-0 !bg-transparent" />
                </div>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center"
                  title="Pełny ekran"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Studio Kolorów i Efektów Piękna (Interactive Beauty & Color Grading Drawer) */}
            {isBeautyStudioOpen && (
              <div className="w-full bg-[#0d111a] border-t border-amber-500/30 p-4 sm:p-5 text-xs animate-fadeIn space-y-4 shadow-2xl">
                {/* Drawer Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-indigo-500/30 border border-amber-400/40 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
                        Studio Kolorów & Efektów Piękna
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          GPU 4K Real-Time
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        Wygładzanie cery, kinowy blask, zaawansowane LUTy i korekcja barwna
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Enable/Disable Toggle */}
                    <button
                      onClick={() => {
                        const next = !beautyGrade.enabled;
                        setBeautyGrade(prev => ({ ...prev, enabled: next }));
                        toast.showInfo(next ? '✨ Włączono efekty kolorystyczne i piękna.' : 'Wyłączono efekty (oryginał).');
                      }}
                      className={`px-3 py-1.5 rounded-xl font-mono font-bold text-xs cursor-pointer transition flex items-center gap-1.5 border ${
                        beautyGrade.enabled
                          ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{beautyGrade.enabled ? 'EFEKTY: WŁ' : 'EFEKTY: WYŁ'}</span>
                    </button>

                    {/* 1-Click Auto Beauty Polish */}
                    <button
                      onClick={() => handleApplyBeautyPreset('beauty_glow')}
                      className="px-3 py-1.5 rounded-xl font-mono font-bold text-xs bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-black shadow-lg shadow-amber-500/20 cursor-pointer transition flex items-center gap-1.5"
                      title="Automatycznie ustaw idealny balans wygładzenia, blasku i ciepła cery"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>⚡ Auto Piękno</span>
                    </button>

                    {/* Reset Button */}
                    <button
                      onClick={() => handleApplyBeautyPreset('none')}
                      className="px-2.5 py-1.5 rounded-xl font-mono text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition"
                      title="Zresetuj wszystkie suwaki i wyłącz filtry"
                    >
                      Reset
                    </button>

                    {/* Close Drawer */}
                    <button
                      onClick={() => setIsBeautyStudioOpen(false)}
                      className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Preset Cards Grid */}
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-2 font-semibold">
                    Kinowe Style & Presety Piękna
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                    {(Object.keys(BEAUTY_PRESETS) as BeautyPreset[]).map((key) => {
                      const p = BEAUTY_PRESETS[key];
                      const isSelected = beautyGrade.enabled && beautyGrade.preset === key;
                      return (
                        <button
                          key={key}
                          onClick={() => handleApplyBeautyPreset(key)}
                          className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-b from-amber-500/25 to-indigo-500/20 border-amber-400 text-white shadow-lg shadow-amber-950/50 scale-[1.02]'
                              : 'bg-zinc-900/80 hover:bg-zinc-850 border-white/[0.06] hover:border-white/20 text-zinc-300'
                          }`}
                        >
                          <span className="text-lg">{p.icon}</span>
                          <span className="font-bold text-[11px] leading-tight truncate w-full">{p.name}</span>
                          <span className="text-[9px] text-zinc-400 line-clamp-2 leading-tight">{p.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sliders Control Panel */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 border-t border-white/[0.06]">
                  {/* Skin Glow / Blask & Wygładzenie */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Blask & Wygładzenie Cery
                      </span>
                      <span className="font-bold text-amber-400">{beautyGrade.skinGlow}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={beautyGrade.skinGlow}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, skinGlow: parseInt(e.target.value, 10) }))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  {/* Brightness / Jasność */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-yellow-400" />
                        Ekspozycja / Jasność
                      </span>
                      <span className="font-bold text-yellow-400">{beautyGrade.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={140}
                      value={beautyGrade.brightness}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, brightness: parseInt(e.target.value, 10) }))}
                      className="w-full accent-yellow-400 cursor-pointer"
                    />
                  </div>

                  {/* Contrast / Kontrast */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Contrast className="w-3.5 h-3.5 text-indigo-400" />
                        Kontrast Kinowy
                      </span>
                      <span className="font-bold text-indigo-400">{beautyGrade.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={150}
                      value={beautyGrade.contrast}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, contrast: parseInt(e.target.value, 10) }))}
                      className="w-full accent-indigo-400 cursor-pointer"
                    />
                  </div>

                  {/* Saturation / Nasycenie */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-pink-400" />
                        Nasycenie Barw
                      </span>
                      <span className="font-bold text-pink-400">{beautyGrade.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={beautyGrade.saturation}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, saturation: parseInt(e.target.value, 10) }))}
                      className="w-full accent-pink-400 cursor-pointer"
                    />
                  </div>

                  {/* Warmth / Temperatura Barw */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                        Temperatura Barwowa
                      </span>
                      <span className="font-bold text-orange-400">{beautyGrade.warmth > 0 ? `+${beautyGrade.warmth}` : beautyGrade.warmth}</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={beautyGrade.warmth}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, warmth: parseInt(e.target.value, 10) }))}
                      className="w-full accent-orange-400 cursor-pointer"
                    />
                  </div>

                  {/* Vignette / Winieta */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        Winieta Kinowa
                      </span>
                      <span className="font-bold text-cyan-400">{beautyGrade.vignette}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={beautyGrade.vignette}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, vignette: parseInt(e.target.value, 10) }))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  {/* Sharpness / Ostrość */}
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-zinc-300 font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                        Ostrość Krawędzi
                      </span>
                      <span className="font-bold text-emerald-400">{beautyGrade.sharpness}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={beautyGrade.sharpness}
                      onChange={(e) => setBeautyGrade(prev => ({ ...prev, enabled: true, sharpness: parseInt(e.target.value, 10) }))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline 2.0 Sequence Section */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="uppercase flex items-center gap-2 text-white font-semibold">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Oś Czasu 2.0 • Kolejność Ujęć ({sortedItems.length})
                </span>

                {/* Multi-Sequence Switcher Bar */}
                <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs font-mono">
                  <Film className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-zinc-500">Sekwencja:</span>
                  <select
                    value={project.activeSequenceId || (project.sequences && project.sequences[0]?.id) || 'default'}
                    onChange={(e) => onSwitchSequence?.(e.target.value)}
                    className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                  >
                    {(project.sequences && project.sequences.length > 0 ? project.sequences : [
                      { id: 'default', name: 'Master 16:9', aspectRatio: '16:9' }
                    ]).map(seq => (
                      <option key={seq.id} value={seq.id} className="bg-zinc-900 text-white">
                        {seq.name} [{seq.aspectRatio}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* New Sequence Button */}
                {onCreateSequence && (
                  <button
                    onClick={() => {
                      const name = prompt('Podaj nazwę nowej sekwencji (np. TikTok / Reel 9:16, Trailer, Wersja skrócona):', `Sekwencja #${(project.sequences?.length || 1) + 1}`);
                      if (name && name.trim()) {
                        onCreateSequence(name.trim(), '16:9');
                        toast.showSuccess(`Utworzono sekwencję "${name.trim()}".`);
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-mono cursor-pointer transition"
                    title="Utwórz nową, czystą sekwencję montażową w bieżącym projekcie"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Nowa</span>
                  </button>
                )}

                {/* Duplicate Sequence Button */}
                {onDuplicateSequence && project.activeSequenceId && (
                  <button
                    onClick={() => {
                      onDuplicateSequence(project.activeSequenceId!);
                      toast.showSuccess('Zduplikowano aktywną sekwencję montażową.');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-mono cursor-pointer transition"
                    title="Utwórz kopię roboczą aktywnej sekwencji"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Klonuj</span>
                  </button>
                )}

                {/* Smart Reflow 9:16 Button */}
                {onDuplicateSequence && (
                  <button
                    onClick={() => {
                      const currentSeq = (project.sequences || []).find(s => s.id === project.activeSequenceId) || {
                        id: 'default',
                        name: 'Master 16:9',
                        aspectRatio: '16:9',
                        tracks: project.tracks,
                        timelineItems: project.timelineItems,
                        audioTracks: project.audioTracks,
                        textLayers: project.textLayers,
                        markers: project.markers,
                        createdAt: project.createdAt,
                        updatedAt: project.updatedAt
                      };
                      const reflowed = SequenceManager.smartReflow(currentSeq as any, '9:16', `${currentSeq.name} (Shorts / Reels 9:16)`);
                      if (onCreateSequence) {
                        onCreateSequence(reflowed.name, '9:16');
                        if (onUpdateTimelineItems) onUpdateTimelineItems(reflowed.timelineItems);
                      } else {
                        onDuplicateSequence(currentSeq.id, reflowed.name, '9:16');
                      }
                      setAspectMode('9:16');
                      toast.showSuccess('⚡ Smart Reflow 9:16: Wygenerowano pionową sekwencję Reels/Shorts z automatycznym centrowaniem kadrów!');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 hover:text-white rounded-xl text-xs font-mono font-bold cursor-pointer transition"
                    title="Smart Reflow: automatycznie konwertuje całą sekwencję do pionowego formatu 9:16 dla TikTok / Reels bez niszczenia oryginału"
                  >
                    <Smartphone className="w-3 h-3 text-indigo-400" />
                    <span>Smart Reflow 9:16</span>
                  </button>
                )}

                {/* Batch Proxy Generate for Timeline Button */}
                <button
                  onClick={handleBatchGenerateTimelineProxies}
                  disabled={isGeneratingAllProxies}
                  className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 hover:text-white rounded-xl text-xs font-mono font-bold cursor-pointer transition disabled:opacity-50"
                  title="Wygeneruj pliki robocze Proxy 720p dla wszystkich filmów na osi czasu"
                >
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span>{isGeneratingAllProxies ? 'Generowanie...' : 'Proxy dla Osi'}</span>
                </button>

                {/* Hidden Audio File Input */}
                <input 
                  type="file" 
                  ref={fileAudioInputRef} 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={handleUploadAudioFile} 
                />

                {/* Add MP3 Music Button */}
                {onAddAudioTrack && (
                  <button
                    onClick={() => fileAudioInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 text-zinc-200 rounded-xl transition-all cursor-pointer font-sans text-xs font-semibold shadow-sm"
                    title="Wgraj własny plik dźwiękowy MP3, WAV lub M4A jako podkład muzyczny"
                  >
                    <Music className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Wgraj MP3 / Muzykę</span>
                  </button>
                )}

                {/* Record Voice Button */}
                {onOpenVoiceRecorder && (
                  <button
                    onClick={onOpenVoiceRecorder}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/50 text-zinc-200 rounded-xl transition-all cursor-pointer font-sans text-xs font-semibold shadow-sm"
                    title="Nagraj własny głos lub przysięgę z mikrofonu"
                  >
                    <Mic className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Nagraj Głos</span>
                  </button>
                )}

                {/* Beat-Sync Button */}
                {onOpenBeatSync && (
                  <button
                    onClick={onOpenBeatSync}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 rounded-xl transition-all cursor-pointer font-sans text-xs font-bold shadow-sm"
                    title="Wykryj tempo BPM i automatycznie dopasuj cięcia do uderzeń muzyki (Beat-Sync)"
                  >
                    <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span>Beat-Sync (Rytm Muzyki)</span>
                  </button>
                )}

                {/* Auto-Captions & Subtitles Button */}
                {onOpenAutoCaptions && (
                  <button
                    onClick={onOpenAutoCaptions}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/40 hover:border-purple-400 text-purple-200 hover:text-white rounded-xl transition-all cursor-pointer font-sans text-xs font-bold shadow-sm"
                    title="Automatyczna transkrypcja mowy, dynamiczne napisy karaoke (CapCut style) oraz edytor SRT"
                  >
                    <Type className="w-3.5 h-3.5 text-purple-400" />
                    <span>Napisy & Auto-Captions</span>
                  </button>
                )}

                {/* Bulk Photo Duration Quick Setter */}
                <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800 text-[11px]">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span className="text-zinc-500">Zdjęcia:</span>
                  {[2, 3, 5, 8].map(sec => (
                    <button
                      key={sec}
                      onClick={() => handleApplyDurationToAllImages(sec)}
                      className="px-1.5 py-0.5 rounded hover:bg-indigo-600 hover:text-white text-zinc-300 font-mono cursor-pointer transition"
                      title={`Ustaw czas ${sec}s dla wszystkich zdjęć w filmie`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setTimelineZoom(prev => Math.max(50, prev - 25))}
                  className="p-1 hover:text-white rounded cursor-pointer"
                  title="Pomniejsz oś czasu"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-bold text-white">{timelineZoom}%</span>
                <button
                  onClick={() => setTimelineZoom(prev => Math.min(300, prev + 25))}
                  className="p-1 hover:text-white rounded cursor-pointer"
                  title="Powiększ oś czasu"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setTimelineZoom(100)}
                  className="px-1.5 py-0.5 text-[10px] text-indigo-400 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Scrollable Track Container */}
            <div 
              ref={timelineTrackRef}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 15 : -15;
                  setTimelineZoom(prev => Math.max(50, Math.min(300, prev + delta)));
                  return;
                }
                if (timelineTrackRef.current && (e.shiftKey || Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0)) {
                  if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    timelineTrackRef.current.scrollLeft += e.deltaY;
                  }
                }
              }}
              className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar pb-1 select-none space-y-2"
            >
              {/* TRACK 1: VIDEO & PHOTO CLIPS */}
              <div 
                style={{ width: `${timelineZoom}%`, minWidth: '100%' }}
                onClick={handleTrackClick}
                onTouchStart={handleTrackTouchStart}
                onTouchMove={handleTrackTouchMove}
                onMouseMove={handleTrackMouseMove}
                onMouseLeave={handleTrackMouseLeave}
                className="relative h-20 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden flex cursor-pointer transition-[width] duration-150 shadow-inner"
              >
                {/* Render Memoized Timeline Item Blocks */}
                {sortedItems.map((item, idx) => {
                  const clip = clipMap.get(item.clipId);
                  const widthPct = Math.max(3, (item.duration / Math.max(0.1, totalDuration)) * 100);
                  const isSelected = item.id === selectedItemId;
                  const isDraggingThis = draggedIdx === idx;
                  const isTargetingThis = dragOverIdx === idx;

                  return (
                    <TimelineItemCard
                      key={item.id}
                      item={item}
                      clip={clip}
                      idx={idx}
                      isSelected={isSelected}
                      isDraggingThis={isDraggingThis}
                      isTargetingThis={isTargetingThis}
                      widthPct={widthPct}
                      timelineZoom={timelineZoom}
                      onSelect={handleCardSelect}
                      onDragStart={handleCardDragStart}
                      onDragOver={handleCardDragOver}
                      onDragLeave={handleCardDragLeave}
                      onDrop={handleCardDrop}
                      onResolveClipUrl={resolveClipUrl}
                    />
                  );
                })}

                {/* Hover Scrubbing Playhead & Time Preview */}
                {hoverPosition && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none z-15 flex flex-col items-center"
                    style={{ left: `${hoverPosition.xPct}%` }}
                  >
                    <div className="absolute -top-1 bg-black/90 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/20 whitespace-nowrap shadow-md">
                      {formatTimeSimple(hoverPosition.timeSec)}
                    </div>
                  </div>
                )}

                {/* Smooth Real-Time Playhead Marker */}
                {totalDuration > 0 && (
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 pointer-events-none z-20 shadow-[0_0_10px_rgba(99,102,241,0.9)] transition-[left] duration-75"
                    style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                  >
                    <div className="w-3 h-3 -ml-1.5 -top-1.5 bg-indigo-400 rotate-45 rounded-sm shadow-md" />
                  </div>
                )}
              </div>

              {/* TRACK 2: CONTINUOUS AUDIO & MUSIC TRACKS */}
              <div 
                style={{ width: `${timelineZoom}%`, minWidth: '100%' }}
                className="relative min-h-[50px] bg-zinc-950 rounded-xl border border-emerald-950/60 p-2 flex flex-col gap-1.5 overflow-hidden"
              >
                <div className="flex items-center justify-between px-1 text-[10px] font-mono text-emerald-400">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                    <Music className="w-3.5 h-3.5 text-emerald-400" />
                    PODKŁAD DŹWIĘKOWY I KOMENTARZ GŁOSOWY (ŚCIEŻKA AUDIO)
                  </span>
                  <div className="flex items-center gap-2">
                    {onOpenBeatSync && (
                      <button
                        onClick={onOpenBeatSync}
                        className="px-2 py-0.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/60 text-indigo-200 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Dopasuj cięcia ujęć wideo do rytmu i uderzeń muzyki (Beat-Sync)"
                      >
                        <Activity className="w-3 h-3 text-indigo-400 animate-pulse" />
                        <span>Beat-Sync (Rytm Muzyki)</span>
                      </button>
                    )}
                    {onAddAudioTrack && (
                      <button
                        onClick={() => fileAudioInputRef.current?.click()}
                        className="px-2 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-200 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Wgraj własny plik dźwiękowy MP3, WAV lub M4A jako podkład muzyczny"
                      >
                        <Music className="w-3 h-3 text-emerald-400" />
                        <span>+ Muzyka MP3</span>
                      </button>
                    )}
                    {onOpenVoiceRecorder && (
                      <button
                        onClick={onOpenVoiceRecorder}
                        className="px-2 py-0.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-200 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Nagraj własny komentarz głosowy, przysięgę lub dedykację z mikrofonu"
                      >
                        <Mic className="w-3 h-3 text-amber-400" />
                        <span>+ Nagraj Głos</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative h-10 w-full bg-black/60 rounded-lg border border-emerald-950/80 overflow-hidden flex items-center px-1">
                  {/* Beat Markers Overlay on Audio Track */}
                  {totalDuration > 0 && (project.markers || []).filter(m => m.type === 'music').map(marker => {
                    const posPct = (marker.time / totalDuration) * 100;
                    const isDownbeat = marker.label === 'DOWNBEAT';
                    return (
                      <div
                        key={marker.id}
                        className={`absolute top-0 bottom-0 pointer-events-none z-10 transition-opacity ${
                          isDownbeat ? 'w-0.5 bg-amber-400/90 shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'w-px bg-amber-400/40'
                        }`}
                        style={{ left: `${posPct}%` }}
                        title={`Beat ${marker.time.toFixed(2)}s`}
                      />
                    );
                  })}

                  {(project.audioTracks || []).length === 0 ? (
                    <div className="w-full text-center text-[10px] font-mono text-emerald-500/70 py-1 italic flex items-center justify-center gap-2">
                      <span>Brak dodanej muzyki. Kliknij przyciski powyżej, aby dodać własny podkład MP3 lub nagrać lektora z mikrofonu.</span>
                    </div>
                  ) : (
                    (project.audioTracks || []).map(track => {
                      const trackLeftPct = totalDuration > 0 ? (track.timelineStart / totalDuration) * 100 : 0;
                      const trackWidthPct = totalDuration > 0 ? Math.min(100, (track.duration / totalDuration) * 100) : 100;
                      const isVoice = track.trackType === 'voiceover';

                      return (
                        <div
                          key={track.id}
                          className={`absolute top-1 bottom-1 rounded-md px-2.5 flex items-center justify-between gap-2 border text-[10px] font-mono shadow transition-all ${
                            isVoice 
                              ? 'bg-amber-950/80 border-amber-500/60 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                              : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                          }`}
                          style={{
                            left: `${trackLeftPct}%`,
                            width: `${Math.max(5, trackWidthPct)}%`,
                            minWidth: '140px'
                          }}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isVoice ? <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            <span className="truncate font-bold">{track.name}</span>
                            {track.bpm && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-black/40 rounded text-amber-300 font-bold border border-amber-500/30">
                                {track.bpm} BPM
                              </span>
                            )}
                            <span className="opacity-70 text-[9px]">({track.duration.toFixed(1)}s)</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {onUpdateAudioTrack && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateAudioTrack(track.id, { muted: !track.muted });
                                }}
                                className={`p-1 rounded cursor-pointer ${track.muted ? 'text-rose-400 bg-rose-950/50' : 'text-emerald-300 hover:bg-white/10'}`}
                                title={track.muted ? 'Włącz dźwięk' : 'Wycisz tę ścieżkę'}
                              >
                                {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                              </button>
                            )}

                            {onDeleteAudioTrack && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteAudioTrack(track.id);
                                  toast.showInfo(`Usunięto ścieżkę "${track.name}".`);
                                }}
                                className="p-1 rounded text-rose-400 hover:bg-rose-950/50 cursor-pointer"
                                title="Usuń tę ścieżkę audio"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* TRACK 3: SUBTITLES & DYNAMIC TEXT LAYERS TRACK */}
              <div 
                style={{ width: `${timelineZoom}%`, minWidth: '100%' }}
                className="relative min-h-[44px] bg-zinc-950 rounded-xl border border-purple-900/40 p-2 flex flex-col gap-1 overflow-hidden"
              >
                <div className="flex items-center justify-between px-1 text-[10px] font-mono text-purple-300">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Type className="w-3.5 h-3.5 text-purple-400" />
                    ŚCIEŻKA NAPISÓW & DYNAMICZNYCH TEKSTÓW ({((project.textLayers || []).filter(t => t.type === 'caption' || t.type === 'subtitle')).length})
                  </span>
                  {onOpenAutoCaptions && (
                    <button
                      onClick={onOpenAutoCaptions}
                      className="px-2 py-0.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-200 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-purple-300" />
                      <span>+ Konfiguruj Automatyczne Napisy</span>
                    </button>
                  )}
                </div>

                <div className="relative h-7 w-full bg-black/60 rounded-lg border border-purple-950/80 overflow-hidden flex items-center px-1">
                  {((project.textLayers || []).filter(t => t.type === 'caption' || t.type === 'subtitle')).length === 0 ? (
                    <div className="w-full text-center text-[9px] font-mono text-purple-400/60 py-0.5 italic">
                      Brak napisów. Kliknij "+ Konfiguruj Automatyczne Napisy" aby wygenerować transkrypcję mowy lub dodać napisy viral karaoke.
                    </div>
                  ) : (
                    ((project.textLayers || []).filter(t => t.type === 'caption' || t.type === 'subtitle')).map(tl => {
                      const tlLeftPct = totalDuration > 0 ? (tl.timelineStart / totalDuration) * 100 : 0;
                      const tlWidthPct = totalDuration > 0 ? Math.min(100, (tl.duration / totalDuration) * 100) : 100;
                      return (
                        <div
                          key={tl.id}
                          className="absolute top-0.5 bottom-0.5 rounded px-2 flex items-center border border-purple-500/60 bg-purple-950/80 text-purple-100 text-[9px] font-mono truncate shadow-sm cursor-pointer hover:bg-purple-900"
                          style={{
                            left: `${tlLeftPct}%`,
                            width: `${Math.max(3, tlWidthPct)}%`,
                            minWidth: '60px'
                          }}
                          onClick={() => onOpenAutoCaptions?.()}
                          title={`"${tl.text}" (${tl.timelineStart.toFixed(1)}s - ${(tl.timelineStart + tl.duration).toFixed(1)}s)`}
                        >
                          <span className="truncate">{tl.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Selected Clip Inspector & Precision Trim */}
          {selectedItem && selectedClip && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
              {/* Top Row: Clip Meta & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 rounded-xl bg-black overflow-hidden border border-zinc-800 shrink-0 relative flex items-center justify-center">
                    {inspectorThumbnail ? (
                      <img src={inspectorThumbnail} alt={selectedClip.name} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-5 h-5 text-zinc-600" />
                    )}
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono text-zinc-300 px-1 rounded">
                      {selectedClip.type === 'image' ? 'IMG' : 'VID'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-sm sm:max-w-md">
                      {selectedClip.name}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      Oryginalna długość: {selectedClip.duration.toFixed(2)}s • Rozdzielczość: {selectedClip.width}×{selectedClip.height}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMoveOrder('prev')}
                    className="p-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Przesuń ujęcie wcześniej w filmie"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveOrder('next')}
                    className="p-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Przesuń ujęcie później w filmie"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      onDeleteTimelineItem(selectedItem.id);
                      toast.showInfo('Ujęcie usunięte z osi czasu.');
                    }}
                    className="p-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl border border-rose-800/40 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Usuń ujęcie z filmu"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Duration & Trim Section (Zdjęcia vs Filmy) */}
              {selectedClip.type === 'image' ? (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-indigo-300 uppercase font-mono flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      Czas Wyświetlania Zdjęcia w Filmie
                    </h4>
                    <span className="text-xs font-mono font-bold text-white bg-zinc-900 px-3 py-1 rounded-lg border border-indigo-500/30">
                      {selectedItem.duration.toFixed(1)}s
                    </span>
                  </div>

                  {/* Stepper buttons & Input */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePhotoDurationChange(selectedItem.duration - 1)}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs cursor-pointer border border-zinc-700/60"
                      title="-1 sekunda"
                    >
                      -1s
                    </button>
                    <button
                      onClick={() => handlePhotoDurationChange(selectedItem.duration - 0.5)}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs cursor-pointer border border-zinc-700/60"
                      title="-0.5 sekundy"
                    >
                      -0.5s
                    </button>

                    <div className="flex-1 text-center font-mono relative">
                      <input
                        type="number"
                        min="0.5"
                        max="60"
                        step="0.5"
                        value={selectedItem.duration.toFixed(1)}
                        onChange={(e) => handlePhotoDurationChange(parseFloat(e.target.value) || 3)}
                        className="w-full text-center bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-xl py-2 text-base font-bold text-indigo-300 focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handlePhotoDurationChange(selectedItem.duration + 0.5)}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs cursor-pointer border border-zinc-700/60"
                      title="+0.5 sekundy"
                    >
                      +0.5s
                    </button>
                    <button
                      onClick={() => handlePhotoDurationChange(selectedItem.duration + 1)}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs cursor-pointer border border-zinc-700/60"
                      title="+1 sekunda"
                    >
                      +1s
                    </button>
                  </div>

                  {/* Range Slider */}
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="0.5"
                    value={selectedItem.duration}
                    onChange={(e) => handlePhotoDurationChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />

                  {/* Quick Preset Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-zinc-400 font-mono mr-1">Szybki wybór:</span>
                    {[2, 3, 4, 5, 7, 10, 15, 20].map(sec => (
                      <button
                        key={sec}
                        onClick={() => handlePhotoDurationChange(sec)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition ${
                          Math.abs(selectedItem.duration - sec) < 0.2
                            ? 'bg-indigo-600 text-white font-bold shadow'
                            : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>

                  {/* Apply to All Photos Button */}
                  <button
                    onClick={() => handleApplyDurationToAllImages(selectedItem.duration)}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>✦ Zastosuj {selectedItem.duration.toFixed(1)}s do WSZYSTKICH zdjęć w filmie</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-indigo-300 uppercase font-mono flex items-center gap-2">
                      <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                      Precyzyjne Przycinanie Ujęcia (Trim 2.0)
                    </h4>
                    <div className="flex items-center gap-3 text-xs font-mono font-bold">
                      <span className="text-white bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800">
                        START {formatTimePrecise(selectedItem.sourceStart)}
                      </span>
                      <span className="text-white bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800">
                        END {formatTimePrecise(selectedItem.sourceEnd)}
                      </span>
                      <span className="text-indigo-300 bg-indigo-950/50 px-3 py-1 rounded-lg border border-indigo-500/40">
                        DURATION {formatTimePrecise(selectedItem.duration)}
                      </span>
                    </div>
                  </div>

                  {/* Range Sliders for Start & End */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-zinc-400">Początek (Start):</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStepTrim('start', -1)}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer border border-zinc-800"
                          >
                            -1 kl.
                          </button>
                          <span className="text-white font-bold">{selectedItem.sourceStart.toFixed(2)}s</span>
                          <button
                            onClick={() => handleStepTrim('start', 1)}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer border border-zinc-800"
                          >
                            +1 kl.
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={selectedItem.sourceEnd - 0.2}
                        step={0.033}
                        value={selectedItem.sourceStart}
                        onChange={(e) => handleTrimChange('start', parseFloat(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-zinc-400">Koniec (End):</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStepTrim('end', -1)}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer border border-zinc-800"
                          >
                            -1 kl.
                          </button>
                          <span className="text-white font-bold">{selectedItem.sourceEnd.toFixed(2)}s</span>
                          <button
                            onClick={() => handleStepTrim('end', 1)}
                            className="px-2 py-0.5 rounded bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer border border-zinc-800"
                          >
                            +1 kl.
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={selectedItem.sourceStart + 0.2}
                        max={selectedClip.duration}
                        step={0.033}
                        value={selectedItem.sourceEnd}
                        onChange={(e) => handleTrimChange('end', parseFloat(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Clip Adjustments: Framing, Rotation, Audio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-800">
                {/* Fit Mode */}
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1.5 font-medium">Kadrowanie Ujęcia</label>
                  <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {(['fit', 'fill', 'original'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { fitMode: mode })}
                        className={`py-1.5 text-xs font-bold rounded-lg uppercase cursor-pointer transition-all ${
                          (selectedItem.fitMode || 'fit') === mode
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {mode === 'fit' ? 'FIT' : (mode === 'fill' ? 'FILL' : 'ORIG')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rotation */}
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1.5 font-medium">Obrót Ujęcia</label>
                  <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[0, 90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { rotation: deg })}
                        className={`py-1.5 text-xs font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          (selectedItem.rotation || 0) === deg
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume & Mute */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-mono text-zinc-400 uppercase font-medium">Głośność Ujęcia</label>
                    <button
                      onClick={() => onUpdateTimelineItem(selectedItem.id, { muted: !selectedItem.muted })}
                      className={`text-xs flex items-center gap-1 font-mono cursor-pointer ${
                        selectedItem.muted ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {selectedItem.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{selectedItem.muted ? 'Wyciszone' : `${Math.round(selectedItem.volume * 100)}%`}</span>
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    disabled={selectedItem.muted}
                    value={selectedItem.volume}
                    onChange={(e) => onUpdateTimelineItem(selectedItem.id, { volume: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 disabled:opacity-30 cursor-pointer"
                  />
                </div>
              </div>

              {/* Row 2: Speed (Slow Motion) & Transitions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-800">
                {/* Speed Controls & Curve Presets */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-mono text-zinc-400 uppercase font-medium flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                      Prędkość & Krzywa (Speed Ramping)
                    </label>
                    <span className="text-xs font-mono font-bold text-indigo-300">
                      {selectedItem.speed || 1.0}x
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-2">
                    {[
                      { val: 0.25, label: '0.25x' },
                      { val: 0.5, label: '0.5x' },
                      { val: 1.0, label: '1.0x' },
                      { val: 1.5, label: '1.5x' },
                      { val: 2.0, label: '2.0x' },
                      { val: 4.0, label: '4.0x' }
                    ].map(spd => (
                      <button
                        key={spd.val}
                        onClick={() => {
                          const newSpeed = spd.val;
                          const newDuration = (selectedItem.sourceEnd - selectedItem.sourceStart) / newSpeed;
                          onUpdateTimelineItem(selectedItem.id, { speed: newSpeed, duration: newDuration });
                        }}
                        className={`py-1.5 text-xs font-mono font-bold rounded-lg cursor-pointer transition-all ${
                          (selectedItem.speed || 1.0) === spd.val
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {spd.label}
                      </button>
                    ))}
                  </div>

                  {/* Speed Curve Presets Bar */}
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'hero_curve', name: 'Hero Ramp (0.5x)', speed: 0.5 },
                      { id: 'flash_drop', name: 'Flash Drop (2.0x)', speed: 2.0 },
                      { id: 'bullet_time', name: 'Bullet Time (0.25x)', speed: 0.25 },
                      { id: 'hyperlapse', name: 'Hyperlapse (4.0x)', speed: 4.0 }
                    ].map(ramp => (
                      <button
                        key={ramp.id}
                        onClick={() => {
                          const newSpeed = ramp.speed;
                          const newDuration = (selectedItem.sourceEnd - selectedItem.sourceStart) / newSpeed;
                          onUpdateTimelineItem(selectedItem.id, { 
                            speed: newSpeed, 
                            duration: newDuration,
                            speedRampPreset: ramp.id as any 
                          });
                        }}
                        className="flex-1 py-1 px-1 bg-zinc-950 hover:bg-indigo-950/60 border border-zinc-800 hover:border-indigo-500/40 text-[9px] font-mono text-zinc-400 hover:text-indigo-200 rounded-md transition truncate text-center cursor-pointer"
                        title={`Zastosuj krzywą prędkości ${ramp.name}`}
                      >
                        {ramp.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transitions */}
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 uppercase block mb-1.5 font-medium flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                    Przejście Wejściowe (Transition)
                  </label>
                  <div className="grid grid-cols-5 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'cut', label: 'Cięcie' },
                      { id: 'dissolve', label: 'Przenik.' },
                      { id: 'dip_black', label: 'Czerń' },
                      { id: 'dip_white', label: 'Biel' },
                      { id: 'light_leak', label: 'Błysk' }
                    ].map(tr => (
                      <button
                        key={tr.id}
                        onClick={() => onUpdateTimelineItem(selectedItem.id, { transitionIn: tr.id as TransitionType })}
                        className={`py-1.5 text-[11px] font-bold rounded-lg uppercase cursor-pointer transition-all ${
                          (selectedItem.transitionIn || 'cut') === tr.id
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {tr.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3: Title Card Overlay on Clip */}
              <div className="pt-3 border-t border-zinc-800 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase font-mono">
                      Plansza Tytułowa / Podpis Sceny przed Klipem
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const enabled = !selectedItem.titleCard?.enabled;
                      onUpdateTimelineItem(selectedItem.id, {
                        titleCard: {
                          enabled,
                          text: selectedItem.titleCard?.text || selectedClip.name.replace(/\.[^/.]+$/, ""),
                          subtitle: selectedItem.titleCard?.subtitle || 'Master Cut',
                          duration: selectedItem.titleCard?.duration || 3.0,
                          style: selectedItem.titleCard?.style || 'modern_bold',
                          backgroundColor: selectedItem.titleCard?.backgroundColor || '#09090B'
                        }
                      });
                    }}
                    className={`px-3 py-1 text-xs rounded-lg font-mono font-bold transition-all cursor-pointer ${
                      selectedItem.titleCard?.enabled
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {selectedItem.titleCard?.enabled ? 'WŁĄCZONA' : 'WYŁĄCZONA'}
                  </button>
                </div>

                {selectedItem.titleCard?.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-[10px] font-mono text-zinc-400 uppercase block mb-1">Tytuł Główny</label>
                      <input
                        type="text"
                        value={selectedItem.titleCard.text}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, text: e.target.value }
                        })}
                        placeholder="np. Tytuł Sceny / Master Cut"
                        className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-zinc-400 uppercase block mb-1">Podtytuł / Opis</label>
                      <input
                        type="text"
                        value={selectedItem.titleCard.subtitle || ''}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, subtitle: e.target.value }
                        })}
                        placeholder="np. 2026 • Reżyseria i Montaż"
                        className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-zinc-400 uppercase block mb-1">Styl Planszy</label>
                      <select
                        value={selectedItem.titleCard.style}
                        onChange={(e) => onUpdateTimelineItem(selectedItem.id, {
                          titleCard: { ...selectedItem.titleCard!, style: e.target.value as any }
                        })}
                        className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="modern_bold">⚡ Nowoczesny Bold</option>
                        <option value="cinematic">✦ Kinowy Noir</option>
                        <option value="studio_slate">🎬 Studio Slate (Klaps)</option>
                        <option value="minimalist">◻ Minimalistyczny Clean</option>
                        <option value="classic">◈ Klasyczny Szeryfowy</option>
                        <option value="cyber_neon">❇ Cyber Neon</option>
                        <option value="credits">🏁 Napisy Końcowe</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
