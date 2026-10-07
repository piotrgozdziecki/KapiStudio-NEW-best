import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Download, 
  X, 
  ExternalLink, 
  CheckCircle2, 
  Monitor, 
  Sparkles, 
  Copy, 
  Check, 
  Share2, 
  ArrowRight,
  ShieldCheck,
  Zap,
  HardDrive
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  isCompact?: boolean;
  variant?: 'header' | 'sidebar' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '', 
  isCompact = false,
  variant = 'sidebar'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleOpenDirect = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const handleMainAction = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  // If already running as installed standalone PWA app
  if (isInstalled) {
    if (variant === 'header') {
      return (
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-medium select-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-mono">PWA Zainstalowane</span>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 select-none ${className}`}>
        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
        {!isCompact && <span className="truncate">Aplikacja PWA aktywna</span>}
      </div>
    );
  }

  // Header variant
  if (variant === 'header') {
    return (
      <>
        <button
          onClick={handleMainAction}
          className={`flex items-center gap-2 px-3 py-1.5 bg-[#27272a] hover:bg-[#323238] border border-cyan-500/30 hover:border-cyan-500/60 rounded-lg text-zinc-200 hover:text-white text-xs font-semibold font-sans transition-all cursor-pointer shadow-sm group ${className}`}
          title="Zainstaluj aplikację na telefonie (Xiaomi / Android) lub komputerze"
        >
          <Download className="w-4 h-4 text-[#00e5cc] group-hover:scale-110 transition-transform shrink-0" />
          <span className="hidden sm:inline">Pobierz / Zainstaluj</span>
          <span className="sm:hidden">Instaluj</span>
        </button>

        {showGuideModal && (
          <PWAInstallModal 
            onClose={() => setShowGuideModal(false)}
            onCopyLink={handleCopyLink}
            copiedLink={copiedLink}
            onOpenDirect={handleOpenDirect}
            isInstallable={isInstallable}
            onInstall={install}
            isInIframe={isInIframe}
            isIOS={isIOS}
          />
        )}
      </>
    );
  }

  // Sidebar or General variant
  return (
    <>
      <button
        onClick={handleMainAction}
        className={`w-full flex items-center ${isCompact ? 'justify-center p-2' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs font-medium text-zinc-300 bg-[#27272a]/80 hover:bg-[#323238] border border-[#3f3f46]/50 hover:border-cyan-500/40 transition-all cursor-pointer group ${className}`}
        title="Zainstaluj Kapi-Studio jako natywną aplikację PWA (Poco F6 / Android / Windows / Mac)"
      >
        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[#00e5cc] group-hover:bg-cyan-500/20 transition-colors shrink-0">
          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        </div>
        {!isCompact && (
          <div className="text-left flex-1 min-w-0">
            <span className="block font-semibold text-zinc-200 group-hover:text-white truncate">
              {isInstallable ? 'Zainstaluj Aplikację' : 'Pobierz / Instaluj PWA'}
            </span>
            <span className="block text-[10px] text-zinc-400 truncate">
              Offline & Akceleracja GPU
            </span>
          </div>
        )}
      </button>

      {showGuideModal && (
        <PWAInstallModal 
          onClose={() => setShowGuideModal(false)}
          onCopyLink={handleCopyLink}
          copiedLink={copiedLink}
          onOpenDirect={handleOpenDirect}
          isInstallable={isInstallable}
          onInstall={install}
          isInIframe={isInIframe}
          isIOS={isIOS}
        />
      )}
    </>
  );
};

interface PWAInstallModalProps {
  onClose: () => void;
  onCopyLink: () => void;
  copiedLink: boolean;
  onOpenDirect: () => void;
  isInstallable: boolean;
  onInstall: () => Promise<boolean>;
  isInIframe: boolean;
  isIOS: boolean;
}

function PWAInstallModal({
  onClose,
  onCopyLink,
  copiedLink,
  onOpenDirect,
  isInstallable,
  onInstall,
  isInIframe,
  isIOS
}: PWAInstallModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-fadeIn select-none">
      <div className="w-full max-w-xl rounded-2xl bg-[#121318] border border-[#27272a] p-6 sm:p-7 shadow-2xl space-y-6 relative overflow-hidden text-zinc-200">
        
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-start border-b border-[#27272a] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 flex items-center justify-center text-[#00e5cc] shadow-inner shrink-0">
              <HardDrive className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Instalacja Kapi-Studio (PWA)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#00e5cc]/10 text-[#00e5cc] border border-[#00e5cc]/30">
                  Wersja 4K
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Natywna wydajność, praca offline, pełny ekran i brak zbędnych pasków przeglądarki.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-[#27272a] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action button if installable */}
        {isInstallable && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 border border-cyan-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white">Automatyczna instalacja 1-kliknięciem</p>
              <p className="text-[11px] text-zinc-300">Twoja przeglądarka obsługuje natywny instalator aplikacji.</p>
            </div>
            <button
              onClick={onInstall}
              className="w-full sm:w-auto px-4 py-2 bg-[#00e5cc] hover:bg-[#14f3db] text-black font-bold text-xs rounded-xl shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Zainstaluj teraz</span>
            </button>
          </div>
        )}

        {/* Instructions Matrix */}
        <div className="space-y-3 text-xs">
          
          {/* Xiaomi Poco F6 / Android */}
          <div className="p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <Smartphone className="w-4 h-4" />
                <span>Xiaomi Poco F6 / Smartfony Android (Chrome / Brave)</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">120Hz / AMOLED Ready</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11.5px]">
              1. Otwórz link aplikacji w <strong className="text-white">Google Chrome</strong>.<br />
              2. Kliknij menu <strong className="text-white">trzech kropek (⋮)</strong> w prawym górnym rogu.<br />
              3. Wybierz <strong className="text-[#00e5cc]">„Zainstaluj aplikację”</strong> lub <strong className="text-white">„Dodaj do ekranu głównego”</strong>.<br />
              4. Aplikacja pojawi się w szufladzie aplikacji jako pełnoprawne studio wideo.
            </p>
          </div>

          {/* Desktop */}
          <div className="p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-cyan-400">
                <Monitor className="w-4 h-4" />
                <span>Komputer PC / Mac (Chrome, Edge, Brave, Opera)</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">GPU WebCodecs</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11.5px]">
              Kliknij ikonę <strong className="text-white">instalacji (komputer ze strzałką)</strong> po prawej stronie paska adresu URL lub wybierz w menu Chrome <strong className="text-[#00e5cc]">„Zapisz i udostępnij” → „Zainstaluj stronę jako aplikację”</strong>.
            </p>
          </div>

          {/* iOS Safari */}
          <div className="p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-purple-400">
                <Sparkles className="w-4 h-4" />
                <span>iPhone / iPad (Apple Safari)</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">iOS Standalone</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11.5px]">
              Dotknij przycisku <strong className="text-white">Udostępnij</strong> (kwadrat ze strzałką w górę), przewiń w dół i wybierz <strong className="text-[#00e5cc]">„Do ekranu początkowego”</strong>.
            </p>
          </div>
        </div>

        {/* Direct Link & Open External actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#27272a]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onCopyLink}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-[#27272a] hover:bg-[#323238] border border-[#3f3f46]/60 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Skopiowano link!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-zinc-400" />
                  <span>Kopiuj link aplikacji</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenDirect}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-[#00e5cc]/15 hover:bg-[#00e5cc]/25 border border-[#00e5cc]/40 text-[#00e5cc] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              title="Otwórz aplikację w pełnym oknie przeglądarki"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Otwórz w nowym oknie</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#27272a] hover:bg-[#323238] text-zinc-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
}
