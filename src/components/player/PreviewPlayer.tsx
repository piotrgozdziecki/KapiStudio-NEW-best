import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Maximize2, 
  Minimize2,
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  Tv, 
  Eye,
  Film,
  RotateCcw,
  Sparkles,
  Scaling,
  Monitor,
  Smartphone,
  Square,
  ZoomIn,
  ZoomOut,
  Palette,
  Sliders,
  Check
} from 'lucide-react';
import type { TimelineItem, MediaClip, TextLayer, AudioTrackItem, ColorGradingPreset } from '../../types/project';
import { urlRegistry } from '../../core/media/urlRegistry';
import { resolveClipMediaUrl, resolveAudioTrackUrl } from '../../core/media/mediaResolver';

export type ScaleMode = 'fit' | 'fill' | '16:9' | '9:16' | '4:3' | 'original';

export interface ColorGradePresetItem {
  id: ColorGradingPreset;
  name: string;
  subtitle: string;
  icon: string;
  filter: string;
}

export const COLOR_GRADE_PRESETS: ColorGradePresetItem[] = [
  {
    id: 'none',
    name: 'Oryginał',
    subtitle: 'Naturalny obraz bez filtrów',
    icon: '🎬',
    filter: 'none'
  },
  {
    id: 'golden_hour',
    name: 'Złoto Wenecji',
    subtitle: 'Haute Couture Gold • Ciepły złoty blask',
    icon: '✨',
    filter: 'contrast(1.08) brightness(1.04) saturate(1.22) sepia(0.2) hue-rotate(-5deg)'
  },
  {
    id: 'cinematic_noir',
    name: 'Aksamitny Noir',
    subtitle: 'Srebrna taśma filmowa • Głęboki kontrast',
    icon: '🎞️',
    filter: 'grayscale(1) contrast(1.3) brightness(0.95)'
  },
  {
    id: 'pastel_boho',
    name: 'Toskania & Boho',
    subtitle: 'Miękkie pastele • Romantyczny fine-art',
    icon: '🌿',
    filter: 'contrast(0.96) brightness(1.06) saturate(0.9) sepia(0.08)'
  },
  {
    id: 'vintage_35mm',
    name: 'Vintage Kodak 35mm',
    subtitle: 'Stylistyka analogowej taśmy Super 8',
    icon: '📽️',
    filter: 'sepia(0.3) contrast(1.15) saturate(1.12) brightness(0.98) hue-rotate(5deg)'
  },
  {
    id: 'vivid_master',
    name: 'Czysty Master Vivid',
    subtitle: 'Krystaliczna ostrość i głębokie barwy',
    icon: '💎',
    filter: 'contrast(1.1) saturate(1.2) brightness(1.02)'
  }
];

interface PreviewPlayerProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  timelineItems: TimelineItem[];
  mediaLibrary: MediaClip[];
  textLayers: TextLayer[];
  audioTracks: AudioTrackItem[];
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  isCinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  colorGrade?: ColorGradingPreset;
  onColorGradeChange?: (preset: ColorGradingPreset) => void;
  letterboxMode?: 'none' | 'cinemascope' | 'standard';
  onLetterboxChange?: (mode: 'none' | 'cinemascope' | 'standard') => void;
}

export function PreviewPlayer({
  currentTime,
  duration,
  playing,
  timelineItems,
  mediaLibrary,
  textLayers,
  audioTracks,
  onPlayPause,
  onSeek,
  isCinemaMode = false,
  onToggleCinemaMode,
  colorGrade = 'none',
  onColorGradeChange,
  letterboxMode = 'none',
  onLetterboxChange
}: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  
  // Autoscaling and Aspect Ratio mode
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit');
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 100%, 125%, 150%

  // Visual Grading & Cinema Engine
  const [activeColorGrade, setActiveColorGrade] = useState<ColorGradingPreset>(colorGrade);
  const [isLutDropdownOpen, setIsLutDropdownOpen] = useState(false);
  const [isCinemascope, setIsCinemascope] = useState(letterboxMode === 'cinemascope');

  useEffect(() => {
    setActiveColorGrade(colorGrade);
  }, [colorGrade]);

  useEffect(() => {
    setIsCinemascope(letterboxMode === 'cinemascope');
  }, [letterboxMode]);

  const handleSelectColorGrade = (preset: ColorGradingPreset) => {
    setActiveColorGrade(preset);
    setIsLutDropdownOpen(false);
    if (onColorGradeChange) onColorGradeChange(preset);
  };

  const handleToggleCinemascope = () => {
    const nextState = !isCinemascope;
    setIsCinemascope(nextState);
    if (onLetterboxChange) onLetterboxChange(nextState ? 'cinemascope' : 'none');
  };

  // Map for fast media lookup
  const mediaMap = useMemo(() => {
    const map = new Map<string, MediaClip>();
    mediaLibrary.forEach(m => map.set(m.id, m));
    return map;
  }, [mediaLibrary]);

  // Find active video / image clip based on current playhead time
  const activeTimelineItem = useMemo(() => {
    return timelineItems.find(
      item => currentTime >= item.timelineStart && currentTime < item.timelineStart + item.duration
    ) || null;
  }, [currentTime, timelineItems]);

  const activeTitleCard = useMemo(() => {
    if (!activeTimelineItem?.titleCard?.enabled) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    // Cap title card display so it introduces the scene and never masks more than 35% of a short clip
    const maxAllowedDur = Math.max(0.8, activeTimelineItem.duration * 0.35);
    const cardDuration = Math.min(maxAllowedDur, activeTimelineItem.titleCard.duration || 2.5);
    if (itemOffset < cardDuration) {
      return activeTimelineItem.titleCard;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  const activeDedication = useMemo(() => {
    if (!activeTimelineItem?.dedication?.enabled || !activeTimelineItem.dedication.text) return null;
    const itemOffset = currentTime - activeTimelineItem.timelineStart;
    const maxDur = activeTimelineItem.dedication.displayDuration || activeTimelineItem.duration;
    if (itemOffset >= 0 && itemOffset <= maxDur) {
      return activeTimelineItem.dedication;
    }
    return null;
  }, [currentTime, activeTimelineItem]);

  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [resolvedAudioUrls, setResolvedAudioUrls] = useState<Record<string, string>>({});

  // Resolve audio tracks URLs
  useEffect(() => {
    let isCancelled = false;
    audioTracks.forEach(track => {
      if (track.objectUrl && (track.objectUrl.startsWith('http') || track.objectUrl.startsWith('data:') || urlRegistry.isAlive(track.objectUrl))) {
        return;
      }
      resolveAudioTrackUrl(track).then(fresh => {
        if (!isCancelled && fresh) {
          setResolvedAudioUrls(prev => ({ ...prev, [track.id]: fresh }));
        }
      });
    });
    return () => { isCancelled = true; };
  }, [audioTracks]);

  const activeMedia = useMemo(() => {
    if (!activeTimelineItem) return null;
    return mediaMap.get(activeTimelineItem.clipId) || null;
  }, [activeTimelineItem, mediaMap]);

  // Asynchronously resolve active media if objectUrl is not alive
  useEffect(() => {
    if (!activeMedia) return;
    if (activeMedia.objectUrl && (activeMedia.objectUrl.startsWith('http') || activeMedia.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeMedia.objectUrl))) {
      return;
    }
    let isCancelled = false;
    resolveClipMediaUrl(activeMedia).then(fresh => {
      if (!isCancelled && fresh) {
        setResolvedUrls(prev => ({ ...prev, [activeMedia.id]: fresh }));
      }
    });
    return () => { isCancelled = true; };
  }, [activeMedia]);

  // Resolve valid playable URL for media
  const activeMediaUrl = useMemo(() => {
    if (!activeMedia) return null;
    if (activeMedia.file) {
      try {
        if (!activeMedia.objectUrl || activeMedia.objectUrl.startsWith('blob:null') || !urlRegistry.isAlive(activeMedia.objectUrl)) {
          const url = urlRegistry.create(activeMedia.file);
          activeMedia.objectUrl = url;
        }
        return activeMedia.objectUrl;
      } catch (e) {
        console.warn("Could not create object URL for file:", e);
      }
    }
    if (activeMedia.objectUrl && (activeMedia.objectUrl.startsWith('http') || activeMedia.objectUrl.startsWith('data:') || urlRegistry.isAlive(activeMedia.objectUrl))) {
      return activeMedia.objectUrl;
    }
    if (resolvedUrls[activeMedia.id]) {
      return resolvedUrls[activeMedia.id];
    }
    if (activeMedia.type === 'image') {
      return activeMedia.thumbnailUrl || null;
    }
    // Strictly protect video elements: NEVER return image thumbnail as video src!
    return null;
  }, [activeMedia, resolvedUrls]);

  // First clip time for quick jump
  const firstClipStart = useMemo(() => {
    if (timelineItems.length === 0) return 0;
    return Math.min(...timelineItems.map(i => i.timelineStart));
  }, [timelineItems]);

  // Calculate local source time for active item
  const localSourceTime = useMemo(() => {
    if (!activeTimelineItem) return 0;
    const offset = currentTime - activeTimelineItem.timelineStart;
    const speed = activeTimelineItem.speed || 1;
    return activeTimelineItem.sourceStart + (offset * speed);
  }, [currentTime, activeTimelineItem]);

  // Play / Pause state synchronization (runs ONLY when playing state or clip changes)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeTimelineItem || activeMedia?.type === 'image') return;

    if (playing) {
      if (video.paused && !(video as any)._isPlayPending) {
        (video as any)._isPlayPending = true;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              (video as any)._isPlayPending = false;
            })
            .catch(err => {
              (video as any)._isPlayPending = false;
              console.warn("Playback error or autoplay prevented:", err);
              if (!muted) {
                video.muted = true;
                video.play().catch(() => {});
              }
            });
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [playing, activeTimelineItem?.clipId, activeMedia?.id, muted]);

  // Volume, playback rate and seek sync (runs during scrubbing / time updates)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeTimelineItem || activeMedia?.type === 'image') return;

    const finalMuted = muted || Boolean(activeTimelineItem.muted);
    if (video.muted !== finalMuted) {
      video.muted = finalMuted;
    }
    video.volume = finalMuted ? 0 : Math.min(1, (activeTimelineItem.volume ?? 1) * masterVolume);
    video.playbackRate = activeTimelineItem.speed || 1;

    // Synchronize playhead time if drift > 0.6s or when paused
    const drift = Math.abs(video.currentTime - localSourceTime);
    if (!playing || drift > 0.6) {
      if (Number.isFinite(localSourceTime) && video.readyState >= 1) {
        try {
          video.currentTime = Math.max(0, localSourceTime);
        } catch (err) {}
      }
    }
  }, [localSourceTime, playing, activeTimelineItem, activeMedia, muted, masterVolume]);

  // Check if any voiceover track is currently actively speaking
  const isAnyVoiceoverActive = useMemo(() => {
    return audioTracks.some(
      track => track.trackType === 'voiceover' && 
      !track.muted && 
      currentTime >= track.timelineStart && 
      currentTime < track.timelineStart + track.duration
    );
  }, [audioTracks, currentTime]);

  // Sync Continuous Audio Tracks (MP3 Music & Voiceover)
  useEffect(() => {
    audioTracks.forEach(track => {
      const audio = audioRefs.current[track.id];
      if (!audio) return;
      
      const isActive = currentTime >= track.timelineStart && currentTime < track.timelineStart + track.duration;
      
      if (isActive) {
        const localTime = track.sourceStart + (currentTime - track.timelineStart);
        const drift = Math.abs(audio.currentTime - localTime);

        // Only re-seek if paused or drift is noticeable (> 0.8s), preventing micro-stutters during continuous playback across photos
        if (!playing || drift > 0.8) {
          if (Number.isFinite(localTime)) {
            try {
              audio.currentTime = Math.max(0, localTime);
            } catch (e) {}
          }
        }

        // Apply audio ducking for background music when voiceover is speaking
        let trackVol = (track.volume ?? 1) * masterVolume;
        if (track.trackType === 'music' && isAnyVoiceoverActive) {
          const duckAmount = (track.duckingAmount ?? 65) / 100;
          trackVol *= Math.max(0.15, 1 - duckAmount);
        }

        audio.volume = (muted || track.muted) ? 0 : Math.min(1, Math.max(0, trackVol));
        
        if (playing && audio.paused) {
          audio.play().catch(e => console.warn("Audio play prevented", e));
        } else if (!playing && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }, [currentTime, playing, audioTracks, muted, masterVolume, isAnyVoiceoverActive]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const formatTimecode = (seconds: number) => {
    const totalMs = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const m = Math.floor(totalMs / 60);
    const s = Math.floor(totalMs % 60);
    const frames = Math.floor((totalMs % 1) * 30); // 30 fps
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const stepFrames = (frames: number) => {
    const frameDuration = 1 / 30; // 30 fps
    const newTime = Math.max(0, Math.min(duration, currentTime + (frames * frameDuration)));
    onSeek(newTime);
  };

  const activeTexts = useMemo(() => {
    return textLayers.filter(
      t => currentTime >= t.timelineStart && currentTime < t.timelineStart + t.duration
    );
  }, [textLayers, currentTime]);

  const getTextStyleClass = (style: string) => {
    switch (style) {
      case 'elegant': return 'font-serif-luxury tracking-wider';
      case 'minimalist': return 'font-mono uppercase tracking-widest font-light';
      case 'cinematic': return 'font-serif-luxury font-bold drop-shadow-2xl';
      default: return 'font-sans font-medium drop-shadow-md';
    }
  };

  // Determine aspect ratio class / style based on scaleMode
  const getStageAspectRatioStyle = () => {
    switch (scaleMode) {
      case '16:9': return { aspectRatio: '16/9' };
      case '9:16': return { aspectRatio: '9/16', maxHeight: '100%' };
      case '4:3': return { aspectRatio: '4/3' };
      case 'original':
        if (activeMedia?.width && activeMedia?.height) {
          return { aspectRatio: `${activeMedia.width}/${activeMedia.height}` };
        }
        return { aspectRatio: '16/9' };
      case 'fill':
      case 'fit':
      default:
        return { width: '100%', height: '100%' };
    }
  };

  const getObjectFitClass = () => {
    if (scaleMode === 'fill') return 'object-cover';
    return 'object-contain';
  };

  const getFilterStyle = (item?: TimelineItem | null) => {
    const scaleFactor = (zoomLevel / 100) * (item?.scale || 1);
    const chosenPreset = COLOR_GRADE_PRESETS.find(p => p.id === activeColorGrade);
    const filterVal = chosenPreset?.filter || 'none';
    return {
      transform: `scale(${scaleFactor}) rotate(${item?.rotation || 0}deg)`,
      filter: filterVal !== 'none' ? filterVal : undefined
    };
  };

  const currentGradeItem = COLOR_GRADE_PRESETS.find(p => p.id === activeColorGrade) || COLOR_GRADE_PRESETS[0];

  return (
    <div 
      ref={containerRef} 
      className={`flex flex-col bg-[#070707] h-full rounded-2xl overflow-hidden border border-[#262420] shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative group ${
        isCinemaMode ? 'fixed inset-0 z-50 rounded-none border-none' : ''
      }`}
    >
      {/* Offscreen audio pool - never display:none so browser audio pipeline remains active */}
      <div 
        style={{ position: 'fixed', bottom: 0, right: 0, width: 16, height: 16, opacity: 0.001, pointerEvents: 'none', zIndex: -9999 }}
        aria-hidden="true"
      >
        {audioTracks.map(track => (
          <audio
            key={track.id}
            ref={el => {
              audioRefs.current[track.id] = el;
            }}
            src={resolvedAudioUrls[track.id] || track.objectUrl}
            preload="auto"
          />
        ))}
      </div>

      {/* Top Floating Control Bar (Color Grade LUT, CinemaScope, Scale Mode & Zoom) */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-40 flex items-center gap-3 opacity-90 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 shadow-2xl max-w-[calc(100%-1rem)] flex-wrap">
        
        {/* Cinematic Look / LUT Selector */}
        <div className="relative">
          <button
            onClick={() => setIsLutDropdownOpen(!isLutDropdownOpen)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-all cursor-pointer ${
              activeColorGrade !== 'none'
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#E5C158] text-black font-bold shadow-md'
                : 'text-[#C5BBA6] hover:text-white bg-[#1A1813] border border-[#2B271E]'
            }`}
            title="Wybierz profil kolorystyczny (LUT Cinema Look)"
          >
            <Palette className="w-5 h-5" />
            <span className="hidden xs:inline">{currentGradeItem.name}</span>
          </button>

          {/* LUT Dropdown Menu */}
          {isLutDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-[#0E0D0A] border border-[#D4AF37]/40 rounded-xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-[#8C8370] border-b border-[#221F17] flex justify-between items-center">
                <span>Profile Kinowe (LUTs)</span>
                <span className="text-[#D4AF37]">Haute Couture</span>
              </div>
              {COLOR_GRADE_PRESETS.map(preset => {
                const isSelected = activeColorGrade === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectColorGrade(preset.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#2E2716] text-[#EADFC9] border border-[#D4AF37]/50'
                        : 'text-[#AAA69D] hover:bg-[#1A1813] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{preset.icon}</span>
                      <div>
                        <div className="font-serif font-bold text-white text-[11px] sm:text-xs">
                          {preset.name}
                        </div>
                        <div className="text-[9px] text-[#7A7260]">
                          {preset.subtitle}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-[#D4AF37] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CinemaScope 2.39:1 Letterbox Toggle */}
        <button
          onClick={handleToggleCinemascope}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-all cursor-pointer ${
            isCinemascope
              ? 'bg-[#2E2716] text-[#D4AF37] border border-[#D4AF37]/60 font-bold shadow-sm'
              : 'text-[#AAA69D] hover:text-white bg-[#1A1813] border border-[#2B271E]'
          }`}
          title="Przełącz format kinowy 2.39:1 (CinemaScope Paszport)"
        >
          <Film className="w-5 h-5 text-[#D4AF37]" />
          <span className="hidden sm:inline">2.39:1</span>
        </button>

        <div className="h-4 w-px bg-white/20 mx-0.5" />

        {/* Aspect Ratio / Autoscaling modes */}
        <button
          onClick={() => setScaleMode('fit')}
          className={`px-2 py-1 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-colors cursor-pointer ${
            scaleMode === 'fit' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Autoskalowanie (Dopasuj do ekranu)"
        >
          <Scaling className="w-5 h-5" />
          <span className="hidden xs:inline">Auto</span>
        </button>

        <button
          onClick={() => setScaleMode('fill')}
          className={`px-2 py-1 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-colors cursor-pointer ${
            scaleMode === 'fill' ? 'bg-[#D4AF37] text-black font-bold' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Wypełnij kadr (Cover)"
        >
          <span className="hidden xs:inline">Wypełnij</span>
        </button>

        <button
          onClick={() => setScaleMode(scaleMode === '16:9' ? '9:16' : '16:9')}
          className={`px-2 py-1 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-colors cursor-pointer ${
            scaleMode === '16:9' || scaleMode === '9:16' ? 'bg-[#1F1D17] text-[#D4AF37] border border-[#D4AF37]/40' : 'text-[#AAA69D] hover:text-white'
          }`}
          title="Przełącz format 16:9 / 9:16"
        >
          {scaleMode === '9:16' ? <Smartphone className="w-5 h-5 text-[#D4AF37]" /> : <Monitor className="w-5 h-5 text-[#D4AF37]" />}
          <span className="text-xs font-semibold">{scaleMode === '9:16' ? '9:16' : '16:9'}</span>
        </button>

        <div className="h-4 w-px bg-white/20 mx-0.5" />

        {/* Zoom */}
        <button
          onClick={() => setZoomLevel(prev => prev >= 150 ? 100 : prev + 25)}
          className="px-1.5 py-1 text-xs font-mono font-semibold text-[#AAA69D] hover:text-white cursor-pointer"
          title="Powiększenie podglądu"
        >
          {zoomLevel}%
        </button>
      </div>

      {/* Main Video Stage with Vignette & Autoscaling Frame */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden select-none p-1 sm:p-3">
        
        {/* Centered Scalable Screen Box */}
        <div 
          className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden transition-all duration-300 rounded-lg shadow-2xl bg-[#050505]"
          style={getStageAspectRatioStyle()}
        >
          {/* CinemaScope 2.39:1 Anamorphic Letterbox Overlays */}
          {isCinemascope && (
            <>
              <div className="absolute top-0 left-0 right-0 h-[10.5%] bg-black/95 border-b border-[#D4AF37]/30 z-30 pointer-events-none flex items-center px-4 justify-between select-none">
                <span className="text-[8px] font-mono tracking-widest text-[#D4AF37]/70 uppercase">CINEMASCOPE 2.39:1 • HAUTE COUTURE</span>
                <span className="text-[8px] font-mono text-[#AAA69D]/50">35MM ANAMORPHIC</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[10.5%] bg-black/95 border-t border-[#D4AF37]/30 z-30 pointer-events-none select-none" />
            </>
          )}

          {activeMedia && (activeMediaUrl || (activeMedia.type === 'video' && activeMedia.thumbnailUrl)) ? (
            activeMedia.type === 'video' ? (
              activeMediaUrl ? (
                <video
                  ref={videoRef}
                  key={activeMedia.id}
                  src={activeMediaUrl}
                  className={`max-w-full max-h-full w-full h-full ${getObjectFitClass()} pointer-events-none transition-transform duration-150`}
                  playsInline
                  muted={muted || activeTimelineItem?.muted}
                  onLoadedMetadata={() => {
                    setIsVideoReady(true);
                    setVideoError(null);
                    if (videoRef.current && Number.isFinite(localSourceTime)) {
                      videoRef.current.currentTime = Math.max(0, localSourceTime);
                    }
                  }}
                  onError={() => {
                    console.warn("Video render error for clip:", activeMedia.name);
                    setVideoError("Nie można załadować źródła wideo");
                  }}
                  style={getFilterStyle(activeTimelineItem)}
                />
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={activeMedia.thumbnailUrl}
                    alt={activeMedia.name}
                    className={`max-w-full max-h-full w-full h-full ${getObjectFitClass()} pointer-events-none transition-transform duration-150 opacity-90`}
                    style={getFilterStyle(activeTimelineItem)}
                  />
                  <div className="absolute bottom-4 left-4 bg-black/80 px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                    <span>Wczytywanie wideo...</span>
                  </div>
                </div>
              )
            ) : (
              <img
                key={activeMedia.id}
                src={activeMediaUrl || activeMedia.thumbnailUrl || ''}
                alt={activeMedia.name}
                className={`max-w-full max-h-full w-full h-full ${getObjectFitClass()} pointer-events-none transition-transform duration-150`}
                style={getFilterStyle(activeTimelineItem)}
              />
            )
          ) : (
            <div className="text-[#666] text-xs font-mono flex flex-col items-center gap-3 p-6 text-center">
              <span className="w-14 h-14 rounded-full border border-[#D4AF37]/30 bg-[#12110D] flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
                <Film className="w-6 h-6" />
              </span>
              <div className="space-y-1">
                <p className="text-sm text-[#F2EFE8] font-medium font-serif-luxury">
                  {timelineItems.length === 0 ? "Brak materiałów na osi czasu" : "Głowica poza zakresem ujęć"}
                </p>
                <p className="text-[11px] text-[#888] max-w-xs">
                  {timelineItems.length === 0 
                    ? "Przejdź do zakładki 'Materiały' lub użyj 'Szybkiego Montażu', aby dodać ujęcia." 
                    : "Ustaw suwak na początku klipu lub kliknij poniżej, aby skoczyć do pierwszego ujęcia."}
                </p>
              </div>
              {timelineItems.length > 0 && (
                <button
                  onClick={() => onSeek(firstClipStart)}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-[#1E1C17] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Skocz do pierwszego ujęcia ({formatTimecode(firstClipStart)})</span>
                </button>
              )}
            </div>
          )}

          {/* Title Card Overlay Preview */}
          {activeTitleCard && (
            <div 
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 transition-opacity duration-300 pointer-events-none"
              style={{
                background: activeTitleCard.backgroundColor === 'gradient'
                  ? 'linear-gradient(135deg, #111827 0%, #030712 100%)'
                  : activeTitleCard.backgroundColor || '#0A0A0A'
              }}
            >
              {/* Subtle cinematic borders */}
              {(activeTitleCard.style === 'cinematic' || activeTitleCard.style === 'elegant') && activeTitleCard.cardType !== 'outro' && (
                <div className="absolute inset-6 border border-amber-400/20 pointer-events-none" />
              )}

              {/* Outro Double Golden Frame */}
              {(activeTitleCard.cardType === 'outro' || (activeTitleCard.text && (activeTitleCard.text.toLowerCase().includes('podziękowania') || activeTitleCard.text.toLowerCase().includes('dziękujemy') || activeTitleCard.text.toLowerCase().includes('koniec')))) && (
                <div className="absolute inset-4 sm:inset-8 border border-[#D4AF37]/60 pointer-events-none p-1">
                  <div className="w-full h-full border border-[#D4AF37]/25" />
                </div>
              )}
              
              <div className="text-center space-y-4 max-w-2xl px-6 relative z-10">
                {(activeTitleCard.cardType === 'outro' || (activeTitleCard.text && (activeTitleCard.text.toLowerCase().includes('podziękowania') || activeTitleCard.text.toLowerCase().includes('dziękujemy') || activeTitleCard.text.toLowerCase().includes('koniec')))) ? (
                  <>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-widest text-[#FDE047] font-serif drop-shadow-[0_2px_12px_rgba(212,175,55,0.4)]">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-xs sm:text-sm text-[#F5F2EA] leading-relaxed max-w-xl mx-auto font-serif italic mt-3 opacity-95">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                ) : activeTitleCard.style === 'classic' ? (
                  <>
                    <h2 className="text-2xl sm:text-3xl font-bold font-serif text-[#EADFC9] tracking-normal">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-sm sm:text-base italic font-serif text-[#A89E8D] mt-2">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                ) : activeTitleCard.style === 'elegant' ? (
                  <>
                    <h2 className="text-2xl sm:text-4xl font-light font-serif text-[#D4AF37] uppercase tracking-widest leading-relaxed">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-xs sm:text-sm font-serif text-[#EADFC9] uppercase tracking-wider mt-3">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                ) : activeTitleCard.style === 'minimalist' ? (
                  <>
                    <h2 className="text-xl sm:text-2xl font-light text-white tracking-widest">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-[10px] sm:text-xs text-[#666] tracking-wider uppercase mt-2">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl sm:text-5xl font-extrabold uppercase tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] font-sans">
                      {activeTitleCard.text}
                    </h2>
                    {activeTitleCard.subtitle && (
                      <p className="text-xs sm:text-sm text-indigo-400 mt-3 font-medium tracking-wider uppercase">
                        {activeTitleCard.subtitle}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cinematic Dedication / Subtitle Live Overlay */}
          {activeDedication && (
            <div 
              className={`absolute z-20 pointer-events-none transition-all duration-500 ease-out px-4 py-2 ${
                activeDedication.position === 'top'
                  ? 'top-4 sm:top-8 left-1/2 -translate-x-1/2'
                  : activeDedication.position === 'center'
                  ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                  : 'bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2'
              } ${
                activeDedication.style === 'cinematic_lower_third'
                  ? 'w-full max-w-none'
                  : 'w-[92%] sm:w-[86%] max-w-2xl'
              }`}
            >
              <div 
                className={`relative overflow-hidden backdrop-blur-md transition-all duration-300 ${
                  activeDedication.style === 'romantic_script'
                    ? 'bg-gradient-to-b from-rose-950/90 to-zinc-950/95 border border-rose-500/40 rounded-2xl p-4 sm:p-6 shadow-2xl'
                    : activeDedication.style === 'cinematic_lower_third'
                    ? 'bg-gradient-to-r from-black/20 via-black/90 to-black/20 border-y-2 border-indigo-500/80 rounded-none px-6 py-4 text-center'
                    : activeDedication.style === 'modern_clean'
                    ? 'bg-zinc-950/90 border border-zinc-700 rounded-2xl p-4 sm:p-5 shadow-2xl'
                    : 'bg-gradient-to-b from-zinc-900/95 via-zinc-950/95 to-zinc-900/95 border border-indigo-500/50 rounded-2xl p-4 sm:p-6 shadow-2xl'
                }`}
              >
                <div className="text-center relative z-10 space-y-1.5 sm:space-y-2">
                  {/* Occasion Header */}
                  {activeDedication.title && (
                    <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/35 text-indigo-300 text-[10px] sm:text-xs font-semibold uppercase tracking-widest">
                      <span>✦</span>
                      <span>{activeDedication.title}</span>
                      <span>✦</span>
                    </div>
                  )}

                  {/* Main Dedication Text */}
                  <p className="text-white text-xs sm:text-base md:text-lg italic tracking-wide leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] max-w-xl mx-auto">
                    „{activeDedication.text}”
                  </p>

                  {/* Author / Signature */}
                  {activeDedication.author && (
                    <div className="pt-1 flex items-center justify-center gap-2 text-indigo-300 text-[11px] sm:text-xs font-mono font-medium tracking-wider">
                      <span className="opacity-60">—</span>
                      <span>{activeDedication.author}</span>
                      <span className="opacity-60">—</span>
                    </div>
                  )}

                  {/* Voice attached badge */}
                  {activeDedication.audioUrl && (
                    <div className="pt-0.5 flex items-center justify-center gap-1.5 text-[9px] text-zinc-400 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Osobisty głos / dedykacja audio</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Text Layers Overlay */}
          {activeTexts.map(layer => (
            <div 
              key={layer.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none transition-opacity duration-300 px-4 py-1 rounded ${getTextStyleClass(layer.style)}`}
              style={{ 
                left: `${layer.position.x * 100}%`, 
                top: `${layer.position.y * 100}%`,
                color: layer.color,
                backgroundColor: layer.backgroundColor || 'transparent',
                fontSize: `${Math.max(1.1, layer.fontSize * 1.1)}rem`,
                textShadow: '0 2px 14px rgba(0,0,0,0.95)'
              }}
            >
              {layer.text}
            </div>
          ))}

          {/* Safe Zones Broadcast Overlay */}
          {showSafeZones && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[90%] h-[90%] border border-dashed border-amber-400/50 relative">
                <span className="absolute top-1 left-2 text-[9px] font-mono text-amber-400/80 uppercase">
                  Action Safe (90%)
                </span>
                <div className="w-[88.8%] h-[88.8%] mx-auto mt-[3.1%] border border-indigo-400/50 relative">
                  <span className="absolute top-1 left-2 text-[9px] font-mono text-indigo-400/80 uppercase">
                    Title Safe (80%)
                  </span>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border-t border-l border-white/40" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Clip Name Badge */}
        {activeMedia && (
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white flex items-center gap-2 shadow-lg">
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span className="truncate max-w-[220px]">{activeMedia.name}</span>
              {activeMedia.width && activeMedia.height && (
                <span className="text-[10px] font-mono text-zinc-400">({activeMedia.width}x{activeMedia.height})</span>
              )}
            </span>
          </div>
        )}

        {/* Cinema Mode Exit button */}
        {isCinemaMode && onToggleCinemaMode && (
          <button 
            onClick={onToggleCinemaMode}
            className="absolute top-4 right-4 z-50 px-3.5 py-2 rounded-xl bg-black/80 hover:bg-black border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xl"
          >
            <Minimize2 className="w-4 h-4 text-indigo-400" />
            <span>Wyjdź z Kina</span>
          </button>
        )}

      </div>

      {/* Transport Controls Bar */}
      <div className="h-13 sm:h-14 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-2 sm:px-4 shrink-0 select-none w-full max-w-full">
        
        {/* Left: Timecode & Step frames */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="font-mono text-[11px] sm:text-xs text-indigo-300 font-semibold bg-zinc-900 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-zinc-800 shadow-inner">
            {formatTimecode(currentTime)} <span className="text-zinc-500 hidden xs:inline">/ {formatTimecode(duration)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            <button 
              onClick={() => stepFrames(-1)}
              className="px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg border border-transparent hover:border-zinc-700 transition-colors cursor-pointer"
              title="-1 Klatka (1/30s)"
            >
              -1f
            </button>
            <button 
              onClick={() => stepFrames(1)}
              className="px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg border border-transparent hover:border-zinc-700 transition-colors cursor-pointer"
              title="+1 Klatka (1/30s)"
            >
              +1f
            </button>
          </div>
        </div>

        {/* Center: Main Transport Play/Pause & Peak VU Meter */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-4 shrink-0">
          <button 
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="p-1.5 sm:p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Cofnij o 5 sekund"
            aria-label="Cofnij o 5 sekund"
          >
            <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          
          <button 
            onClick={onPlayPause}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all transform hover:scale-105 shadow-lg shadow-indigo-600/30 cursor-pointer"
            title={playing ? "Wstrzymaj (Spacja)" : "Odtwórz (Spacja)"}
            aria-label={playing ? "Wstrzymaj" : "Odtwórz"}
          >
            {playing ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />}
          </button>
          
          <button 
            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
            className="p-1.5 sm:p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Przewiń o 5 sekund"
            aria-label="Przewiń o 5 sekund"
          >
            <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Stereo VU Meter */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 rounded-xl border border-zinc-800 shadow-inner select-none" title="Wskaźnik poziomu dźwięku (Peak VU Meter)">
            <span className="text-[9px] font-mono text-indigo-400 font-semibold">VU</span>
            <div className="flex flex-col gap-0.5">
              {/* Left Channel */}
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5, 6].map(i => {
                  const active = playing && !muted && (i <= (Math.sin(currentTime * 8 + i) * 2 + 4));
                  return (
                    <div 
                      key={`l_${i}`} 
                      className={`w-1.5 h-1.5 rounded-xs transition-colors duration-75 ${
                        active 
                          ? (i === 6 ? 'bg-rose-500 shadow-[0_0_4px_#f43f5e]' : i >= 5 ? 'bg-amber-400' : 'bg-indigo-500') 
                          : 'bg-zinc-800'
                      }`} 
                    />
                  );
                })}
              </div>
              {/* Right Channel */}
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5, 6].map(i => {
                  const active = playing && !muted && (i <= (Math.cos(currentTime * 7 + i) * 2 + 4));
                  return (
                    <div 
                      key={`r_${i}`} 
                      className={`w-1.5 h-1.5 rounded-xs transition-colors duration-75 ${
                        active 
                          ? (i === 6 ? 'bg-rose-500 shadow-[0_0_4px_#f43f5e]' : i >= 5 ? 'bg-amber-400' : 'bg-indigo-500') 
                          : 'bg-zinc-800'
                      }`} 
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Audio, Safe Zones, Cinema & Fullscreen */}
        <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0">
          
          {/* Safe zones toggle */}
          <button 
            onClick={() => setShowSafeZones(!showSafeZones)}
            className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer hidden xs:flex ${
              showSafeZones ? 'text-amber-400 bg-amber-400/15 border border-amber-400/30' : 'text-zinc-400 hover:text-white'
            }`}
            title="Marginesy bezpieczeństwa (Safe Zones 90% / 80%)"
            aria-label="Przełącz marginesy bezpieczeństwa"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          {/* Volume toggle */}
          <button 
            onClick={() => setMuted(!muted)}
            className="p-1.5 sm:p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title={muted ? "Włącz dźwięk" : "Wycisz"}
            aria-label={muted ? "Włącz dźwięk" : "Wycisz"}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Cinema mode */}
          {onToggleCinemaMode && (
            <button 
              onClick={onToggleCinemaMode}
              className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer hidden sm:flex ${
                isCinemaMode ? 'text-indigo-400 bg-indigo-500/20 border border-indigo-500/40' : 'text-zinc-400 hover:text-white'
              }`}
              title="Tryb Kinowy"
              aria-label="Tryb kinowy"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button 
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Pełny ekran"
            aria-label="Pełny ekran"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
