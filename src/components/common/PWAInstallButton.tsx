import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, ExternalLink, CheckCircle2, Monitor, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string; isCompact?: boolean }> = ({ className, isCompact = false }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  // If already running as installed standalone PWA app
  if (isInstalled) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-mono bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        {!isCompact && <span>Zainstalowano PWA</span>}
      </span>
    );
  }

  // If inside iframe (AI Studio preview mode)
  if (isInIframe) {
    return (
      <a
        href={window.location.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full flex items-center ${isCompact ? 'justify-center p-2' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs font-medium text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer ${className}`}
        title="Otwórz aplikację w nowym oknie, aby zainstalować ją na pulpicie lub smartfonie"
      >
        <ExternalLink className="w-4 h-4 text-indigo-400 shrink-0" />
        {!isCompact && <span className="truncate">Zainstaluj Apkę</span>}
      </a>
    );
  }

  // Native prompt available
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`w-full flex items-center ${isCompact ? 'justify-center p-2' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs font-semibold btn-primary cursor-pointer shadow-md shadow-indigo-600/20 ${className}`}
        title="Zainstaluj aplikację na komputerze lub smartfonie"
      >
        <Download className="w-4 h-4 shrink-0 stroke-[2.5]" />
        {!isCompact && <span className="truncate">Zainstaluj Apkę</span>}
      </button>
    );
  }

  // Default fallback (Safari iOS / instructions modal)
  return (
    <>
      <button
        onClick={() => setShowGuideModal(true)}
        className={`w-full flex items-center ${isCompact ? 'justify-center p-2' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs font-medium text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer ${className}`}
        title="Pokaż instrukcję instalacji PWA"
      >
        <Smartphone className="w-4 h-4 text-indigo-400 shrink-0" />
        {!isCompact && <span className="truncate">Instaluj PWA</span>}
      </button>

      {/* Modern PWA Installation Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-7 shadow-2xl space-y-5 relative overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Instalacja Aplikacji PWA</h3>
                  <p className="text-xs text-zinc-400">
                    Działa offline na komputerze i telefonie z natywną wydajnością
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowGuideModal(false)} 
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction cards */}
            <div className="space-y-3 text-xs">
              {/* Desktop */}
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-indigo-400">
                  <Monitor className="w-4 h-4" />
                  <span>Komputer (Chrome / Edge / Safari)</span>
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11.5px]">
                  Kliknij ikonę <strong className="text-white">„Zainstaluj aplikację”</strong> na pasku adresu przeglądarki po prawej stronie lub wybierz menu z trzema kropkami i kliknij <strong className="text-white">„Zainstaluj Kapi-Studio”</strong>.
                </p>
              </div>

              {/* Android */}
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-emerald-400">
                  <Smartphone className="w-4 h-4" />
                  <span>Android (Chrome / Brave / Firefox)</span>
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11.5px]">
                  Dotknij menu (⋮) w prawym górnym rogu Chrome i wybierz <strong className="text-white">„Zainstaluj aplikację”</strong> lub <strong className="text-white">„Dodaj do ekranu głównego”</strong>.
                </p>
              </div>

              {/* iOS */}
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-purple-400">
                  <Sparkles className="w-4 h-4" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11.5px]">
                  Dotknij przycisku <strong className="text-white">Udostępnij</strong> (ikona ze strzałką w górę), przewiń menu w dół i wybierz <strong className="text-white">„Do ekranu początkowego”</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 rounded-xl btn-primary text-xs font-semibold text-center flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Otwórz w nowym oknie</span>
              </a>

              <button
                onClick={() => setShowGuideModal(false)}
                className="py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Zamknij
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
