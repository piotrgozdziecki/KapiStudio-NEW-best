import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  ArrowRight, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  MoveUp, 
  MoveDown, 
  Film, 
  Clock, 
  Type, 
  Sparkles, 
  Sliders, 
  ChevronRight,
  Shuffle,
  Play,
  RotateCw
} from 'lucide-react';
import type { MediaClip, TitleCard, TransitionType, TimelineItem, ProjectState } from '../../types/project';
import { TitleCardModal } from './TitleCardModal';

interface QuickMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaLibrary: MediaClip[];
  initialSelectedClipIds?: string[];
  projectSettings?: ProjectState['settings'];
  onApplyMerge: (
    items: {
      clip: MediaClip;
      trimStart: number;
      trimEnd: number;
      transition: TransitionType;
    }[],
    introCard?: TitleCard,
    outroCard?: TitleCard
  ) => void;
  onNavigateToExport?: () => void;
}

export function QuickMergeModal({
  isOpen,
  onClose,
  mediaLibrary,
  initialSelectedClipIds = [],
  projectSettings,
  onApplyMerge,
  onNavigateToExport
}: QuickMergeModalProps) {
  // Ordered sequence of clips to merge
  const [selectedClips, setSelectedClips] = useState<MediaClip[]>(() => {
    if (initialSelectedClipIds.length > 0) {
      const map = new Map(mediaLibrary.map(c => [c.id, c]));
      return initialSelectedClipIds.map(id => map.get(id)).filter(Boolean) as MediaClip[];
    }
    return mediaLibrary.slice(0, 10);
  });

  // Global Transition between clips
  const [transition, setTransition] = useState<TransitionType>('dissolve');

  // Intro Card Settings
  const [hasIntroCard, setHasIntroCard] = useState<boolean>(true);
  const [introCard, setIntroCard] = useState<TitleCard>({
    enabled: true,
    text: 'PROLOG',
    subtitle: 'Wprowadzenie do opowieści',
    duration: 3.5,
    style: 'cinematic',
    backgroundColor: 'gradient',
    cardType: 'intro'
  });
  const [isEditingIntro, setIsEditingIntro] = useState(false);

  // Outro Card Settings
  const [hasOutroCard, setHasOutroCard] = useState<boolean>(true);
  const [outroCard, setOutroCard] = useState<TitleCard>({
    enabled: true,
    text: 'THE END',
    subtitle: 'Dziękujemy za uwagę • Kapi-studio by Piotr',
    duration: 4.0,
    style: 'credits',
    backgroundColor: 'gradient',
    cardType: 'outro'
  });
  const [isEditingOutro, setIsEditingOutro] = useState(false);

  // Calculate total runtime of the merged video
  const totalClipsDuration = useMemo(() => {
    return selectedClips.reduce((acc, c) => acc + (c.duration || 0), 0);
  }, [selectedClips]);

  const totalRuntime = useMemo(() => {
    let dur = totalClipsDuration;
    if (hasIntroCard && introCard.enabled) dur += (introCard.duration || 3);
    if (hasOutroCard && outroCard.enabled) dur += (outroCard.duration || 4);
    return dur;
  }, [totalClipsDuration, hasIntroCard, introCard, hasOutroCard, outroCard]);

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Move clip up in sequence
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const copy = [...selectedClips];
    const temp = copy[index - 1];
    copy[index - 1] = copy[index];
    copy[index] = temp;
    setSelectedClips(copy);
  };

  // Move clip down in sequence
  const handleMoveDown = (index: number) => {
    if (index >= selectedClips.length - 1) return;
    const copy = [...selectedClips];
    const temp = copy[index + 1];
    copy[index + 1] = copy[index];
    copy[index] = temp;
    setSelectedClips(copy);
  };

  // Remove clip from sequence
  const handleRemove = (index: number) => {
    setSelectedClips(selectedClips.filter((_, i) => i !== index));
  };

  // Sort chronological by capture date / created at
  const handleSortChronological = () => {
    const sorted = [...selectedClips].sort((a, b) => {
      const tA = new Date(a.capturedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.capturedAt || b.createdAt || 0).getTime();
      return tA - tB;
    });
    setSelectedClips(sorted);
  };

  // Execute Merge
  const handleConfirmMerge = () => {
    if (selectedClips.length === 0) return;

    const items = selectedClips.map((clip) => ({
      clip,
      trimStart: 0,
      trimEnd: clip.duration,
      transition
    }));

    const finalIntro = hasIntroCard && introCard.enabled ? introCard : undefined;
    const finalOutro = hasOutroCard && outroCard.enabled ? outroCard : undefined;

    onApplyMerge(items, finalIntro, finalOutro);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-[#0e111a] border border-[#23293b] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#23293b] flex items-center justify-between bg-[#131724]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide font-cinematic">
                Szybkie Scalanie Filmów (Quick Merge)
              </h2>
              <p className="text-xs text-slate-400">
                Połącz wybrane ujęcia w jedną płynną sekwencję z kartą czołówki i napisów końcowych
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* 1. INTRO TITLE CARD BUMPER */}
          <div className={`p-4 rounded-xl border transition-all ${
            hasIntroCard 
              ? 'bg-[#141828] border-amber-500/30 shadow-lg shadow-amber-500/5' 
              : 'bg-[#121520] border-white/5 opacity-70'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  checked={hasIntroCard}
                  onChange={(e) => setHasIntroCard(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Karta Przed Filmem (Intro / Czołówka)
                    </span>
                    <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                      {introCard.duration}s • {introCard.style}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    "{introCard.text}" {introCard.subtitle ? `— ${introCard.subtitle}` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingIntro(true)}
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Dostosuj czołówkę
              </button>
            </div>
          </div>

          {/* 2. ORDERED SEQUENCE OF CLIPS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Kolejność Ujęć ({selectedClips.length})
                </span>
                <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Czas klipów: {formatSec(totalClipsDuration)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSortChronological}
                className="px-2.5 py-1 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5 cursor-pointer"
                title="Sortuj według daty nagrania"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Sortuj chronologicznie
              </button>
            </div>

            {selectedClips.length === 0 ? (
              <div className="p-8 text-center bg-[#141825] rounded-xl border border-dashed border-white/10 text-slate-400 text-xs">
                Brak wybranych ujęć. Wybierz klipy z biblioteki mediów.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {selectedClips.map((clip, idx) => (
                  <div
                    key={`${clip.id}_${idx}`}
                    className="flex items-center justify-between p-2.5 bg-[#141825] rounded-xl border border-white/5 hover:border-slate-600 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-[#1f2638] text-amber-400 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      
                      <div className="w-14 h-9 rounded-md bg-black/60 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                        ) : (
                          <Film className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate max-w-xs sm:max-w-md">
                          {clip.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{formatSec(clip.duration)}</span>
                          <span>•</span>
                          <span>{clip.width}x{clip.height}</span>
                          <span>•</span>
                          <span className="uppercase">{clip.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveUp(idx)}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                        title="Przesuń wyżej"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === selectedClips.length - 1}
                        onClick={() => handleMoveDown(idx)}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                        title="Przesuń niżej"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="w-7 h-7 rounded flex items-center justify-center text-red-400 hover:bg-red-500/10 transition cursor-pointer ml-1"
                        title="Usuń z sekwencji"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. TRANSITION SELECTION */}
          <div className="p-4 bg-[#141825] rounded-xl border border-white/5 space-y-3">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Przejście między ujęciami
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'cut', label: 'Cięcie (Cut)' },
                { id: 'dissolve', label: 'Płynne Przenikanie' },
                { id: 'dip_black', label: 'Do Czerni' },
                { id: 'dip_white', label: 'Do Bieli' },
                { id: 'zoom', label: 'Kinowy Zoom' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTransition(t.id as TransitionType)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-center cursor-pointer ${
                    transition === t.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-white/5 bg-[#10131d] text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. OUTRO TITLE CARD BUMPER */}
          <div className={`p-4 rounded-xl border transition-all ${
            hasOutroCard 
              ? 'bg-[#141828] border-amber-500/30 shadow-lg shadow-amber-500/5' 
              : 'bg-[#121520] border-white/5 opacity-70'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  checked={hasOutroCard}
                  onChange={(e) => setHasOutroCard(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Karta Po Filmie (Outro / Napisy Końcowe)
                    </span>
                    <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                      {outroCard.duration}s • {outroCard.style}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    "{outroCard.text}" {outroCard.subtitle ? `— ${outroCard.subtitle}` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingOutro(true)}
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Dostosuj napisy
              </button>
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-[#23293b] flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#131724]">
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span>Łączny czas po scaleniu:</span>
            <span className="font-mono font-bold text-amber-400 text-sm bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
              {formatSec(totalRuntime)}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5 transition cursor-pointer"
            >
              Anuluj
            </button>
            
            <button
              type="button"
              onClick={handleConfirmMerge}
              disabled={selectedClips.length === 0}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Scal i Wstaw do Osi Montażowej
            </button>
          </div>
        </div>

      </div>

      {/* Intro Card Modal */}
      {isEditingIntro && (
        <TitleCardModal
          isOpen={isEditingIntro}
          onClose={() => setIsEditingIntro(false)}
          cardType="intro"
          initialCard={introCard}
          onSave={(card) => {
            setIntroCard(card);
            setHasIntroCard(true);
          }}
        />
      )}

      {/* Outro Card Modal */}
      {isEditingOutro && (
        <TitleCardModal
          isOpen={isEditingOutro}
          onClose={() => setIsEditingOutro(false)}
          cardType="outro"
          initialCard={outroCard}
          onSave={(card) => {
            setOutroCard(card);
            setHasOutroCard(true);
          }}
        />
      )}

    </div>
  );
}
