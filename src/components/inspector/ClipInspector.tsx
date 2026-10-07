import React, { useState, useRef, useEffect } from 'react';
import type { 
  TimelineItem, 
  MediaClip, 
  ClipColorAdjustments, 
  LookPreset, 
  FitMode, 
  TransitionType,
  AudioTrackItem,
  ClipDedication,
  DedicationStyle,
  DedicationPosition
} from '../../types/project';
import { 
  Scissors, 
  Volume2, 
  RotateCw, 
  Maximize2, 
  Sparkles, 
  Type, 
  Layers, 
  Sun, 
  Film,
  Heart,
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Upload,
  Trash2,
  Bot,
  Loader2,
  Music,
  Check
} from 'lucide-react';
import { useStudioToast } from '../common/ToastContext';
import { urlRegistry } from '../../core/media/urlRegistry';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';

interface ClipInspectorProps {
  item: TimelineItem;
  media: MediaClip;
  onUpdate: (id: string, updates: Partial<TimelineItem>) => void;
  onSplit?: (id: string, splitAtSourceTime: number) => void;
  onAddAudioTrack?: (track: AudioTrackItem) => void;
  onUpdateAudioTrack?: (id: string, updates: Partial<AudioTrackItem>) => void;
  onDeleteAudioTrack?: (id: string) => void;
  audioTracks?: AudioTrackItem[];
  onApplyDurationToAllImages?: (duration: number) => void;
}

type InspectorTab = 'TRANSFORM' | 'DEDICATION' | 'COLOR' | 'AUDIO' | 'TRANSITION' | 'TITLE';

export function ClipInspector({ 
  item, 
  media, 
  onUpdate, 
  onSplit,
  onAddAudioTrack,
  onUpdateAudioTrack,
  onDeleteAudioTrack,
  audioTracks = [],
  onApplyDurationToAllImages
}: ClipInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(media.type === 'image' ? 'TRANSFORM' : 'TRANSFORM');
  const toast = useStudioToast();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPlayingVoicePreview, setIsPlayingVoicePreview] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const voiceAudioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const colorAdj: ClipColorAdjustments = item.colorAdjustments || media.colorAdjustments || {
    exposure: 0,
    contrast: 0,
    brightness: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpness: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    lookPreset: 'none',
    lookIntensity: 100
  };

  // Dedication state initialization
  const dedication: ClipDedication = item.dedication || {
    enabled: false,
    title: 'Dedykacja / Podpis Autorski',
    text: 'Dziękujemy za wspólne chwile, zaufanie i wspaniałą współpracę.',
    author: 'Studio Filmowe',
    style: 'gold_luxury',
    position: 'bottom',
    voiceVolume: 1.0,
    duckMusic: true
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch {}
      }
      if (voiceAudioPreviewRef.current) {
        voiceAudioPreviewRef.current.pause();
        voiceAudioPreviewRef.current = null;
      }
    };
  }, []);

  const handleUpdate = (field: keyof TimelineItem, value: any) => {
    onUpdate(item.id, { [field]: value });
  };

  const handleDedicationUpdate = (updates: Partial<ClipDedication>) => {
    const updated: ClipDedication = {
      ...dedication,
      ...updates
    };
    onUpdate(item.id, { dedication: updated });
  };

  const handleColorUpdate = (field: keyof ClipColorAdjustments, value: any) => {
    const updated: ClipColorAdjustments = {
      ...colorAdj,
      [field]: value
    };
    onUpdate(item.id, { colorAdjustments: updated });
  };

  const handleResetColor = () => {
    const clean: ClipColorAdjustments = {
      exposure: 0,
      contrast: 0,
      brightness: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      sharpness: 0,
      highlights: 0,
      shadows: 0,
      vignette: 0,
      lookPreset: 'none',
      lookIntensity: 100
    };
    onUpdate(item.id, { colorAdjustments: clean });
  };

  // Photo duration changer
  const handlePhotoDurationChange = (newDuration: number) => {
    const dur = Math.max(0.5, Math.min(120, Number(newDuration.toFixed(1))));
    onUpdate(item.id, {
      duration: dur,
      sourceEnd: item.sourceStart + dur
    });
  };

  const handleTrimChange = (type: 'start' | 'end', val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const speed = item.speed || 1;
    
    if (type === 'start') {
      const newStart = Math.max(0, Math.min(num, item.sourceEnd - 0.2));
      const newDuration = (item.sourceEnd - newStart) / speed;
      onUpdate(item.id, { sourceStart: newStart, duration: newDuration });
    } else {
      const maxLimit = media.type === 'image' ? 300 : media.duration;
      const newEnd = Math.max(item.sourceStart + 0.2, Math.min(num, maxLimit));
      const newDuration = (newEnd - item.sourceStart) / speed;
      onUpdate(item.id, { sourceEnd: newEnd, duration: newDuration });
    }
  };

  const handleSplit = () => {
    if (!onSplit) return;
    const midPoint = item.sourceStart + ((item.sourceEnd - item.sourceStart) / 2);
    onSplit(item.id, midPoint);
  };

  // Start live microphone recording for dedication voice
  const startVoiceRecording = async () => {
    try {
      audioChunksRef.current = [];
      setRecordingSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Visual Audio Meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const voiceUrl = urlRegistry.create(fullBlob);
        const finalDuration = Math.max(1, recordingSeconds);

        // Store into IndexedDB for persistence
        const trackId = `voice_dedication_${item.id}`;
        try {
          await localIndexedDB.saveMediaBlob(trackId, fullBlob);
        } catch {}

        // Update timeline item dedication
        handleDedicationUpdate({
          enabled: true,
          audioUrl: voiceUrl,
          audioDuration: finalDuration,
          audioTrackId: trackId
        });

        // Sync with project audioTracks if handler provided
        if (onAddAudioTrack) {
          const existingVoiceTrack = audioTracks.find(t => t.id === trackId);
          if (existingVoiceTrack && onUpdateAudioTrack) {
            onUpdateAudioTrack(trackId, {
              objectUrl: voiceUrl,
              duration: finalDuration,
              timelineStart: item.timelineStart
            });
          } else {
            onAddAudioTrack({
              id: trackId,
              name: `Głos dedykacji: ${media.name}`,
              objectUrl: voiceUrl,
              duration: finalDuration,
              trackType: 'voiceover',
              sourceStart: 0,
              sourceEnd: finalDuration,
              timelineStart: item.timelineStart,
              volume: dedication.voiceVolume ?? 1.0,
              fadeIn: 0.2,
              fadeOut: 0.3,
              duckingAmount: 65
            });
          }
        }

        stream.getTracks().forEach(t => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);
        toast.showSuccess(`Pomyślnie nagrano własny głos (${finalDuration}s)!`);
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - startTime) / 1000)));
      }, 250);
    } catch (err) {
      console.warn('Microphone error:', err);
      toast.showError('Brak dostępu do mikrofonu. Upewnij się, że przyznano uprawnienia.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  // Upload custom audio file for dedication
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const trackId = `voice_dedication_${item.id}`;
    const voiceUrl = urlRegistry.create(file);
    try {
      await localIndexedDB.saveMediaBlob(trackId, file);
    } catch {}

    const tempAudio = new Audio(voiceUrl);
    tempAudio.onloadedmetadata = () => {
      const dur = Math.max(1, Math.round(tempAudio.duration * 10) / 10);
      handleDedicationUpdate({
        enabled: true,
        audioUrl: voiceUrl,
        audioDuration: dur,
        audioTrackId: trackId
      });

      if (onAddAudioTrack) {
        onAddAudioTrack({
          id: trackId,
          name: `Dedykacja audio: ${file.name}`,
          objectUrl: voiceUrl,
          duration: dur,
          trackType: 'voiceover',
          sourceStart: 0,
          sourceEnd: dur,
          timelineStart: item.timelineStart,
          volume: dedication.voiceVolume ?? 1.0,
          fadeIn: 0.2,
          fadeOut: 0.3,
          duckingAmount: 65
        });
      }

      toast.showSuccess(`Wgrano plik audio dedykacji (${dur}s)!`);
    };
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleVoicePreview = () => {
    if (!dedication.audioUrl) return;

    if (!voiceAudioPreviewRef.current) {
      const audio = new Audio(dedication.audioUrl);
      voiceAudioPreviewRef.current = audio;
      audio.onended = () => setIsPlayingVoicePreview(false);
    }

    if (isPlayingVoicePreview) {
      voiceAudioPreviewRef.current.pause();
      setIsPlayingVoicePreview(false);
    } else {
      voiceAudioPreviewRef.current.play().then(() => setIsPlayingVoicePreview(true)).catch(() => {});
    }
  };

  const removeVoiceRecording = () => {
    if (voiceAudioPreviewRef.current) {
      voiceAudioPreviewRef.current.pause();
      voiceAudioPreviewRef.current = null;
    }
    if (dedication.audioTrackId && onDeleteAudioTrack) {
      onDeleteAudioTrack(dedication.audioTrackId);
    }
    handleDedicationUpdate({
      audioUrl: undefined,
      audioDuration: undefined,
      audioTrackId: undefined
    });
    toast.showInfo('Usunięto nagranie głosu dedykacji.');
  };

  // Convert seconds to Timecode HH:MM:SS:FF at 30 FPS
  const toTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const frames = Math.floor((s % 1) * 30);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#111114] border-l border-[#24242A] overflow-hidden w-full md:w-88 shrink-0 shadow-2xl">
      {/* Header */}
      <div className="p-3.5 border-b border-[#24242A] flex items-center justify-between bg-[#16161C]">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-[#D4AF37] shrink-0" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-white truncate font-mono">
            {media.type === 'image' ? 'Inspektor Zdjęcia' : 'Inspektor Ujęcia'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {media.type === 'image' && (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
              FOTO
            </span>
          )}
          <span className="text-[11px] font-mono text-[#D4AF37] bg-[#2A2414] px-2 py-0.5 rounded border border-[#3E3420]">
            {item.duration.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Clip Mini Preview & Specs */}
      <div className="p-3.5 bg-[#141418] border-b border-[#222228] flex items-center gap-3">
        <div className="w-16 h-12 bg-black rounded-lg overflow-hidden shrink-0 border border-[#2E2E36] relative">
          {media.thumbnailUrl ? (
            <img src={media.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#1A1A20]">
              <Film className="w-4 h-4 text-[#666]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate" title={media.name}>{media.name}</p>
          <div className="flex items-center gap-2 text-[10px] text-[#888892] font-mono mt-0.5">
            <span>{media.width}×{media.height}</span>
            <span>•</span>
            <span>{media.type === 'image' ? 'Zdjęcie' : `${media.fps || 30} FPS`}</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="grid grid-cols-6 bg-[#16161A] border-b border-[#222228] text-[9px] font-mono font-bold">
        {[
          { id: 'TRANSFORM', label: 'Czas & Kadr', icon: Clock },
          { id: 'DEDICATION', label: 'Dedykacja', icon: Heart },
          { id: 'COLOR', label: 'Kolor', icon: Sun },
          { id: 'AUDIO', label: 'Audio', icon: Volume2 },
          { id: 'TRANSITION', label: 'Przejścia', icon: Sparkles },
          { id: 'TITLE', label: 'Plansza', icon: Type }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const hasDedication = tab.id === 'DEDICATION' && dedication.enabled;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InspectorTab)}
              className={`py-2 flex flex-col items-center justify-center gap-0.5 border-b-2 transition-all cursor-pointer relative ${
                isActive 
                  ? 'border-[#D4AF37] text-[#D4AF37] bg-[#221D12]' 
                  : 'border-transparent text-[#777782] hover:text-white hover:bg-[#1A1A20]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate max-w-[50px]">{tab.label}</span>
              {hasDedication && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        
        {/* TAB 1: TRANSFORM & DURATION */}
        {activeTab === 'TRANSFORM' && (
          <div className="space-y-4">
            
            {/* DURATION SELECTOR (Zdjęcia i Filmy) */}
            <div className="p-3.5 rounded-xl bg-[#17171C] border border-[#3E3420]/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#D4AF37] uppercase flex items-center gap-1.5 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" /> 
                  {media.type === 'image' ? 'Czas Wyświetlania Zdjęcia' : 'Długość Ujęcia w Filmie'}
                </span>
                <span className="text-[11px] font-mono font-bold text-white bg-[#2A2414] px-2 py-0.5 rounded border border-[#D4AF37]/40">
                  {item.duration.toFixed(1)}s
                </span>
              </div>

              {media.type === 'image' ? (
                <div className="space-y-3">
                  {/* Stepper controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handlePhotoDurationChange(item.duration - 1)}
                      className="px-2 py-1.5 rounded-lg bg-[#222228] hover:bg-[#2A2A32] text-white font-mono text-xs cursor-pointer border border-[#2E2E36]"
                      title="-1 sekunda"
                    >
                      -1s
                    </button>
                    <button
                      onClick={() => handlePhotoDurationChange(item.duration - 0.5)}
                      className="px-2 py-1.5 rounded-lg bg-[#222228] hover:bg-[#2A2A32] text-white font-mono text-xs cursor-pointer border border-[#2E2E36]"
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
                        value={item.duration.toFixed(1)}
                        onChange={(e) => handlePhotoDurationChange(parseFloat(e.target.value) || 3)}
                        className="w-full text-center bg-[#121215] border border-[#3E3420] focus:border-[#D4AF37] rounded-lg py-1.5 text-sm font-bold text-[#D4AF37] focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handlePhotoDurationChange(item.duration + 0.5)}
                      className="px-2 py-1.5 rounded-lg bg-[#222228] hover:bg-[#2A2A32] text-white font-mono text-xs cursor-pointer border border-[#2E2E36]"
                      title="+0.5 sekundy"
                    >
                      +0.5s
                    </button>
                    <button
                      onClick={() => handlePhotoDurationChange(item.duration + 1)}
                      className="px-2 py-1.5 rounded-lg bg-[#222228] hover:bg-[#2A2A32] text-white font-mono text-xs cursor-pointer border border-[#2E2E36]"
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
                    value={item.duration}
                    onChange={(e) => handlePhotoDurationChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                  />

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[#888892] font-mono mr-1">Szybki wybór:</span>
                    {[2, 3, 5, 8, 10, 15, 20].map(sec => (
                      <button
                        key={sec}
                        onClick={() => handlePhotoDurationChange(sec)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                          Math.abs(item.duration - sec) < 0.2
                            ? 'bg-[#D4AF37] text-black font-bold'
                            : 'bg-[#202028] text-[#AAA] hover:text-white hover:bg-[#282832]'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>

                  {onApplyDurationToAllImages && (
                    <button
                      onClick={() => {
                        onApplyDurationToAllImages(item.duration);
                        toast.showSuccess(`Ustawiono ${item.duration.toFixed(1)}s dla wszystkich zdjęć w filmie!`);
                      }}
                      className="w-full mt-1.5 py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-white/90 hover:text-white text-[11px] font-mono flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>✦ Zastosuj {item.duration.toFixed(1)}s do wszystkich zdjęć</span>
                    </button>
                  )}

                  {/* Match Voice Duration Button if voice is present */}
                  {dedication.audioDuration && (
                    <button
                      onClick={() => handlePhotoDurationChange(dedication.audioDuration!)}
                      className="w-full mt-1 py-1.5 px-3 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/50 text-[#D4AF37] text-[11px] font-mono flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Dopasuj do nagranego głosu ({dedication.audioDuration.toFixed(1)}s)</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Video Duration controls */
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] text-[#888892] font-mono">
                    <span>Oryginalny plik: {media.duration.toFixed(1)}s</span>
                    <span>W filmie: {item.duration.toFixed(1)}s</span>
                  </div>

                  {/* Quick length presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[#888892] font-mono mr-1">Długość:</span>
                    {[
                      { label: 'Całość', dur: media.duration },
                      { label: '3s', dur: 3 },
                      { label: '5s', dur: 5 },
                      { label: '8s', dur: 8 },
                      { label: '10s', dur: 10 }
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          const targetDur = Math.min(media.duration, preset.dur);
                          const speed = item.speed || 1;
                          const newEnd = Math.min(media.duration, item.sourceStart + (targetDur * speed));
                          const dur = (newEnd - item.sourceStart) / speed;
                          onUpdate(item.id, { sourceEnd: newEnd, duration: dur });
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#202028] text-[#AAA] hover:text-white hover:bg-[#282832] cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {dedication.audioDuration && (
                    <button
                      onClick={() => {
                        const targetDur = dedication.audioDuration!;
                        const speed = item.speed || 1;
                        const newEnd = Math.min(media.duration, item.sourceStart + (targetDur * speed));
                        const dur = (newEnd - item.sourceStart) / speed;
                        onUpdate(item.id, { sourceEnd: newEnd, duration: dur });
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/50 text-[#D4AF37] text-[11px] font-mono flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Dopasuj do głosu dedykacji ({dedication.audioDuration.toFixed(1)}s)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Precise Trim (Dla filmów) */}
            {media.type !== 'image' && (
              <div className="space-y-2.5 p-3 rounded-xl bg-[#17171C] border border-[#26262E]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#D4AF37] uppercase flex items-center gap-1.5 font-mono text-[11px]">
                    <Scissors className="w-3.5 h-3.5" /> Precyzyjne Cięcie (IN / OUT)
                  </span>
                  {onSplit && (
                    <button 
                      onClick={handleSplit}
                      className="text-[10px] bg-[#2A2414] border border-[#3E3420] text-[#D4AF37] hover:text-white px-2 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      Podziel na pół
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 font-mono">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892]">PUNKT IN (s)</label>
                    <input 
                      type="number" 
                      min="0" 
                      max={item.sourceEnd - 0.2} 
                      step="0.033"
                      value={item.sourceStart.toFixed(2)}
                      onChange={(e) => handleTrimChange('start', e.target.value)}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                    <span className="text-[9px] text-[#666] block">{toTimecode(item.sourceStart)}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892]">PUNKT OUT (s)</label>
                    <input 
                      type="number" 
                      min={item.sourceStart + 0.2} 
                      max={media.duration} 
                      step="0.033"
                      value={item.sourceEnd.toFixed(2)}
                      onChange={(e) => handleTrimChange('end', e.target.value)}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                    <span className="text-[9px] text-[#666] block">{toTimecode(item.sourceEnd)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Fit & Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white uppercase font-mono block">
                Tryb Dopasowania Kadru
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'fit', label: 'FIT (Całość)' },
                  { id: 'fill', label: 'FILL (Wypełnij)' },
                  { id: 'original', label: 'ORIGINAL' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => handleUpdate('fitMode', mode.id as FitMode)}
                    className={`p-2 rounded-lg border text-center font-mono text-[10px] transition-all cursor-pointer ${
                      (item.fitMode || 'fit') === mode.id
                        ? 'bg-[#2A2414] border-[#D4AF37] text-[#D4AF37] font-bold'
                        : 'bg-[#18181D] border-[#2A2A32] text-[#888892] hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rotation & Speed */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Obrót Kątowy</label>
                <button
                  onClick={() => {
                    const currentRot = item.rotation || 0;
                    const nextRot = (currentRot + 90) % 360;
                    handleUpdate('rotation', nextRot);
                  }}
                  className="w-full py-2 bg-[#18181D] border border-[#2A2A32] hover:border-[#D4AF37] rounded-lg text-white font-mono flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3 text-[#D4AF37]" />
                  <span>{item.rotation || 0}°</span>
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Prędkość Odtwarzania</label>
                <select
                  value={item.speed || 1.0}
                  onChange={(e) => {
                    const spd = parseFloat(e.target.value);
                    const dur = (item.sourceEnd - item.sourceStart) / spd;
                    onUpdate(item.id, { speed: spd, duration: dur });
                  }}
                  className="w-full bg-[#18181D] border border-[#2A2A32] rounded-lg px-2.5 py-2 text-white font-mono focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value={0.25}>0.25× (Super Slow)</option>
                  <option value={0.5}>0.5× (Slow Motion)</option>
                  <option value={0.75}>0.75× (Subtle Slow)</option>
                  <option value={1.0}>1.0× (Normalna)</option>
                  <option value={1.25}>1.25× (Lekko szybciej)</option>
                  <option value={1.5}>1.5× (Szybka)</option>
                  <option value={2.0}>2.0× (Timelapse)</option>
                </select>
              </div>
            </div>

            {/* Scale Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                <label>SKALA POWIĘKSZENIA</label>
                <span className="text-[#D4AF37] font-bold">{Math.round((item.scale || 1.0) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="2.5" 
                step="0.05"
                value={item.scale || 1.0}
                onChange={(e) => handleUpdate('scale', parseFloat(e.target.value))}
                className="w-full h-2 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
              />
            </div>
          </div>
        )}

        {/* TAB 2: DEDICATION & CUSTOM VOICE */}
        {activeTab === 'DEDICATION' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header / Toggle */}
            <div className="p-3.5 bg-[#17171C] rounded-xl border border-[#3E3420] flex items-center justify-between">
              <div>
                <span className="text-white font-bold text-xs flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-[#D4AF37]" /> Dedykacja & Osobisty Głos
                </span>
                <p className="text-[10px] text-[#888892] mt-0.5">
                  Własna dedykacja i lektor na zdjęciu lub filmie
                </p>
              </div>
              <button 
                onClick={() => handleDedicationUpdate({ enabled: !dedication.enabled })}
                className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                  dedication.enabled ? 'bg-[#D4AF37]' : 'bg-[#2E2E36]'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  dedication.enabled ? 'left-6' : 'left-1'
                }`} />
              </button>
            </div>

            {dedication.enabled && (
              <div className="space-y-4">
                
                {/* --- SEKCJA 1: WŁASNY GŁOS / DEDYRACJA MÓWIONA --- */}
                <div className="p-3.5 rounded-xl bg-[#141418] border border-[#2E2E36] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#D4AF37] uppercase font-mono flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" /> 1. Własny Głos / Dedykacja Audio
                    </span>
                    {dedication.audioUrl && (
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        NAGRANO: {dedication.audioDuration?.toFixed(1) || '0'}s
                      </span>
                    )}
                  </div>

                  {dedication.audioUrl ? (
                    /* Audio Recorded State */
                    <div className="p-3 rounded-lg bg-[#1B1B22] border border-[#3E3420] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleVoicePreview}
                            className="w-8 h-8 rounded-full bg-[#D4AF37] text-black flex items-center justify-center hover:bg-[#FFE58F] transition cursor-pointer"
                            title={isPlayingVoicePreview ? 'Zatrzymaj' : 'Odsłuchaj nagranie'}
                          >
                            {isPlayingVoicePreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>
                          <div>
                            <span className="text-xs font-bold text-white block">Głos Dedykacji</span>
                            <span className="text-[10px] text-[#888892] font-mono">
                              Czas trwania: {dedication.audioDuration?.toFixed(1)}s
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={removeVoiceRecording}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition cursor-pointer"
                          title="Usuń nagranie głosu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Synchronize photo duration with recorded voice */}
                      <button
                        onClick={() => {
                          if (dedication.audioDuration) {
                            handlePhotoDurationChange(dedication.audioDuration);
                            toast.showSuccess(`Dopasowano czas zdjęcia do głosu (${dedication.audioDuration.toFixed(1)}s)!`);
                          }
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/60 text-[#D4AF37] text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Dopasuj czas {media.type === 'image' ? 'zdjęcia' : 'filmu'} do głosu ({dedication.audioDuration?.toFixed(1)}s)</span>
                      </button>
                    </div>
                  ) : isRecording ? (
                    /* Active Live Recording State */
                    <div className="p-4 rounded-lg bg-[#2A1515] border border-rose-500/60 text-center space-y-3 animate-pulse">
                      <div className="flex items-center justify-center gap-2 text-rose-400 font-mono font-bold text-sm">
                        <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                        <span>NAGRYWANIE W TOKU... {recordingSeconds}s</span>
                      </div>

                      {/* Live Audio Level Meter */}
                      <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-75"
                          style={{ width: `${Math.max(5, audioLevel)}%` }}
                        />
                      </div>

                      <button
                        onClick={stopVoiceRecording}
                        className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold font-mono text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                      >
                        <Square className="w-4 h-4 fill-white" />
                        <span>Zatrzymaj i zapisz nagranie</span>
                      </button>
                    </div>
                  ) : (
                    /* Initial Recording & Source Choices */
                    <div className="space-y-2">
                      <button
                        onClick={startVoiceRecording}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#D4AF37]/20 via-[#D4AF37]/30 to-[#D4AF37]/20 hover:from-[#D4AF37]/30 hover:to-[#D4AF37]/40 border border-[#D4AF37]/60 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                      >
                        <Mic className="w-4 h-4 text-[#D4AF37]" />
                        <span>Nagraj własny głos (Mikrofon)</span>
                      </button>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2 px-3 rounded-lg bg-[#1C1C24] hover:bg-[#252530] border border-[#2E2E36] text-[#AAA] hover:text-white text-[11px] font-mono flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Wgraj własny plik nagrania (MP3 / WAV / M4A)</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="audio/*"
                        className="hidden"
                        onChange={handleAudioUpload}
                      />
                    </div>
                  )}

                  {/* Volume & Ducking */}
                  <div className="pt-2 border-t border-[#222228] space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                      <label>GŁOŚNOŚĆ GŁOSU DEDYKACJI</label>
                      <span className="text-[#D4AF37]">{Math.round((dedication.voiceVolume ?? 1.0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={dedication.voiceVolume ?? 1.0}
                      onChange={(e) => handleDedicationUpdate({ voiceVolume: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                    />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[#AAA]">Inteligentne wyciszanie muzyki (Audio Ducking)</span>
                      <button
                        onClick={() => handleDedicationUpdate({ duckMusic: !dedication.duckMusic })}
                        className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${
                          dedication.duckMusic !== false ? 'bg-[#D4AF37]' : 'bg-[#2E2E36]'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          dedication.duckMusic !== false ? 'left-4.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* --- SEKCJA 2: WIZUALNA TREŚĆ DEDYKACJI NA EKRANIE --- */}
                <div className="p-3.5 rounded-xl bg-[#141418] border border-[#2E2E36] space-y-3">
                  <span className="text-[11px] font-bold text-[#D4AF37] uppercase font-mono flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5" /> 2. Wizualna Treść Dedykacji na Ekranie
                  </span>

                  {/* Occasion Header */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Okazja / Nagłówek</label>
                    </div>
                    <input 
                      type="text"
                      value={dedication.title || ''}
                      placeholder="np. Dedykacja dla Rodziców"
                      onChange={(e) => handleDedicationUpdate({ title: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />

                    {/* Quick header suggestions */}
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {[
                        'Dla Rodziców',
                        'Dla Mamy',
                        'Dla Taty',
                        'Dla Świadków',
                        'Od Nowożeńców',
                        'Dla Dziadków'
                      ].map(preset => (
                        <button
                          key={preset}
                          onClick={() => handleDedicationUpdate({ title: preset })}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-[#202028] text-[#AAA] hover:text-[#D4AF37] hover:bg-[#282832] transition font-mono cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dedication Text */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Treść Życzeń / Dedykacji</label>
                    <textarea
                      rows={3}
                      value={dedication.text}
                      placeholder="Wpisz treść osobistej dedykacji..."
                      onChange={(e) => handleDedicationUpdate({ text: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg p-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none resize-none"
                    />

                    {/* Quick heartfelt presets */}
                    <div className="space-y-1">
                      <span className="text-[9px] text-[#777] font-mono block">Przykładowe teksty i dedykacje:</span>
                      {[
                        'Dziękujemy za wspólne chwile, zaufanie i niezapomniane wspomnienia.',
                        'Dziękujemy wszystkim twórcom, partnerom i widzom za wsparcie produkcji.',
                        'Z wdzięcznością dla wszystkich, którzy przyczynili się do powstania tego filmu.'
                      ].map((txt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleDedicationUpdate({ text: txt })}
                          className="w-full text-left text-[9px] text-[#999] hover:text-[#D4AF37] hover:bg-[#1E1E26] p-1 rounded transition truncate block cursor-pointer"
                        >
                          • „{txt}”
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Author / Signature */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Podpis / Data</label>
                    <input 
                      type="text"
                      value={dedication.author || ''}
                      placeholder="np. Joanna i Piotr • 24.08.2024"
                      onChange={(e) => handleDedicationUpdate({ author: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  {/* Visual Style & Position */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Styl Wizualny</label>
                      <select
                        value={dedication.style}
                        onChange={(e) => handleDedicationUpdate({ style: e.target.value as DedicationStyle })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="gold_luxury">Złoty Luksus (Gold Luxury)</option>
                        <option value="romantic_script">Romantyczna Poezja</option>
                        <option value="cinematic_lower_third">Dolny Pasek Kinowy</option>
                        <option value="modern_clean">Nowoczesny Czysty</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Pozycja na Ekranie</label>
                      <select
                        value={dedication.position}
                        onChange={(e) => handleDedicationUpdate({ position: e.target.value as DedicationPosition })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="bottom">Dół (Dolna trzecia część)</option>
                        <option value="center">Środek (Centrum kadru)</option>
                        <option value="top">Góra (Górna część)</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLOR GRADING & LOOKS */}
        {activeTab === 'COLOR' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5" /> Korekta Kolorów & Filtry
              </span>
              <button 
                onClick={handleResetColor}
                className="text-[10px] text-[#888892] hover:text-white flex items-center gap-1 font-mono cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Look Presets */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[#888892] uppercase font-mono">Styl Kinowy (Preset)</label>
              <select
                value={colorAdj.lookPreset || 'none'}
                onChange={(e) => handleColorUpdate('lookPreset', e.target.value as LookPreset)}
                className="w-full bg-[#17171C] border border-[#26262E] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="none">Brak (Naturalny profil)</option>
                <option value="cinematic">Kinowy Teal & Orange (Blockbuster Master)</option>
                <option value="warm">Ciepłe Światło i Złote Tony</option>
                <option value="cool">Chłodny Poranny Błękit</option>
                <option value="vintage">Klasyczny Vintage</option>
                <option value="bw">Czarno-Biały Ponadczasowy</option>
                <option value="film">Emulsja Kodak Portra</option>
                <option value="golden_hour">Złota Godzina (Golden Hour)</option>
              </select>
            </div>

            {/* Sliders */}
            <div className="space-y-3 pt-2">
              {[
                { id: 'exposure', label: 'Ekspozycja', min: -100, max: 100 },
                { id: 'contrast', label: 'Kontrast', min: -100, max: 100 },
                { id: 'saturation', label: 'Nasycenie', min: -100, max: 100 },
                { id: 'temperature', label: 'Temperatura (Barwa)', min: -100, max: 100 },
                { id: 'vignette', label: 'Winieta Kinowa', min: 0, max: 100 }
              ].map(slider => (
                <div key={slider.id} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                    <span>{slider.label}</span>
                    <span className="text-[#D4AF37]">{(colorAdj as any)[slider.id] || 0}</span>
                  </div>
                  <input 
                    type="range" 
                    min={slider.min} 
                    max={slider.max} 
                    value={(colorAdj as any)[slider.id] || 0}
                    onChange={(e) => handleColorUpdate(slider.id as any, parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: AUDIO SETTINGS */}
        {activeTab === 'AUDIO' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Dźwięk Oryginalny Ujęcia
            </span>

            {media.type === 'image' ? (
              <div className="p-3.5 rounded-xl bg-[#17171C] border border-[#26262E] text-center text-[#888892] space-y-2">
                <Film className="w-6 h-6 text-[#555] mx-auto" />
                <p className="text-xs text-white font-medium">To ujęcie jest zdjęciem (brak wbudowanego dźwięku).</p>
                <p className="text-[10px]">
                  Możesz dodać do niego własny głos lub dedykację w zakładce <strong className="text-[#D4AF37]">Dedykacja</strong>!
                </p>
                <button
                  onClick={() => setActiveTab('DEDICATION')}
                  className="mt-1 px-3 py-1.5 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] text-[11px] font-mono hover:bg-[#D4AF37]/30 transition cursor-pointer"
                >
                  Przejdź do Dedykacji & Głosu →
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-3 bg-[#17171C] rounded-xl border border-[#26262E]">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Wycisz ujęcie</span>
                  <button 
                    onClick={() => handleUpdate('muted', !item.muted)}
                    className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${item.muted ? 'bg-rose-500' : 'bg-[#2E2E36]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${item.muted ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {!item.muted && (
                  <div className="space-y-3 pt-2 border-t border-[#222228]">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                        <span>GŁOŚNOŚĆ KLIPU</span>
                        <span className="text-[#D4AF37]">{Math.round((item.volume ?? 1) * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="2" 
                        step="0.05"
                        value={item.volume ?? 1}
                        onChange={(e) => handleUpdate('volume', parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-[#888892] uppercase font-mono">Fade In (s)</label>
                        <input 
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          value={item.fadeIn || 0}
                          onChange={(e) => handleUpdate('fadeIn', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-[#888892] uppercase font-mono">Fade Out (s)</label>
                        <input 
                          type="number"
                          min="0"
                          max="5"
                          step="0.1"
                          value={item.fadeOut || 0}
                          onChange={(e) => handleUpdate('fadeOut', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: TRANSITIONS */}
        {activeTab === 'TRANSITION' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Przejścia Kinowe
            </span>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Wejście (Transition IN)</label>
                <select
                  value={item.transitionIn || 'cut'}
                  onChange={(e) => handleUpdate('transitionIn', e.target.value as TransitionType)}
                  className="w-full bg-[#17171C] border border-[#26262E] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="cut">Cięcie (Cut)</option>
                  <option value="fade">Ściemnienie (Fade to Black)</option>
                  <option value="dissolve">Płynne Przenikanie (Cross Dissolve)</option>
                  <option value="dip_black">Zanikanie w Czerń (Dip to Black)</option>
                  <option value="dip_white">Błysk Światła (Dip to White)</option>
                  <option value="zoom">Kinowy Najazd (Zoom In)</option>
                  <option value="light_leak">Flesz Świetlny (Light Leak)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#888892] uppercase font-mono">Wyjście (Transition OUT)</label>
                <select
                  value={item.transitionOut || 'cut'}
                  onChange={(e) => handleUpdate('transitionOut', e.target.value as TransitionType)}
                  className="w-full bg-[#17171C] border border-[#26262E] rounded-lg px-2.5 py-2 text-white font-mono text-xs focus:border-[#D4AF37] focus:outline-none"
                >
                  <option value="cut">Cięcie (Cut)</option>
                  <option value="fade">Ściemnienie (Fade)</option>
                  <option value="dissolve">Przenikanie (Dissolve)</option>
                  <option value="dip_black">Zanikanie w Czerń (Dip to Black)</option>
                  <option value="zoom">Oddalenie (Zoom Out)</option>
                </select>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px] font-mono text-[#888892]">
                  <span>CZAS TRWANIA PRZEJŚCIA</span>
                  <span className="text-[#D4AF37]">{(item.transitionDuration || 0.5).toFixed(1)}s</span>
                </div>
                <input 
                  type="range" 
                  min="0.2" 
                  max="2.0" 
                  step="0.1"
                  value={item.transitionDuration || 0.5}
                  onChange={(e) => handleUpdate('transitionDuration', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#24242C] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: TITLE CARDS */}
        {activeTab === 'TITLE' && (
          <div className="space-y-4">
            <span className="font-bold text-[#D4AF37] uppercase font-mono text-[11px] flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Plansza Tekstowa Przed Klipem
            </span>

            <div className="p-3 bg-[#17171C] rounded-xl border border-[#26262E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Włącz planszę</span>
                <button 
                  onClick={() => {
                    const currentCard = item.titleCard || {
                      enabled: false,
                      text: media.name.replace(/\.[^/.]+$/, ''),
                      duration: 3,
                      style: 'cinematic',
                      backgroundColor: '#0A0A0A'
                    };
                    handleUpdate('titleCard', {
                      ...currentCard,
                      enabled: !currentCard.enabled
                    });
                  }}
                  className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${item.titleCard?.enabled ? 'bg-[#D4AF37]' : 'bg-[#2E2E36]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${item.titleCard?.enabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {item.titleCard?.enabled && (
                <div className="space-y-3 pt-2 border-t border-[#222228]">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Napis Główny</label>
                    <input 
                      type="text"
                      value={item.titleCard.text}
                      onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, text: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-[#888892] uppercase font-mono">Podtytuł</label>
                    <input 
                      type="text"
                      value={item.titleCard.subtitle || ''}
                      placeholder="Opcjonalny podtytuł..."
                      onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, subtitle: e.target.value })}
                      className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Styl</label>
                      <select
                        value={item.titleCard.style}
                        onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, style: e.target.value as any })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      >
                        <option value="cinematic">Kinowy Złoty</option>
                        <option value="elegant">Elegancki Serif</option>
                        <option value="classic">Klasyczny</option>
                        <option value="minimalist">Minimalistyczny</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-[#888892] uppercase font-mono">Czas trwania (s)</label>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        value={item.titleCard.duration}
                        onChange={(e) => handleUpdate('titleCard', { ...item.titleCard, duration: parseFloat(e.target.value) || 3 })}
                        className="w-full bg-[#121215] border border-[#2E2E36] rounded-lg px-2 py-1.5 text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
