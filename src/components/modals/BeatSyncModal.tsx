import React, { useState } from 'react';
import { 
  Music, 
  Sparkles, 
  Activity, 
  Zap, 
  Clock, 
  Sliders, 
  CheckCircle2, 
  X, 
  Loader2, 
  Radio, 
  Play, 
  ArrowRight,
  RefreshCw,
  Layers
} from 'lucide-react';
import type { ProjectState, TimelineItem, AudioTrackItem } from '../../types/project';
import { 
  detectBeatsAndTempos, 
  alignTimelineToMusicBeats, 
  createRhythmicAutoCutFromClips, 
  generateBeatTimelineMarkers,
  BeatSyncPacing,
  BeatDetectionResult
} from '../../core/audio/beatDetectionEngine';
import { useStudioToast } from '../common/ToastContext';

interface BeatSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyUpdatedProject: (updated: ProjectState) => void;
}

export function BeatSyncModal({
  isOpen,
  onClose,
  project,
  onApplyUpdatedProject
}: BeatSyncModalProps) {
  const toast = useStudioToast();

  const musicTracks = (project.audioTracks || []).filter(t => t.trackType === 'music' || !t.trackType);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(musicTracks[0]?.id || '');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<BeatDetectionResult | null>(null);
  const [pacing, setPacing] = useState<BeatSyncPacing>('every_2nd');
  const [applyMode, setApplyMode] = useState<'align_existing' | 'create_new' | 'markers_only'>('align_existing');

  if (!isOpen) return null;

  const currentTrack = musicTracks.find(t => t.id === selectedTrackId) || musicTracks[0];

  const handleStartAnalysis = async () => {
    if (!currentTrack) {
      toast.showWarning('Dodaj lub wybierz ścieżkę muzyczną przed rozpoczęciem analizy rytmu.');
      return;
    }

    const audioSource = currentTrack.file || currentTrack.objectUrl;
    if (!audioSource) {
      toast.showError('Brak źródła audio dla wybranej ścieżki.');
      return;
    }

    setIsAnalyzing(true);
    setProgressPct(5);
    setProgressMsg('Inicjalizacja analizatora audio...');

    try {
      const result = await detectBeatsAndTempos(audioSource, (pct, msg) => {
        setProgressPct(pct);
        setProgressMsg(msg);
      });

      setAnalysisResult(result);
      toast.showSuccess(`Wykryto tempo ${result.bpm} BPM oraz ${result.beatTimestamps.length} punktów rytmicznych!`);
    } catch (err: any) {
      console.error('[BeatSyncModal] Beat detection failed:', err);
      toast.showError('Nie udało się przeanalizować bitu: ' + (err?.message || 'Błąd audio'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (!analysisResult || analysisResult.beatTimestamps.length === 0) {
      toast.showWarning('Najpierw przeprowadź analizę rytmu utworu.');
      return;
    }

    const beatMarkers = generateBeatTimelineMarkers(
      analysisResult.beatTimestamps,
      analysisResult.downbeatTimestamps
    );

    // Update track with BPM data
    const updatedAudioTracks = (project.audioTracks || []).map(t => {
      if (t.id === currentTrack?.id) {
        return {
          ...t,
          bpm: analysisResult.bpm,
          beatTimestamps: analysisResult.beatTimestamps,
          downbeatTimestamps: analysisResult.downbeatTimestamps
        };
      }
      return t;
    });

    let updatedTimelineItems = [...project.timelineItems];

    if (applyMode === 'align_existing') {
      const { updatedItems, alignedCount } = alignTimelineToMusicBeats(
        project.timelineItems,
        analysisResult.beatTimestamps,
        pacing
      );
      updatedTimelineItems = updatedItems;
      toast.showSuccess(`Zsynchronizowano cięcia ${alignedCount} ujęć z uderzeniami muzyki!`);
    } else if (applyMode === 'create_new') {
      if (project.mediaLibrary.length === 0) {
        toast.showWarning('Brak ujęć w bibliotece mediów do stworzenia nowego montażu.');
        return;
      }
      updatedTimelineItems = createRhythmicAutoCutFromClips(
        project.mediaLibrary,
        analysisResult.beatTimestamps,
        pacing
      );
      toast.showSuccess(`Utworzono nowy, dynamiczny montaż z ${updatedTimelineItems.length} rytmicznych ujęć!`);
    } else {
      toast.showSuccess(`Dodano ${beatMarkers.length} znaczników rytmicznych na oś czasu.`);
    }

    onApplyUpdatedProject({
      ...project,
      audioTracks: updatedAudioTracks,
      timelineItems: updatedTimelineItems,
      markers: [
        ...(project.markers || []).filter(m => m.type !== 'music'),
        ...beatMarkers
      ],
      updatedAt: new Date().toISOString()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#121216] border border-[#C5A059]/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.85)] flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-[#23232C] flex items-center justify-between bg-gradient-to-r from-[#1C160F] via-[#121216] to-[#121216]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C5A059]/15 border border-[#C5A059]/40 flex items-center justify-center text-[#E5C992] shadow-inner">
              <Activity className="w-5 h-5 animate-pulse text-[#FDE047]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide font-cinematic flex items-center gap-2">
                BEAT-SYNC & RYTMICZNY MONTAŻ
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#C5A059]/20 border border-[#C5A059]/40 text-[#FDE047]">
                  PRO STUDIO
                </span>
              </h2>
              <p className="text-xs text-[#949B96] mt-0.5">
                Automatyczne dopasowywanie cięć wideo do tempa (BPM) i uderzeń muzyki
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#949B96] hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          
          {/* Step 1: Select Audio Track */}
          <div>
            <label className="text-xs font-semibold text-[#C5A059] uppercase tracking-wider block mb-2">
              1. Wybierz ścieżkę podkładu muzycznego
            </label>
            {musicTracks.length === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3">
                <Music className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold block">Brak ścieżki muzycznej w projekcie</span>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Dodaj plik MP3/WAV na osi montażu lub w sekcji audio, aby zsynchronizować montaż z muzyką.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {musicTracks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTrackId(t.id);
                      setAnalysisResult(null);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      (selectedTrackId === t.id || (!selectedTrackId && currentTrack?.id === t.id))
                        ? 'bg-[#2A2315] border-[#C5A059] text-white shadow-lg'
                        : 'bg-[#18181F] border-[#2A2A36] text-[#AAA69D] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Music className="w-4 h-4 text-[#FDE047] shrink-0" />
                      <div className="truncate">
                        <span className="text-xs font-semibold block truncate">{t.name}</span>
                        <span className="text-[10px] text-[#7E7A72]">Czas: {t.duration.toFixed(1)}s</span>
                      </div>
                    </div>
                    {t.bpm && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/40 border border-[#C5A059]/40 text-[#FDE047]">
                        {t.bpm} BPM
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Run Beat Analysis */}
          <div className="p-4 rounded-2xl bg-[#18181F] border border-[#2A2A36] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">2. Analiza rytmu i wykrywanie uderzeń</span>
                <p className="text-[11px] text-[#949B96] mt-0.5">
                  Wyodrębnia fale dźwiękowe, akcenty perkusyjne oraz downbeaty
                </p>
              </div>
              <button
                onClick={handleStartAnalysis}
                disabled={isAnalyzing || !currentTrack}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#E5C992] text-black font-bold text-xs flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 shadow-md"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analizuję...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-black" />
                    <span>{analysisResult ? 'Przelicz ponownie' : 'Wykryj bity i rytm'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Progress Bar */}
            {isAnalyzing && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] text-[#C5A059]">
                  <span>{progressMsg}</span>
                  <span className="font-mono font-bold">{progressPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#C5A059] to-[#FDE047] transition-all duration-200" 
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Result Stats Banner */}
            {analysisResult && !isAnalyzing && (
              <div className="p-3.5 rounded-xl bg-[#2A2315]/80 border border-[#C5A059]/40 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] text-[#AAA69D] uppercase tracking-wider block">Wykryte Tempo</span>
                    <span className="text-lg font-mono font-extrabold text-[#FDE047]">{analysisResult.bpm} <span className="text-xs">BPM</span></span>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div>
                    <span className="text-[10px] text-[#AAA69D] uppercase tracking-wider block">Punkty Rytmu</span>
                    <span className="text-sm font-bold text-white">{analysisResult.beatTimestamps.length} bitów</span>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div>
                    <span className="text-[10px] text-[#AAA69D] uppercase tracking-wider block">Downbeaty (Mocne)</span>
                    <span className="text-sm font-bold text-[#E5C992]">{analysisResult.downbeatTimestamps.length}</span>
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            )}
          </div>

          {/* Step 3: Pacing & Alignment Settings */}
          {analysisResult && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-semibold text-[#C5A059] uppercase tracking-wider block mb-2">
                  3. Styl i tempo cięć (Pacing)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'every_2nd', title: 'Co 2 bity', desc: 'Najlepszy balans kinowy i teledyskowy' },
                    { id: 'downbeats_only', title: 'Mocne uderzenia', desc: 'Spokojniejsze, majestatyczne cięcia' },
                    { id: 'every_beat', title: 'Każdy bit', desc: 'Ultra szybki, dynamiczny montaż (Hype)' },
                    { id: 'dynamic_build', title: 'Stopniowy Build-Up', desc: 'Od wolnych ujęć do szybkiego finału' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPacing(p.id as BeatSyncPacing)}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        pacing === p.id
                          ? 'bg-[#C5A059]/20 border-[#C5A059] text-white shadow-md'
                          : 'bg-[#18181F] border-[#2A2A36] text-[#AAA69D] hover:border-white/20'
                      }`}
                    >
                      <span className="text-xs font-bold block">{p.title}</span>
                      <span className="text-[10px] text-[#888] mt-1 leading-tight">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#C5A059] uppercase tracking-wider block mb-2">
                  4. Tryb zastosowania
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'align_existing', title: 'Dopasuj obecne klipy', desc: 'Przesuwa cięcia obecnych ujęć do rytmu' },
                    { id: 'create_new', title: 'Stwórz nowy teledysk', desc: 'Montuje klipy z biblioteki do muzyki' },
                    { id: 'markers_only', title: 'Tylko znaczniki', desc: 'Dodaje prowadnice bitu na osi' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setApplyMode(m.id as any)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        applyMode === m.id
                          ? 'bg-[#2A2315] border-[#FDE047] text-white shadow-md'
                          : 'bg-[#18181F] border-[#2A2A36] text-[#AAA69D] hover:border-white/20'
                      }`}
                    >
                      <span className="text-xs font-bold block">{m.title}</span>
                      <span className="text-[10px] text-[#888] mt-0.5 block">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[#23232C] bg-[#0E0E12] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-[#AAA69D] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Anuluj
          </button>
          
          <button
            onClick={handleApply}
            disabled={!analysisResult}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#C5A059] to-[#FDE047] text-black font-extrabold text-xs flex items-center gap-2 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-black" />
            <span>Zastosuj Beat-Sync do Projektu</span>
          </button>
        </div>

      </div>
    </div>
  );
}
