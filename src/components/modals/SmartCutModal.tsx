import React, { useState } from 'react';
import { 
  Scissors, 
  Sparkles, 
  VolumeX, 
  Volume2, 
  Play, 
  Check, 
  AlertCircle, 
  Loader2, 
  Sliders, 
  Zap, 
  X, 
  Clock,
  Layers
} from 'lucide-react';
import type { ProjectState, TimelineItem, MediaClip } from '../../types/project';
import { SmartCutAnalyzer, type SmartCutResult } from '../../core/audio/smartCutAnalyzer';
import { SafeAudioDecoder } from '../../core/audio/audioDecoder';
import { resolveClipMediaUrl } from '../../core/media/mediaResolver';
import { useAuth } from '../../lib/firebase/AuthContext';
import { useStudioToast } from '../common/ToastContext';

interface SmartCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onUpdateTimelineItems: (items: TimelineItem[]) => void;
}

export function SmartCutModal({
  isOpen,
  onClose,
  project,
  onUpdateTimelineItems
}: SmartCutModalProps) {
  const { accessToken } = useAuth();
  const toast = useStudioToast();

  const [thresholdDb, setThresholdDb] = useState<number>(-38);
  const [minDurationSec, setMinDurationSec] = useState<number>(0.45);
  const [padBeforeSec, setPadBeforeSec] = useState<number>(0.08);
  const [padAfterSec, setPadAfterSec] = useState<number>(0.12);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<SmartCutResult | null>(null);
  const [targetClipId, setTargetClipId] = useState<string>(project.timelineItems[0]?.clipId || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunAnalysis = async () => {
    if (project.timelineItems.length === 0) {
      setError('Oś czasu jest pusta. Dodaj klipy przed wykonaniem Smart Cut.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);

    try {
      // Find selected clip or first timeline item
      const item = project.timelineItems.find(i => i.clipId === targetClipId) || project.timelineItems[0];
      const clip = project.mediaLibrary.find(c => c.id === item.clipId);

      if (!clip) {
        throw new Error('Nie znaleziono danych wybranego klipu w projekcie.');
      }

      const mediaUrl = await resolveClipMediaUrl(clip, false);
      if (!mediaUrl) {
        throw new Error('Nie udało się rozwiązać adresu pliku audio/wideo.');
      }

      // Fetch and decode audio buffer
      const res = await fetch(mediaUrl);
      if (!res.ok) throw new Error(`Błąd pobierania pliku: ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await SafeAudioDecoder.decodeTo48kStereo(audioCtx, arrayBuffer);

      if (!decodedBuffer) {
        throw new Error('Nie udało się zdekodować ścieżki dźwiękowej tego pliku.');
      }

      // Perform RMS/dB analysis
      const result = SmartCutAnalyzer.analyzeAudioBuffer(decodedBuffer, {
        silenceThresholdDb: thresholdDb,
        minSilenceDurationSec: minDurationSec,
        padBeforeSec,
        padAfterSec
      });

      setAnalysisResult(result);
      toast.showSuccess(`Wykryto ${result.silenceRegions.length} fragmentów ciszy (${result.totalSilenceDuration.toFixed(1)}s).`);

      try {
        await audioCtx.close();
      } catch {}
    } catch (err: any) {
      console.error('[SmartCutModal] Analysis error:', err);
      setError(err?.message || 'Wystąpił błąd podczas analizy fali dźwiękowej.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySmartCut = () => {
    if (!analysisResult || analysisResult.silenceRegions.length === 0) {
      toast.showInfo('Brak wykrytych fragmentów ciszy do wycięcia.');
      return;
    }

    const item = project.timelineItems.find(i => i.clipId === targetClipId) || project.timelineItems[0];
    if (!item) return;

    // Generate new trimmed clips with ripple timeline alignment
    const newItems = SmartCutAnalyzer.generateRippleTrimmedItems(item, analysisResult);

    // Replace the item with trimmed speech parts
    const currentTimeline = [...project.timelineItems];
    const itemIdx = currentTimeline.findIndex(i => i.id === item.id);

    if (itemIdx !== -1) {
      currentTimeline.splice(itemIdx, 1, ...newItems);
      // Re-align subsequent timeline starts
      let cursor = 0;
      for (let i = 0; i < currentTimeline.length; i++) {
        currentTimeline[i] = {
          ...currentTimeline[i],
          timelineStart: cursor
        };
        cursor += currentTimeline[i].duration;
      }
      onUpdateTimelineItems(currentTimeline);
      toast.showSuccess(`✨ Zastosowano Smart Cut! Usunięto ${analysisResult.totalSilenceDuration.toFixed(1)}s ciszy.`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/40 flex items-center justify-center">
              <Scissors className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                Smart Cut • Automatyczne Usuwanie Ciszy
              </h3>
              <p className="text-[11px] text-zinc-400">
                Wykrywanie pauz w mowie (RMS/Peak dB) i montaż Ripple Trim
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[65vh]">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Clip Selector */}
          <div>
            <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
              Wybierz klip do analizy:
            </label>
            <select
              value={targetClipId}
              onChange={(e) => setTargetClipId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {project.timelineItems.map((item, idx) => {
                const clip = project.mediaLibrary.find(c => c.id === item.clipId);
                return (
                  <option key={item.id} value={item.clipId}>
                    #{idx + 1} {clip?.name || item.name || 'Klip wideo'} ({item.duration.toFixed(1)}s)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Parameters sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-zinc-900/50 p-4 rounded-xl border border-white/[0.06]">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1">
                <span>Próg ciszy (dB):</span>
                <span className="font-bold text-indigo-400">{thresholdDb} dB</span>
              </div>
              <input
                type="range"
                min={-60}
                max={-20}
                step={1}
                value={thresholdDb}
                onChange={(e) => setThresholdDb(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500"
              />
              <span className="text-[10px] text-zinc-500 block">Domyślnie -38 dB</span>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1">
                <span>Min. czas pauzy:</span>
                <span className="font-bold text-indigo-400">{minDurationSec.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={minDurationSec}
                onChange={(e) => setMinDurationSec(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <span className="text-[10px] text-zinc-500 block">Domyślnie 0.45s</span>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1">
                <span>Margines przed mową:</span>
                <span className="font-bold text-indigo-400">+{Math.round(padBeforeSec * 1000)}ms</span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.3}
                step={0.02}
                value={padBeforeSec}
                onChange={(e) => setPadBeforeSec(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1">
                <span>Margines po mowie:</span>
                <span className="font-bold text-indigo-400">+{Math.round(padAfterSec * 1000)}ms</span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.3}
                step={0.02}
                value={padAfterSec}
                onChange={(e) => setPadAfterSec(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* Analysis Results Display */}
          {analysisResult && (
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Wyniki analizy Smart Cut:
                </span>
                <span className="text-xs font-mono font-bold text-indigo-300">
                  {analysisResult.silencePercentage}% ciszy
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-zinc-900/80 p-2 rounded-lg border border-white/[0.06]">
                  <span className="text-zinc-500 block text-[10px]">Wykryte pauzy</span>
                  <strong className="text-white text-sm">{analysisResult.silenceRegions.length}</strong>
                </div>
                <div className="bg-zinc-900/80 p-2 rounded-lg border border-white/[0.06]">
                  <span className="text-zinc-500 block text-[10px]">Czas do wycięcia</span>
                  <strong className="text-amber-400 text-sm">{analysisResult.totalSilenceDuration.toFixed(1)}s</strong>
                </div>
                <div className="bg-zinc-900/80 p-2 rounded-lg border border-white/[0.06]">
                  <span className="text-zinc-500 block text-[10px]">Czysta mowa</span>
                  <strong className="text-emerald-400 text-sm">{analysisResult.totalSpeechDuration.toFixed(1)}s</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-white/[0.08] bg-zinc-900/60 flex items-center justify-between">
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
          >
            {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{isAnalyzing ? 'Analizowanie...' : 'Skanuj ciszę (RMS)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-zinc-400 hover:text-white rounded-xl cursor-pointer"
            >
              Anuluj
            </button>

            <button
              onClick={handleApplySmartCut}
              disabled={!analysisResult || analysisResult.silenceRegions.length === 0}
              className="btn-primary px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Zastosuj cięcia Ripple ({analysisResult?.silenceRegions.length || 0})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
