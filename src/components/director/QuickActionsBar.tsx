import React, { useState } from 'react';
import { 
  Sparkles, 
  Star, 
  Zap, 
  Share2, 
  RotateCw, 
  Loader2, 
  CheckCircle2, 
  X,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  Music,
  Activity,
  Type
} from 'lucide-react';
import { ProjectState, MediaClip } from '../../types/project';
import { analyzeWholeLibrary } from '../../core/director/videoAnalysisEngine';
import { batchGenerateProxies } from '../../core/director/proxyEngine';
import { autoFixProjectHealthIssues, runRealRuntimeHealthCheck } from '../../core/director/projectHealthEngine';

interface QuickActionsBarProps {
  project: ProjectState;
  onUpdateProject: (updated: ProjectState) => void;
  onOpenDirectorModal: () => void;
  onNavigateToExport: () => void;
  onSelectRatingFilter?: (rating: string) => void;
  onOpenChronologicalModal?: () => void;
  onOpenProjectNarrativeModal?: () => void;
  onMagicProduce?: () => void;
  onOpenTemplateGallery?: () => void;
  onOpenQuickMerge?: () => void;
  onOpenTitleCardModal?: () => void;
  onOpenBeatSyncModal?: () => void;
  onOpenAutoCaptionsModal?: () => void;
}

export function QuickActionsBar({
  project,
  onUpdateProject,
  onOpenDirectorModal,
  onNavigateToExport,
  onSelectRatingFilter,
  onOpenChronologicalModal,
  onOpenProjectNarrativeModal,
  onMagicProduce,
  onOpenTemplateGallery,
  onOpenQuickMerge,
  onOpenTitleCardModal,
  onOpenBeatSyncModal,
  onOpenAutoCaptionsModal
}: QuickActionsBarProps) {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeActionName, setActiveActionName] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [feedbackResult, setFeedbackResult] = useState<{ title: string; message: string; type: 'success' | 'info' } | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // 1. Analyze Project
  const handleAnalyzeProject = async () => {
    if (project.mediaLibrary.length === 0) {
      setFeedbackResult({
        title: 'Biblioteka jest pusta',
        message: 'Dodaj ujęcia do biblioteki przed uruchomieniem analizy.',
        type: 'info'
      });
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setActiveActionName('Analiza Projektu (Klatki & Jakość)');
    setProgressPercent(0);

    try {
      const analysisMap = await analyzeWholeLibrary(
        project.mediaLibrary,
        controller.signal,
        (p, msg) => {
          setProgressPercent(p);
          setStatusMessage(msg);
        }
      );

      const updatedLibrary = project.mediaLibrary.map(clip => {
        const a = analysisMap.get(clip.id);
        return a ? { ...clip, analysis: a } : clip;
      });

      onUpdateProject({
        ...project,
        mediaLibrary: updatedLibrary,
        updatedAt: new Date().toISOString()
      });

      const bestCount = Array.from(analysisMap.values()).filter(a => a.ratingCategory === 'BEST').length;
      const problemCount = Array.from(analysisMap.values()).filter(a => a.ratingCategory === 'PROBLEM').length;

      setFeedbackResult({
        title: 'Analiza ukończona pomyślnie',
        message: `Przeanalizowano ${analysisMap.size} klipów. Wykryto ${bestCount} ujęć oznaczonych jako BEST oraz ${problemCount} z ostrzeżeniami technicznymi.`,
        type: 'success'
      });
    } catch (e: any) {
      if (e?.message !== 'Operacja została przerwana') {
        setFeedbackResult({
          title: 'Wystąpił problem podczas analizy',
          message: e?.message || 'Nie udało się przeanalizować klipów.',
          type: 'info'
        });
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  // 2. Find Best Moments
  const handleFindBestMoments = async () => {
    // If clips aren't analyzed yet, run quick analyze first
    const hasAnalyses = project.mediaLibrary.some(c => c.analysis);
    if (!hasAnalyses) {
      await handleAnalyzeProject();
    }
    if (onSelectRatingFilter) {
      onSelectRatingFilter('BEST');
    }
    setFeedbackResult({
      title: 'Włączono filtr: Najlepsze Ujęcia (BEST)',
      message: 'Wyświetlam ujęcia o najwyższej ostrości, stabilności i potencjale montażowym.',
      type: 'success'
    });
  };

  // 4. Optimize Project (Proxy & Fixes)
  const handleOptimizeProject = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setActiveActionName('Optymalizacja Projektu (Generowanie Proxy 540p)');
    setProgressPercent(0);

    try {
      // 1. Auto fix timeline defects
      const { updatedProject, fixedCount } = autoFixProjectHealthIssues(project);

      // 2. Batch generate proxies for all video clips
      const { successCount } = await batchGenerateProxies(
        updatedProject.mediaLibrary,
        controller.signal,
        (p, msg) => {
          setProgressPercent(p);
          setStatusMessage(msg);
        }
      );

      // Enable proxy mode in settings
      const finalizedProject: ProjectState = {
        ...updatedProject,
        settings: {
          ...updatedProject.settings,
          useProxyMode: true
        },
        updatedAt: new Date().toISOString()
      };

      onUpdateProject(finalizedProject);

      setFeedbackResult({
        title: 'Projekt zoptymalizowany',
        message: `Wygenerowano ${successCount} lekkich proxy 540p dla płynnego podglądu. Naprawiono ${fixedCount} drobnych usterek osi czasu. Oryginały zostaną zachowane do finalnego eksportu.`,
        type: 'success'
      });
    } catch (e: any) {
      if (e?.message !== 'Generowanie proxy zostało przerwane') {
        alert('Błąd optymalizacji: ' + e?.message);
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  // 5. Prepare for Export
  const handlePrepareForExport = async () => {
    setIsRunning(true);
    setActiveActionName('Przygotowanie do Eksportu (Audyt Pre-Flight)');
    setProgressPercent(30);
    setStatusMessage('Sprawdzanie kodeków, nośnika pamięci i ciągłości osi czasu...');

    try {
      const report = await runRealRuntimeHealthCheck(project);
      setProgressPercent(100);
      setStatusMessage('Audyt zakończony.');

      if (report.canExport) {
        onNavigateToExport();
      } else {
        setFeedbackResult({
          title: 'Wymagana korekta przed eksportem',
          message: `Znaleziono blokady: ${report.exportReadiness.blockers.join(', ')}. Użyj opcji "Napraw automatycznie" w panelu Project Health.`,
          type: 'info'
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsRunning(false);
  };

  return (
    <>
      {/* Action buttons bar */}
      <div className="flex items-center gap-3 p-2 bg-zinc-950/90 border border-zinc-800/80 rounded-2xl shadow-xl text-xs backdrop-blur-xl overflow-x-auto custom-scrollbar touch-pan-x w-full max-w-full">
        {/* 0. MASTER PRODUCE BUTTON */}
        <button
          onClick={onMagicProduce || onOpenChronologicalModal}
          disabled={isRunning}
          className="group relative flex items-center gap-3 px-5 py-2.5 rounded-xl btn-primary text-white cursor-pointer transition-all font-bold disabled:opacity-50 shadow-lg shadow-indigo-600/30 shrink-0 overflow-hidden font-sans"
          title="PRODUKCJA MISTRZOWSKA: Automatyczny montaż, kolejność i przejścia w 1 kliknięciu"
        >
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
          <span className="tracking-tight uppercase">PRODUKCJA MISTRZOWSKA (1-Klik)</span>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-xs">
            <Zap className="w-4 h-4 fill-white" />
          </div>
        </button>

        {/* Szybkie Scalanie Filmów (Quick Merge) */}
        {onOpenQuickMerge && (
          <button
            onClick={onOpenQuickMerge}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white cursor-pointer transition-all font-semibold font-sans shrink-0"
            title="Szybkie scalanie wybranych klipów z czołówką i napisami końcowymi"
          >
            <Zap className="w-5 h-5 text-indigo-400" />
            <span>Szybkie Scalanie</span>
          </button>
        )}

        {/* Beat-Sync (Rytm Muzyki) */}
        {onOpenBeatSyncModal && (
          <button
            onClick={onOpenBeatSyncModal}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-500/40 text-indigo-200 hover:text-white cursor-pointer transition-all font-bold font-sans shrink-0 shadow-sm"
            title="Wykryj bity w muzyce i automatycznie dopasuj cięcia ujęć do tempa BPM"
          >
            <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span>Beat-Sync (Rytm Muzyki)</span>
          </button>
        )}

        {/* Auto-Captions & Napisy Dynamiczne */}
        {onOpenAutoCaptionsModal && (
          <button
            onClick={onOpenAutoCaptionsModal}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/40 text-purple-200 hover:text-white cursor-pointer transition-all font-semibold font-sans shrink-0"
            title="Automatyczne generowanie napisów, transkrypcja mowy na żywo i napisy viral karaoke"
          >
            <Type className="w-5 h-5 text-purple-400" />
            <span>Napisy & Auto-Captions</span>
          </button>
        )}

        {/* Karty Intro & Outro */}
        {onOpenTitleCardModal && (
          <button
            onClick={onOpenTitleCardModal}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white cursor-pointer transition-all font-semibold font-sans shrink-0"
            title="Dodaj lub edytuj kartę czołówki (Intro) lub napisów końcowych (Outro)"
          >
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Karty Intro / Outro</span>
          </button>
        )}

        {/* 1. Quality Analysis (Technical) */}
        <button
          onClick={handleAnalyzeProject}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white cursor-pointer transition-all font-semibold font-sans disabled:opacity-50 shrink-0"
          title="Audyt techniczny: ostrość, stabilność i oświetlenie ujęć"
        >
          <RotateCw className={`w-5 h-5 ${isRunning && activeActionName.includes('Analiza') ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Analiza Jakości</span>
        </button>

        {/* Reżyser & Narracja */}
        {onOpenProjectNarrativeModal && (
          <button
            onClick={onOpenProjectNarrativeModal}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white cursor-pointer transition-all font-semibold font-sans shrink-0"
            title="Generuj scenariusz, akty filmu i plansze rozdziałów"
          >
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            <span>Scenariusz & Akty</span>
          </button>
        )}

        {/* 2. Proxy Optimization (Performance) */}
        <button
          onClick={handleOptimizeProject}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-cyan-300 cursor-pointer transition-all font-semibold font-sans disabled:opacity-50 shrink-0"
          title="Generuj lekkie proxy 540p dla płynnego montażu bez zacięć"
        >
          <Zap className="w-5 h-5 text-cyan-400" />
          <span>Optymalizacja Proxy</span>
        </button>

        {/* 3. Template Gallery (Firebase Cloud) */}
        {onOpenTemplateGallery && (
          <button
            onClick={onOpenTemplateGallery}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-indigo-300 hover:text-white cursor-pointer transition-all font-semibold font-sans shadow-sm shrink-0"
            title="Otwórz Galerię Szablonów (Zapisuj i wczytuj struktury z Firebase)"
          >
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            <span>Szablony Montażowe</span>
          </button>
        )}

        {/* Spacer for right-alignment */}
        <div className="flex-1" />

        {/* 3. Export Action */}
        <button
          onClick={handlePrepareForExport}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-all font-bold font-sans disabled:opacity-50 shadow-md shadow-emerald-600/30 shrink-0"
          title="Przejdź do renderowania i zapisu filmu"
        >
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span>Finalny Eksport</span>
        </button>
      </div>

      {/* Real-time non-blocking progress dialog */}
      {isRunning && (
        <div className="fixed bottom-6 right-6 z-50 w-96 p-4 rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              {activeActionName}
            </span>
            <span className="text-xs font-mono font-bold text-indigo-400">{progressPercent}%</span>
          </div>

          <p className="text-[11px] text-zinc-400 mb-3 truncate">{statusMessage}</p>

          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium cursor-pointer border border-zinc-700"
            >
              Anuluj operację
            </button>
          </div>
        </div>
      )}

      {/* Feedback modal / notification */}
      {feedbackResult && (
        <div className="fixed bottom-6 right-6 z-50 w-96 p-4 rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl animate-slideUp text-xs backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-white">
              {feedbackResult.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <span>{feedbackResult.title}</span>
            </div>
            <button
              onClick={() => setFeedbackResult(null)}
              className="p-1 text-zinc-400 hover:text-white rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-zinc-300 mt-1.5 leading-relaxed">
            {feedbackResult.message}
          </p>
        </div>
      )}
    </>
  );
}
