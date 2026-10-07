import React, { useState, useEffect, useRef } from 'react';
import { 
  Type, 
  Sparkles, 
  Clock, 
  Palette, 
  Layout, 
  Check, 
  X, 
  Eye, 
  Film, 
  Sliders,
  Play
} from 'lucide-react';
import type { TitleCard } from '../../types/project';
import { FrameCompositor } from '../../core/render/FrameCompositor';

interface TitleCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCard?: TitleCard;
  cardType?: 'intro' | 'outro' | 'scene';
  onSave: (card: TitleCard) => void;
  projectTitle?: string;
}

export const TITLE_CARD_PRESETS: {
  id: TitleCard['style'];
  name: string;
  description: string;
  badge: string;
}[] = [
  {
    id: 'cinematic',
    name: 'Kinowa Czołówka',
    description: 'Klasyczny, panoramiczny styl filmowy z podwójną obwódką i szlachetną typografią',
    badge: 'Standard Filmowy'
  },
  {
    id: 'modern_bold',
    name: 'Modern Commercial',
    description: 'Mocna, nowoczesna typografia z dynamicznym akcentem graficznym',
    badge: 'Social & Promo'
  },
  {
    id: 'minimalist',
    name: 'Szwajcarski Minimalizm',
    description: 'Czysta, oszczędna kompozycja, subtelna elegancja i duża przestrzeń oddechu',
    badge: 'Dokument & Art'
  },
  {
    id: 'studio_slate',
    name: 'Klaps Produkcyjny',
    description: 'Profesjonalna plansza slate z numerem sceny, ujęcia, klatkarzem i profilem barwnym',
    badge: 'Studio Record'
  },
  {
    id: 'cyber_neon',
    name: 'Cyber & Dynamic',
    description: 'Neonowa poświata, kodowanie techniczne i nowoczesny klimat gaming / tech',
    badge: 'Dynamic & Tech'
  },
  {
    id: 'credits',
    name: 'Napisy Końcowe / Outro',
    description: 'Eleganckie podsumowanie, lista twórców, podziękowania i dedykacja',
    badge: 'Finał & Credits'
  },
  {
    id: 'classic',
    name: 'Klasyczny Serif',
    description: 'Ponadczasowa szeryfowa typografia dla filmów historycznych i dramatycznych',
    badge: 'Klasyka'
  }
];

export function TitleCardModal({
  isOpen,
  onClose,
  initialCard,
  cardType = 'intro',
  onSave,
  projectTitle = 'PROJEKT WIDEO'
}: TitleCardModalProps) {
  const [enabled, setEnabled] = useState(initialCard ? initialCard.enabled : true);
  const [text, setText] = useState(
    initialCard?.text || 
    (cardType === 'intro' ? (projectTitle || 'TYTUŁ FILMU') : cardType === 'outro' ? 'THE END' : 'ROZDZIAŁ I')
  );
  const [subtitle, setSubtitle] = useState(
    initialCard?.subtitle || 
    (cardType === 'intro' ? 'Reżyseria & Montaż' : cardType === 'outro' ? 'Dziękujemy za obejrzenie • 2026' : 'Wprowadzenie')
  );
  const [duration, setDuration] = useState(initialCard?.duration || (cardType === 'outro' ? 4.5 : 3.5));
  const [style, setStyle] = useState<TitleCard['style']>(initialCard?.style || (cardType === 'outro' ? 'credits' : 'cinematic'));
  const [backgroundColor, setBackgroundColor] = useState<string>(initialCard?.backgroundColor || 'gradient');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw live preview canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewCard: TitleCard = {
      enabled,
      text: text || ' ',
      subtitle: subtitle || '',
      duration,
      style,
      backgroundColor,
      cardType
    };

    FrameCompositor.drawTitleCard(ctx, canvas.width, canvas.height, previewCard);
  }, [isOpen, enabled, text, subtitle, duration, style, backgroundColor, cardType]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      enabled,
      text: text.trim() || (cardType === 'outro' ? 'THE END' : 'PROLOG'),
      subtitle: subtitle.trim(),
      duration: Math.max(1, Math.min(15, duration)),
      style,
      backgroundColor,
      cardType
    });
    onClose();
  };

  const getModalTitle = () => {
    if (cardType === 'intro') return 'Karta Początkowa (Intro / Czołówka)';
    if (cardType === 'outro') return 'Karta Końcowa (Outro / Napisy)';
    return 'Plansza Tytułowa Rozdziału';
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-[#0e111a] border border-[#23293b] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#23293b] flex items-center justify-between bg-[#131724]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide font-cinematic">
                {getModalTitle()}
              </h2>
              <p className="text-xs text-slate-400">
                Profesjonalna plansza graficzna renderowana przed lub po sekwencji wideo
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Form Controls */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* Enable switch */}
            <div className="flex items-center justify-between p-3.5 bg-[#141825] rounded-xl border border-white/5">
              <div>
                <span className="text-sm font-semibold text-white">Aktywuj kartę</span>
                <p className="text-xs text-slate-400">Wyświetlaj tę planszę w finalnym filmie i podglądzie</p>
              </div>
              <input 
                type="checkbox" 
                checked={enabled} 
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            {/* Title input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Główny Tytuł / Hasło
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={cardType === 'outro' ? 'THE END' : 'TYTUŁ FILMU'}
                className="w-full bg-[#161a29] border border-[#2a324b] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Subtitle input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Podtytuł / Twórcy / Dedykacja
              </label>
              <textarea
                rows={2}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Podtytuł, data lub nazwiska twórców..."
                className="w-full bg-[#161a29] border border-[#2a324b] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition resize-none"
              />
            </div>

            {/* Duration slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Czas wyświetlania (sekundy)
                </label>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {duration.toFixed(1)}s
                </span>
              </div>
              <input 
                type="range" 
                min="1.0" 
                max="10.0" 
                step="0.5"
                value={duration} 
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1.0s (Szybkie)</span>
                <span>3.5s (Zalecane)</span>
                <span>10.0s (Długie)</span>
              </div>
            </div>

            {/* Style Presets Grid */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Wybierz styl graficzny
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TITLE_CARD_PRESETS.map((p) => {
                  const isSelected = style === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setStyle(p.id)}
                      className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/5' 
                          : 'bg-[#141825] border-white/5 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{p.name}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5 font-mono">
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background Color preset */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Tło planszy
              </label>
              <div className="flex items-center gap-2">
                {[
                  { id: 'gradient', label: 'Gradient Kinowy' },
                  { id: '#000000', label: 'Czerń (OLED)' },
                  { id: '#0B0F19', label: 'Ciemny Granat' },
                  { id: '#18181B', label: 'Grafit' },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundColor(bg.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      backgroundColor === bg.id 
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300' 
                        : 'border-white/10 bg-[#141825] text-slate-400 hover:text-white'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Live Preview Screen */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                Podgląd na żywo (16:9)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Canvas 640x360
              </span>
            </div>

            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-[#2a324b] shadow-2xl flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                className="w-full h-full object-contain"
              />
              {!enabled && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center text-center p-4">
                  <span className="text-xs text-slate-400 font-medium">
                    Karta jest wyłączona (nie będzie renderowana)
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#141825] rounded-xl border border-white/5 space-y-2 text-xs text-slate-400 leading-relaxed">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Kinowa precyzja
              </div>
              <p>
                Karta zostanie wygenerowana w pełnej rozdzielczości projektu (do 4K) i płynnie wklejona do strumienia wideo z automatycznym wygaszaniem.
              </p>
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-[#23293b] flex items-center justify-between bg-[#131724]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5 transition cursor-pointer"
          >
            Anuluj
          </button>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Zapisz i zastosuj planszę
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
