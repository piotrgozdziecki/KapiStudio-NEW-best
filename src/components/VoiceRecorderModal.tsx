import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Check, X, Volume2, AlertCircle, Upload, Music, Clock, Sliders, Scissors } from 'lucide-react';
import { useStudioToast } from './common/ToastContext';

export interface VoiceoverSaveOptions {
  trackType?: 'voiceover' | 'music';
  timelineStartMode?: 'start' | 'current' | 'custom';
  timelineStart?: number;
  sourceStart?: number;
  sourceEnd?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  customName?: string;
  fileSizeMb?: number;
}

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveVoiceover: (audioBlob: Blob, audioUrl: string, durationSeconds: number, options?: VoiceoverSaveOptions) => void;
  defaultText?: string;
  currentTime?: number;
  initialTab?: 'mic' | 'upload';
}

export function VoiceRecorderModal({
  isOpen,
  onClose,
  onSaveVoiceover,
  currentTime = 0,
  initialTab = 'mic',
}: VoiceRecorderModalProps) {
  const [activeTab, setActiveTab] = useState<'mic' | 'upload'>(initialTab);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string>('');
  const [fileSizeMb, setFileSizeMb] = useState<number>(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync activeTab if initialTab changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMessage(null);
    }
  }, [isOpen, initialTab]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Timing and track configuration
  const [trackType, setTrackType] = useState<'voiceover' | 'music'>('music');
  const [timelineStartMode, setTimelineStartMode] = useState<'start' | 'current' | 'custom'>('start');
  const [customTimelineStart, setCustomTimelineStart] = useState<number>(0);
  const [sourceStart, setSourceStart] = useState<number>(0);
  const [sourceEnd, setSourceEnd] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [fadeIn, setFadeIn] = useState<number>(1.5);
  const [fadeOut, setFadeOut] = useState<number>(2.0);

  const toast = useStudioToast();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch {}
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, [recordedUrl]);

  if (!isOpen) return null;

  const startRecording = async () => {
    setErrorMessage(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    audioChunksRef.current = [];
    setRecordDuration(0);
    setSourceStart(0);
    setSourceEnd(0);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Twoja przeglądarka lub środowisko nie obsługuje nagrywania dźwięku (brak interfejsu navigator.mediaDevices). Upewnij się, że strona otwarta jest w bezpiecznym kontekście HTTPS.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (errConstraint: any) {
        // Fallback for devices (e.g. Poco F6 or external USB interfaces) that reject complex constraints
        console.warn('[VoiceRecorder] Constrained getUserMedia failed, retrying with basic audio constraints:', errConstraint);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Audio meter analyzer
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
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
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      // Safe MediaRecorder initialization with candidate MIME types
      const candidateMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac'
      ];
      let selectedMime = '';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        for (const candidate of candidateMimes) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            selectedMime = candidate;
            break;
          }
        }
      }

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);
      } catch (errRecorder) {
        console.warn('[VoiceRecorder] Fallback to default MediaRecorder without options:', errRecorder);
        mediaRecorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalMime = mediaRecorder.mimeType || selectedMime || 'audio/webm';
        const fullBlob = new Blob(audioChunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(fullBlob);
        setRecordedBlob(fullBlob);
        setRecordedUrl(url);
        stream.getTracks().forEach((track) => track.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);
        setFileSizeMb(Number((fullBlob.size / (1024 * 1024)).toFixed(2)));
        setVolume(1.2);
        toast.showSuccess(`Pomyślnie nagrano własny głos! (${recordDuration}s)`);
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const dur = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
        setRecordDuration(dur);
        setSourceEnd(dur);
      }, 250);
    } catch (err: any) {
      console.error('[VoiceRecorder] Microphone access error:', err);
      let userMsg = 'Brak dostępu do mikrofonu.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        userMsg = 'Przeglądarka zablokowała dostęp do mikrofonu. Kliknij ikonę kłódki/ustawień przy pasku adresu i zezwól na uprawnienie "Mikrofon".';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        userMsg = 'Nie wykryto żadnego mikrofonu w Twoim urządzeniu. Podłącz mikrofon lub słuchawki i spróbuj ponownie.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        userMsg = 'Mikrofon jest obecnie zajęty przez inną aplikację (np. Zoom, Teams, Discord). Zamknij inne programy.';
      } else if (err?.name === 'SecurityError') {
        userMsg = 'Dostęp do mikrofonu został zablokowany ze względów bezpieczeństwa (wymagane bezpieczne połączenie HTTPS).';
      } else if (err?.message) {
        userMsg = `Błąd mikrofonu: ${err.message}`;
      }
      setErrorMessage(userMsg);
      toast.showError(userMsg);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const processAudioFile = async (file: File) => {
    setIsDecodingAudio(true);
    const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));
    setFileSizeMb(sizeMb);
    setCustomFileName(file.name);

    const url = URL.createObjectURL(file);
    setRecordedBlob(file);
    setRecordedUrl(url);

    // Fast multi-stage audio duration probe
    let detectedDuration = 0;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      detectedDuration = Math.max(1, Number(audioBuffer.duration.toFixed(1)));
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          await audioCtx.close().catch(() => {});
        } catch {}
      }
    } catch {
      // Fallback to HTMLAudioElement metadata
      detectedDuration = await new Promise<number>((resolve) => {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          resolve(Math.max(1, Math.round(audio.duration || 10)));
        };
        audio.onerror = () => resolve(10);
        setTimeout(() => resolve(10), 3000);
      });
    }

    setRecordDuration(detectedDuration);
    setSourceStart(0);
    setSourceEnd(detectedDuration);
    setTrackType('music');
    setVolume(0.85);
    setIsDecodingAudio(false);

    toast.showSuccess(`Wczytano plik audio (${formatSec(detectedDuration)} • ${sizeMb} MB): ${file.name}`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processAudioFile(file);
    }
  };

  const togglePreview = () => {
    if (!previewAudioRef.current && recordedUrl) {
      const audio = new Audio(recordedUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
    }

    if (isPlayingPreview) {
      previewAudioRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.currentTime = sourceStart;
        previewAudioRef.current.volume = Math.min(1.0, volume);
        previewAudioRef.current.play().then(() => setIsPlayingPreview(true)).catch(() => {});
      }
    }
  };

  const handleSave = () => {
    if (recordedBlob && recordedUrl) {
      let timelineStart = 0;
      if (timelineStartMode === 'start') {
        timelineStart = 0;
      } else if (timelineStartMode === 'current') {
        timelineStart = Math.max(0, Math.round(currentTime));
      } else if (timelineStartMode === 'custom') {
        timelineStart = Math.max(0, customTimelineStart);
      }

      const effectiveDuration = Math.max(0.5, (sourceEnd > sourceStart ? sourceEnd - sourceStart : recordDuration));

      onSaveVoiceover(recordedBlob, recordedUrl, effectiveDuration, {
        trackType,
        timelineStartMode,
        timelineStart,
        sourceStart,
        sourceEnd: sourceEnd || recordDuration,
        volume,
        fadeIn,
        fadeOut,
        fileSizeMb,
        customName: customFileName || (trackType === 'voiceover' ? 'Własny głos (nagranie)' : 'Podkład MP3')
      });
      onClose();
    }
  };

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl glass-panel p-6 text-white shadow-2xl relative border border-white/15 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
            {activeTab === 'mic' ? <Mic className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-serif-luxury tracking-wide">
              {activeTab === 'mic' ? 'Nagranie Własnego Głosu / Przysięgi' : 'Wgraj Własny Dźwięk / Muzykę MP3'}
            </h3>
            <p className="text-xs font-sans-modern opacity-75 mt-0.5">
              Twój własny dźwięk z pełną kontrolą czasu trwania, startu na osi czasu i głośności
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-2xl bg-black/40 p-1 border border-white/10 mb-4">
          <button
            onClick={() => {
              setActiveTab('upload');
              setTrackType('music');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'upload' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-white/70 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Wgraj z Pliku (MP3 / WAV)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('mic');
              setTrackType('voiceover');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'mic' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-white/70 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Nagraj Mikrofonem</span>
          </button>
        </div>

        {/* TAB 1: UPLOAD AUDIO FILE */}
        {activeTab === 'upload' && (
          <div className="my-3 space-y-3">
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  processAudioFile(file);
                }
              }}
              className={`p-5 rounded-2xl border-2 border-dashed transition-all text-center cursor-pointer space-y-1.5 ${
                isDragging
                  ? 'border-[#D4AF37] bg-[#D4AF37]/15 scale-[1.01]'
                  : 'border-white/20 hover:border-[#D4AF37] bg-black/40 hover:bg-[#D4AF37]/5'
              }`}
            >
              <Upload className="w-7 h-7 text-[#D4AF37] mx-auto" />
              <div className="text-xs font-bold text-white">
                {isDecodingAudio 
                  ? 'Wczytywanie i analiza czasu trwania...' 
                  : isDragging 
                  ? 'Upuść plik MP3 / audio tutaj!' 
                  : 'Kliknij lub przeciągnij i upuść plik dźwiękowy MP3 / WAV'}
              </div>
              <p className="text-[11px] text-white/50">
                Obsługiwane formaty: MP3, WAV, M4A, AAC, OGG, FLAC
              </p>
              <input
                type="file"
                ref={fileInputRef}
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {recordedBlob && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                    <Music className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </div>
                  <div className="truncate">
                    <span className="font-mono text-white/95 font-bold block truncate">{customFileName || 'Audio'}</span>
                    <span className="text-[10px] text-white/60 font-mono">
                      Całkowity czas: <strong className="text-[#FDE047]">{formatSec(recordDuration)}</strong> ({recordDuration}s) • Rozmiar: {fileSizeMb} MB
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 font-bold shrink-0 ml-2">
                  Gotowy
                </span>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MIC RECORDING */}
        {activeTab === 'mic' && (
          <div className="flex flex-col items-center justify-center my-3 space-y-3">
            {/* Visual Record Orb */}
            <div className="relative">
              {isRecording && (
                <div
                  className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none"
                  style={{ animationDuration: '1.5s' }}
                />
              )}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all shadow-xl cursor-pointer ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/50 scale-105'
                    : 'bg-[#D4AF37] hover:bg-[#FFE58F] text-black shadow-[#D4AF37]/30 hover:scale-105'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-6 h-6 mb-0.5 fill-white" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Zatrzymaj</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6 mb-0.5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Nagraj</span>
                  </>
                )}
              </button>
            </div>

            {/* Timer and Meter */}
            <div className="text-center w-full max-w-xs">
              <div className="text-xl font-mono font-bold tracking-wider text-white">
                {formatSec(recordDuration)}
              </div>
              <p className="text-[11px] text-white/60 mt-0.5">
                {isRecording
                  ? 'Trwa nagrywanie... Mów wyraźnie do mikrofonu'
                  : recordedBlob
                  ? 'Nagranie głosu gotowe! Możesz je odsłuchać lub powtórzyć'
                  : 'Kliknij przycisk, aby rozpocząć nagrywanie własnego głosu'}
              </p>

              {/* Live Audio Meter */}
              {isRecording && (
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500 transition-all duration-75"
                    style={{ width: `${Math.max(5, audioLevel)}%` }}
                  />
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 p-2.5 bg-red-500/20 border border-red-500/40 rounded-xl text-red-200 text-xs w-full">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Preview Player & Detailed Timing Inspector */}
        {recordedUrl && (
          <div className="space-y-3 mb-3">
            {/* Audio Mini Player */}
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePreview}
                  className="w-9 h-9 rounded-full bg-[#D4AF37] text-black flex items-center justify-center hover:bg-[#FFE58F] transition cursor-pointer shrink-0"
                >
                  {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div>
                  <span className="text-xs font-bold text-white block">Odsłuchaj fragment</span>
                  <span className="text-[10px] text-white/60 font-mono">
                    Zakres odtwarzania: <strong className="text-[#FDE047]">{formatSec(sourceStart)} - {formatSec(sourceEnd || recordDuration)}</strong> (czas trwania: {Math.max(1, Math.round((sourceEnd || recordDuration) - sourceStart))}s)
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  if (previewAudioRef.current) previewAudioRef.current.pause();
                  setRecordedBlob(null);
                  setRecordedUrl(null);
                  setRecordDuration(0);
                  setCustomFileName('');
                  setSourceStart(0);
                  setSourceEnd(0);
                }}
                className="text-[11px] text-white/60 hover:text-white flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Zmień plik</span>
              </button>
            </div>

            {/* Placement and Timing Controls (Timeline Start & Duration) */}
            <div className="p-3.5 bg-black/40 rounded-2xl border border-white/10 space-y-3 text-xs">
              {/* Row 1: Pozycja startu na osi czasu */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-mono text-[#AAA] uppercase font-bold flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#D4AF37]" /> Czas rozpoczęcia na osi czasu:
                  </label>
                  <span className="text-[10px] font-mono text-[#FDE047]">
                    Start w: {timelineStartMode === 'start' ? '0:00 (Początek filmu)' : timelineStartMode === 'current' ? `${formatSec(Math.round(currentTime))} (Kursor)` : `${formatSec(customTimelineStart)} (${customTimelineStart}s)`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-[#141418] p-0.5 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setTimelineStartMode('start')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      timelineStartMode === 'start' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Od początku (0:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineStartMode('current')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      timelineStartMode === 'current' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#888] hover:text-white'
                    }`}
                  >
                    W kursorze ({formatSec(Math.round(currentTime))})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineStartMode('custom')}
                    className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      timelineStartMode === 'custom' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#888] hover:text-white'
                    }`}
                  >
                    Własny start...
                  </button>
                </div>

                {timelineStartMode === 'custom' && (
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="range"
                      min={0}
                      max={600}
                      step={1}
                      value={customTimelineStart}
                      onChange={(e) => setCustomTimelineStart(Number(e.target.value))}
                      className="flex-1 accent-[#D4AF37] h-1.5 rounded-lg cursor-pointer bg-white/20"
                    />
                    <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        value={customTimelineStart}
                        onChange={(e) => setCustomTimelineStart(Math.max(0, Number(e.target.value)))}
                        className="w-16 bg-[#0E0E12] border border-white/20 rounded px-2 py-0.5 text-center text-[#FDE047] font-bold"
                      />
                      <span className="text-[10px] text-white/50">sekund</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Przycięcie utworu (Trimming / Zakres czasu) */}
              {recordDuration > 1 && (
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-mono text-[#AAA] uppercase font-bold flex items-center gap-1.5">
                      <Scissors className="w-3 h-3 text-[#D4AF37]" /> Zakres i przycięcie dźwięku:
                    </label>
                    <span className="text-[10px] font-mono text-white/70">
                      Użyj od <strong>{formatSec(sourceStart)}</strong> do <strong>{formatSec(sourceEnd || recordDuration)}</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-white/50 block mb-0.5">Początek w pliku (s):</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, (sourceEnd || recordDuration) - 1)}
                        step={1}
                        value={sourceStart}
                        onChange={(e) => setSourceStart(Number(e.target.value))}
                        className="w-full accent-[#D4AF37] h-1.5 rounded-lg cursor-pointer bg-white/20"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-white/50 block mb-0.5">Koniec w pliku (s):</span>
                      <input
                        type="range"
                        min={sourceStart + 1}
                        max={recordDuration}
                        step={1}
                        value={sourceEnd || recordDuration}
                        onChange={(e) => setSourceEnd(Number(e.target.value))}
                        className="w-full accent-[#D4AF37] h-1.5 rounded-lg cursor-pointer bg-white/20"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Row 3: Typ ścieżki & Głośność */}
              <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[#AAA] uppercase block mb-1 font-bold">Rola ścieżki:</label>
                  <div className="grid grid-cols-2 gap-1 bg-[#141418] p-0.5 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setTrackType('music');
                        setVolume(0.85);
                      }}
                      className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        trackType === 'music' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#888] hover:text-white'
                      }`}
                    >
                      🎵 Muzyka MP3
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackType('voiceover');
                        setVolume(1.2);
                      }}
                      className={`py-1 px-2 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        trackType === 'voiceover' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#888] hover:text-white'
                      }`}
                    >
                      🎙️ Głos / Lektor
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-mono text-[#AAA] uppercase font-bold flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-[#D4AF37]" /> Głośność:
                    </label>
                    <span className="text-[10px] font-mono text-[#FDE047]">{Math.round(volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full accent-[#D4AF37] h-1.5 rounded-lg cursor-pointer bg-white/20"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={!recordedBlob || isRecording || isDecodingAudio}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FDE047] text-black font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50 hover:brightness-110 active:scale-95 transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Dodaj ścieżkę dźwiękową ({formatSec(Math.max(1, (sourceEnd || recordDuration) - sourceStart))})</span>
          </button>
        </div>
      </div>
    </div>
  );
}

