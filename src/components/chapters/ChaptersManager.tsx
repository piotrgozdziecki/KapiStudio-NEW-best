import React from 'react';
import { 
  Bookmark, 
  Sparkles, 
  Clock, 
  Film, 
  Plus, 
  Check, 
  ChevronRight, 
  Play, 
  Type 
} from 'lucide-react';
import type { ProjectState, VideoChapter, ClipCategory, TextLayer } from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

interface ChaptersManagerProps {
  project: ProjectState;
  onUpdateChapters: (chapters: VideoChapter[]) => void;
  onAddTextLayer?: (layer: TextLayer) => void;
  onSeek?: (time: number) => void;
}

export const STUDIO_CHAPTER_DEFINITIONS: {
  key: VideoChapter['chapterKey'];
  label: string;
  desc: string;
  color: string;
  defaultTitle: string;
}[] = [
  { key: 'opening', label: 'Prolog & Hook', desc: 'Wstęp, ujęcia wprowadzające i budowanie klimatu', color: '#D4AF37', defaultTitle: 'I. Prolog' },
  { key: 'a_roll', label: 'Główny Wątek', desc: 'Kluczowe sceny, dialogi, bohaterowie i ekspozycja', color: '#38BDF8', defaultTitle: 'II. Główny Wątek' },
  { key: 'exposition', label: 'Ekspozycja i Tło', desc: 'Nakreślenie kontekstu, tło i przygotowania', color: '#06B6D4', defaultTitle: 'II. Ekspozycja' },
  { key: 'b_roll', label: 'Przebitki Atmosferyczne', desc: 'Detale, sceneria, plany ogólne i kontekst', color: '#F43F5E', defaultTitle: 'III. Przebitki' },
  { key: 'atmosphere', label: 'Atmosfera i Klimat', desc: 'Budowanie nastroju, światło i przestrzeń', color: '#EC4899', defaultTitle: 'III. Atmosfera' },
  { key: 'interview', label: 'Wywiady & Dialogi', desc: 'Wypowiedzi, relacje i autentyczne emocje', color: '#A855F7', defaultTitle: 'IV. Wywiady' },
  { key: 'action', label: 'Akcja & Ruch', desc: 'Dynamiczne sekwencje, tempo i punkt zwrotny', color: '#10B981', defaultTitle: 'V. Dynamiczna Akcja' },
  { key: 'performance', label: 'Występ & Show', desc: 'Sceny sceniczne, taniec, muzyka i choreografia', color: '#8B5CF6', defaultTitle: 'V. Występ' },
  { key: 'scenery', label: 'Krajobraz & Dron', desc: 'Panoramy, architektura i złota godzina', color: '#F59E0B', defaultTitle: 'VI. Sceneria' },
  { key: 'climax', label: 'Kulminacja', desc: 'Szczyt dramaturgiczny i maksymalne emocje', color: '#E11D48', defaultTitle: 'VII. Kulminacja' },
  { key: 'ending', label: 'Finał & Epilog', desc: 'Wyciszenie, konkluzja i napisy końcowe', color: '#D4AF37', defaultTitle: 'VIII. Finał i Podsumowanie' },
  // Universal event categories
  { key: 'preparations', label: 'Kulisy & Przygotowania', desc: 'Kulisy, detale i ostatnie szlify przed startem', color: '#F59E0B', defaultTitle: 'I. Przygotowania' },
  { key: 'ceremony', label: 'Główna Ceremonia / Gala', desc: 'Kluczowy oficjalny moment i wystąpienia', color: '#38BDF8', defaultTitle: 'II. Część Oficjalna' },
  { key: 'congratulations', label: 'Podziękowania & Toast', desc: 'Radość, uściski i gratulacje', color: '#F43F5E', defaultTitle: 'III. Podziękowania' },
  { key: 'party', label: 'Celebracja & Zabawa', desc: 'Integracja, muzyka i swobodna atmosfera', color: '#10B981', defaultTitle: 'IV. Celebracja' }
];

export const WEDDING_CHAPTER_DEFINITIONS = STUDIO_CHAPTER_DEFINITIONS;

export function ChaptersManager({
  project,
  onUpdateChapters,
  onAddTextLayer,
  onSeek
}: ChaptersManagerProps) {
  const toast = useStudioToast();

  // Auto-generate chapters from timeline items and categories
  const handleAutoGenerateChapters = () => {
    if (project.timelineItems.length === 0) {
      toast.showWarning("Najpierw dodaj klipy na oś czasu, aby wygenerować rozdziały.");
      return;
    }

    const generatedChapters: VideoChapter[] = [];
    
    // Group timeline items by sequence
    let currentChapterKey: VideoChapter['chapterKey'] | null = null;
    let chapterStart = 0;
    let chapterEnd = 0;

    project.timelineItems.forEach((item, index) => {
      const media = project.mediaLibrary.find(m => m.id === item.clipId);
      const category = (media?.category && media.category !== 'unassigned' ? media.category : 'a_roll') as VideoChapter['chapterKey'];

      if (currentChapterKey !== category) {
        if (currentChapterKey) {
          const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === currentChapterKey);
          generatedChapters.push({
            id: `chap_${Date.now()}_${generatedChapters.length}`,
            chapterKey: currentChapterKey,
            name: def?.label || 'Rozdział',
            startTime: chapterStart,
            endTime: chapterEnd,
            description: def?.desc
          });
        }
        currentChapterKey = category;
        chapterStart = item.timelineStart;
      }
      chapterEnd = item.timelineStart + item.duration;

      // If last item, close last chapter
      if (index === project.timelineItems.length - 1 && currentChapterKey) {
        const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === currentChapterKey);
        generatedChapters.push({
          id: `chap_${Date.now()}_${generatedChapters.length}`,
          chapterKey: currentChapterKey,
          name: def?.label || 'Rozdział',
          startTime: chapterStart,
          endTime: chapterEnd,
          description: def?.desc
        });
      }
    });

    onUpdateChapters(generatedChapters);
  };

  const handleAddChapterTitleCard = (chapter: VideoChapter) => {
    if (!onAddTextLayer) return;
    const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === chapter.chapterKey);
    const newTextLayer: TextLayer = {
      id: `text_chap_${Date.now()}`,
      text: def?.defaultTitle || chapter.name,
      type: 'chapter',
      style: 'elegant',
      timelineStart: chapter.startTime,
      duration: 3.5,
      position: { x: 0.5, y: 0.5 },
      fontSize: 2.4,
      color: '#F2EFE8',
      backgroundColor: 'rgba(0,0,0,0.4)'
    };
    onAddTextLayer(newTextLayer);
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] border-r border-[#2A2824] p-4 text-xs space-y-4 overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2A2824]">
        <div className="flex items-center gap-2 text-[#D4AF37]">
          <Bookmark className="w-4 h-4" />
          <h3 className="font-serif-luxury font-bold text-sm text-[#F2EFE8]">Rozdziały i Akty Filmowe</h3>
        </div>
        
        <button
          onClick={handleAutoGenerateChapters}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1F1F1F] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/15 transition-all text-[11px] font-medium cursor-pointer"
          title="Automatycznie wygeneruj rozdziały na podstawie ułożenia klipów"
        >
          <Sparkles className="w-3 h-3" />
          <span>Auto-Rozdziały</span>
        </button>
      </div>

      {/* Chapters list */}
      <div className="space-y-2">
        {project.chapters && project.chapters.length > 0 ? (
          project.chapters.map((chap, idx) => {
            const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === chap.chapterKey) || STUDIO_CHAPTER_DEFINITIONS[0];
            const durationSec = Math.max(0, chap.endTime - chap.startTime);

            return (
              <div 
                key={chap.id || idx}
                className="p-3 bg-[#181818] border border-[#262626] rounded-xl hover:border-[#3A3A3A] transition-colors flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: def.color }} 
                    />
                    <span className="font-semibold text-white text-xs">{chap.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#AAA69D] font-mono text-[10px]">
                    <Clock className="w-3 h-3" />
                    <span>{durationSec.toFixed(1)}s</span>
                  </div>
                </div>

                <p className="text-[11px] text-[#888] line-clamp-1">{def.desc}</p>

                <div className="flex items-center justify-between pt-1 border-t border-[#222]">
                  <button
                    onClick={() => onSeek && onSeek(chap.startTime)}
                    className="flex items-center gap-1 text-[10px] text-[#AAA69D] hover:text-[#D4AF37] transition-colors cursor-pointer"
                  >
                    <Play className="w-2.5 h-2.5" />
                    <span>Przejdź ({chap.startTime.toFixed(1)}s)</span>
                  </button>

                  <button
                    onClick={() => handleAddChapterTitleCard(chap)}
                    className="flex items-center gap-1 text-[10px] text-[#D4AF37] hover:underline cursor-pointer"
                    title="Dodaj planszę z napisem tytułowym rozdziału"
                  >
                    <Type className="w-2.5 h-2.5" />
                    <span>Dodaj planszę</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 rounded-xl bg-[#171717] border border-dashed border-[#333] text-center space-y-2">
            <Bookmark className="w-6 h-6 text-[#555] mx-auto" />
            <p className="text-xs text-[#AAA69D]">Brak zdefiniowanych rozdziałów.</p>
            <p className="text-[11px] text-[#777]">
              Kliknij "Auto-Rozdziały", aby automatycznie podzielić film na sekwencje i akty montażowe.
            </p>
          </div>
        )}
      </div>

      {/* Chapter Legend Definitions */}
      <div className="pt-2 border-t border-[#2A2824] space-y-2">
        <span className="text-[10px] font-mono uppercase text-[#777] block">Struktura Aktów i Scen:</span>
        <div className="grid grid-cols-2 gap-1.5">
          {STUDIO_CHAPTER_DEFINITIONS.map(def => (
            <div key={def.key} className="flex items-center gap-1.5 p-1.5 rounded bg-[#161616] text-[10px]">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: def.color }} />
              <span className="text-[#AAA69D] truncate">{def.label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
