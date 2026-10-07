import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, 
  Film, 
  Clock, 
  Check, 
  X, 
  Play, 
  ArrowRight, 
  Layers, 
  Sliders, 
  Calendar, 
  Heart, 
  Music, 
  Wand2, 
  RotateCw, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Scissors, 
  Type as TypeIcon, 
  Download,
  AlertCircle,
  FileVideo,
  Palette,
  Bookmark,
  Tv,
  CheckSquare,
  Square
} from 'lucide-react';
import type { MediaClip, ClipCategory, ProjectState, TimelineItem, TextLayer, WeddingChapter, LookPreset } from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

export interface DirectorMergeOptions {
  includeIntroTitleCard: boolean;
  introTitle: string;
  introSubtitle: string;
  introDuration: number;
  introStyle: 'cinematic' | 'modern_bold' | 'studio_slate' | 'cyber_neon' | 'credits' | 'elegant' | 'classic' | 'liturgical' | 'minimalist';
  includeOutroTitleCard: boolean;
  outroTitle: string;
  outroSubtitle: string;
  outroDuration: number;
  includeSceneTitles: boolean;
  includeSubtitles: boolean;
  applyTransitions: boolean;
  applySmartTrim: boolean;
  colorGrade: LookPreset;
  generateChapters: boolean;
  includeSoundtrack: boolean;
  soundtrackPresetId?: string;
  targetTab: 'montage' | 'export';
  pacing?: 'cinematic' | 'fast' | 'slow';
}

export interface SequencedItem {
  clipId: string;
  clip: MediaClip;
  targetOrder: number;
  smartTitle: string;
  subtitleCaption: string;
  category: ClipCategory;
  emotion?: string;
  timeOfDay?: string;
  transition: string;
  trimStart: number;
  trimEnd: number;
  directorReason: string;
  includeInTimeline: boolean;
}

interface AiChronologicalMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  clips: MediaClip[];
  onApplyToTimeline: (
    items: {
      clip: MediaClip;
      smartTitle: string;
      subtitleCaption: string;
      category: ClipCategory;
      emotion?: string;
      timeOfDay?: string;
      transition: string;
      trimStart: number;
      trimEnd: number;
    }[],
    options?: DirectorMergeOptions
  ) => void;
  onApplyCaptionsToLibrary: (updates: { id: string; name: string; category: ClipCategory; comment: string; tags: string[] }[]) => void;
  onOpenQuickMerge?: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  intro: { label: 'Czołówka (Intro)', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🎬' },
  a_roll: { label: 'Główne Ujęcie (A-Roll)', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40', icon: '🎥' },
  b_roll: { label: 'Przebitka (B-Roll)', color: 'bg-teal-500/20 text-teal-300 border-teal-500/40', icon: '🎞️' },
  interview: { label: 'Wywiad / Dialog', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '🎙️' },
  action: { label: 'Dynamiczna Akcja', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: '⚡' },
  scenery: { label: 'Krajobraz / Plener', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40', icon: '🌄' },
  drone: { label: 'Ujęcie z Drona', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '🚁' },
  macro: { label: 'Detal / Zbliżenie', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: '🔍' },
  climax: { label: 'Kulminacja', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: '🔥' },
  outro: { label: 'Napisy Końcowe', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '✨' },
  opening: { label: 'Otwarcie', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🎬' },
  preparations: { label: 'Przygotowania', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '⚙️' },
  ceremony: { label: 'Uroczystość', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: '🏆' },
  party: { label: 'Wydarzenie & Spotkanie', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '🎉' },
  ending: { label: 'Zakończenie', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '✨' },
  unassigned: { label: 'Pozostałe ujęcie', color: 'bg-stone-500/20 text-stone-300 border-stone-500/40', icon: '🎬' }
};

export function AiChronologicalMergeModal({
  isOpen,
  onClose,
  clips,
  onApplyToTimeline,
  onApplyCaptionsToLibrary,
  onOpenQuickMerge
}: AiChronologicalMergeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [pacing, setPacing] = useState<'cinematic' | 'dynamic' | 'emotional'>('cinematic');
  const [captionStyle, setCaptionStyle] = useState<'cinematic_poetic' | 'elegant_classic' | 'modern_short'>('cinematic_poetic');
  const [sequencedItems, setSequencedItems] = useState<SequencedItem[]>([]);
  const [storyConcept, setStoryConcept] = useState<string>('');
  const [musicSuggestion, setMusicSuggestion] = useState<string>('');
  const [coupleNames, setCoupleNames] = useState<string>('Nowy Film Kinowy');
  const [weddingDate, setWeddingDate] = useState<string>('2026');
  const [activeTab, setActiveTab] = useState<'sequence' | 'options' | 'captions'>('sequence');
  const [previewClip, setPreviewClip] = useState<{ url: string; title: string; caption: string } | null>(null);
  const [isEffectsPanelOpen, setIsEffectsPanelOpen] = useState<boolean>(true);

  // Director Options (Wybrane Dodatki - Wszystkie aktywne od razu w 1 przycisku!)
  const [includeIntroTitleCard, setIncludeIntroTitleCard] = useState<boolean>(true);
  const [introTitle, setIntroTitle] = useState<string>('MASTER CUT PRODUCTION');
  const [introSubtitle, setIntroSubtitle] = useState<string>('Oficjalny Montaż Reżyserski');
  const [introDuration, setIntroDuration] = useState<number>(3.5);
  const [introStyle, setIntroStyle] = useState<'cinematic' | 'modern_bold' | 'studio_slate' | 'classic' | 'minimalist'>('cinematic');
  const [includeSceneTitles, setIncludeSceneTitles] = useState<boolean>(true);
  const [includeOutroTitleCard, setIncludeOutroTitleCard] = useState<boolean>(true);
  const [outroTitle, setOutroTitle] = useState<string>('NAPISY KOŃCOWE');
  const [outroSubtitle, setOutroSubtitle] = useState<string>(
    'Dziękujemy za uwagę • Montaż i postprodukcja: Kapi-studio by Piotr'
  );
  const [outroDuration, setOutroDuration] = useState<number>(4.0);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
  const [applyTransitions, setApplyTransitions] = useState<boolean>(true);
  const [applySmartTrim, setApplySmartTrim] = useState<boolean>(false);
  const [colorGrade, setColorGrade] = useState<LookPreset>('golden_hour');
  const [generateChapters, setGenerateChapters] = useState<boolean>(true);
  const [includeSoundtrack, setIncludeSoundtrack] = useState<boolean>(false);
  const [soundtrackPresetId, setSoundtrackPresetId] = useState<string>('golden_hour_piano');

  const prevClipsIdsRef = useRef<string>('');
  const toast = useStudioToast();

  // Sync intro and outro fields with project info
  useEffect(() => {
    if (coupleNames && coupleNames !== 'Joanna & Piotr') {
      setIntroTitle(coupleNames.toUpperCase());
      setIntroSubtitle(weddingDate ? `${weddingDate} • Oficjalna Produkcja Filmowa` : 'Kinowy Montaż Reżyserski');
      setOutroSubtitle(
        `Reżyseria i montaż: ${coupleNames}${weddingDate ? ` • ${weddingDate}` : ''}. Wszelkie prawa zastrzeżone.`
      );
    }
  }, [coupleNames, weddingDate]);

  // Helper to generate elegant Polish scene titles for clips
  const generatePolishSceneTitle = (name: string, cat: ClipCategory, index: number): string => {
    let t = (name || '').replace(/\.[a-zA-Z0-9]{2,5}$/i, '').trim();
    const isTechnical = !t || 
      /\.(mp4|mov|avi|mkv|jpg|jpeg|png)$/i.test(name || '') ||
      /^(clip|video|dsc|img|vid|i\d{2,}|scena\s*\d*|ujęcie\s*\d*)/i.test(t);

    if (isTechnical) {
      const titleDictionary: Record<string, string[]> = {
        opening: ['Prolog i Wprowadzenie', 'Scena Otwierająca', 'Ujęcia Wstępne'],
        intro: ['Czołówka i Prezentacja', 'Ekspozycja Świata', 'Początek Historii'],
        a_roll: ['Główny Wątek i Postacie', 'Kluczowe Sceny', 'Wypowiedzi i Relacje'],
        b_roll: ['Przebitki Atmosferyczne', 'Detale i Otoczenie', 'Ujęcia Kontekstowe'],
        interview: ['Głos Świadków i Relacje', 'Wywiad z Bohaterem', 'Autentyczne Wypowiedzi'],
        action: ['Dynamiczna Sekwencja', 'Główna Akcja w Ruchu', 'Punkt Kulminacyjny'],
        dialogue: ['Ważna Rozmowa', 'Kluczowa Konfrontacja', 'Wymiana Zdań'],
        scenery: ['Majestat Krajobrazu', 'Szeroki Kadr Plenerowy', 'Ujęcia Architektury'],
        drone: ['Ujęcia z Lotu Ptaka', 'Kinowa Panorama z Drona', 'Perspektywa Przestrzenna'],
        climax: ['Szczyt Dramaturgiczny', 'Moment Przełomowy', 'Finałowe Napięcie'],
        ending: ['Zakończenie i Epilog', 'Wyciszenie Emocji', 'Finałowy Kadr'],
        outro: ['Napisy Końcowe', 'Podsumowanie Projektu', 'Plansza Zamykająca'],
        preparations: ['Prolog i Wprowadzenie', 'Przygotowania i Detale', 'Ujęcia Wstępne'],
        ceremony: ['Kluczowa Scena Główna', 'Uroczysty Moment', 'Punkt Przełomowy'],
        congratulations: ['Wzruszające Chwile', 'Radość i Emocje', 'Wspólne Świętowanie'],
        first_dance: ['Dynamiczna Scena Artystyczna', 'Klimatyczny Kadr Muzyczny', 'Magia Ruchu'],
        toast: ['Uroczyste Przemówienia', 'Ważne Słowa i Reakcje', 'Toast i Brawa'],
        party: ['Energia i Akcja', 'Dynamika Wydarzenia', 'Kulminacja Emocji'],
        cake: ['Wyjątkowy Moment Wieczoru', 'Uroczysty Akcent', 'Słodki Finał'],
        outdoor: ['Malarstwo Plenerowe', 'Złota Godzina', 'Szeroka Perspektywa']
      };
      const pool = titleDictionary[cat] || ['Kluczowe Ujęcie Filmowe', 'Wyjątkowy Kadr Montażowy'];
      return pool[index % pool.length];
    }
    return t;
  };

  const handleStartAnalysis = async () => {
    if (clips.length === 0) return;
    setIsLoading(true);

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 20000); // 20s timeout with immediate fallback

      let data: any = null;
      try {
        const response = await fetch('/api/smart-chronological-sequencing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            clips: clips.map(c => ({
              id: c.id,
              name: String(c.name || 'Bez nazwy'),
              duration: typeof c.duration === 'number' ? c.duration : 0,
              capturedAt: c.capturedAt || c.createdAt || '',
              tags: Array.isArray(c.tags) ? [...c.tags] : [],
              comment: String(c.comment || '')
            })),
            pacing,
            coupleNames: String(coupleNames || 'Młoda Para'),
            weddingDate: String(weddingDate || '')
          })
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          data = await response.json().catch(() => null);
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        console.warn('[MergeModal] Network sequencing note (proceeding with local sequencing):', fetchErr?.message || fetchErr);
      }

      const clipMap = new Map<string, MediaClip>();
      clips.forEach(c => clipMap.set(c.id, c));

      if (data && Array.isArray(data.orderedSequence) && data.orderedSequence.length > 0) {
        setStoryConcept(data.storyConcept || 'Inteligentnie skomponowana chronologia filmu z płynnymi przejściami.');
        setMusicSuggestion(data.musicSuggestion || 'Akustyczny fortepian i ciepłe smyczki (Master Mix)');

        const rawSeq = data.orderedSequence || [];
        const formatted: SequencedItem[] = [];

        rawSeq.forEach((item: any, idx: number) => {
          const foundClip = clipMap.get(item.clipId);
          if (foundClip) {
            const cat = (item.category as ClipCategory) || foundClip.category || 'unassigned';
            const cleanTitle = item.smartTitle || generatePolishSceneTitle(foundClip.name, cat, idx);
            formatted.push({
              clipId: item.clipId,
              clip: foundClip,
              targetOrder: item.targetOrder || (idx + 1),
              smartTitle: cleanTitle,
              subtitleCaption: item.subtitleCaption || `Pamiątkowa chwila – ${cleanTitle}`,
              category: cat,
              emotion: item.emotion || 'romantic',
              timeOfDay: item.timeOfDay || (idx < rawSeq.length * 0.3 ? 'morning' : (idx < rawSeq.length * 0.7 ? 'afternoon' : 'evening')),
              transition: item.transition || (idx === 0 ? 'dip_black' : 'dissolve'),
              trimStart: typeof item.trimStart === 'number' ? item.trimStart : (applySmartTrim ? 0.5 : 0),
              trimEnd: typeof item.trimEnd === 'number' ? item.trimEnd : Math.max(0.5, foundClip.duration - (applySmartTrim ? 0.5 : 0)),
              directorReason: item.directorReason || 'Płynne dopasowanie do osi czasu.',
              includeInTimeline: true
            });
          }
        });

        // Include any clips that were not part of response at the end
        clips.forEach((c) => {
          if (!formatted.some(f => f.clipId === c.id)) {
            const cleanTitle = generatePolishSceneTitle(c.name, c.category || 'unassigned', formatted.length);
            formatted.push({
              clipId: c.id,
              clip: c,
              targetOrder: formatted.length + 1,
              smartTitle: cleanTitle,
              subtitleCaption: `Ujęcie z uroczystości – ${cleanTitle}`,
              category: c.category || 'unassigned',
              transition: 'dissolve',
              trimStart: 0,
              trimEnd: c.duration,
              directorReason: 'Dodano z zaznaczenia.',
              includeInTimeline: true
            });
          }
        });

        setSequencedItems(formatted);
        toast.showSuccess(`✨ Reżyser ułożył ${formatted.length} ujęć w spójną chronologię z dodatkami!`);
      } else {
        // High-precision local chronological arrangement
        const sorted = [...clips].sort((a, b) => {
          const tA = new Date(a.capturedAt || a.createdAt || 0).getTime();
          const tB = new Date(b.capturedAt || b.createdAt || 0).getTime();
          if (tA !== tB) return tA - tB;
          return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        });

        const categoriesList: ClipCategory[] = ['preparations', 'ceremony', 'congratulations', 'first_dance', 'toast', 'party', 'cake', 'ending'];

        const fallbackSeq: SequencedItem[] = sorted.map((c, i) => {
          const catIdx = Math.min(categoriesList.length - 1, Math.floor((i / Math.max(1, sorted.length)) * categoriesList.length));
          const cat = c.category && c.category !== 'unassigned' ? c.category : categoriesList[catIdx];
          const cleanTitle = generatePolishSceneTitle(c.name, cat, i);
          return {
            clipId: c.id,
            clip: c,
            targetOrder: i + 1,
            smartTitle: cleanTitle,
            subtitleCaption: `Niezapomniana chwila – ${cleanTitle}`,
            category: cat,
            emotion: 'romantic',
            timeOfDay: i < sorted.length * 0.3 ? 'morning' : (i < sorted.length * 0.7 ? 'afternoon' : 'evening'),
            transition: i === 0 ? 'dip_black' : 'dissolve',
            trimStart: applySmartTrim ? 0.5 : 0,
            trimEnd: Math.max(0.5, c.duration - (applySmartTrim ? 0.5 : 0)),
            directorReason: 'Dopasowano chronologicznie według czasu nagrania.',
            includeInTimeline: true
          };
        });

        setSequencedItems(fallbackSeq);
        setStoryConcept('Chronologiczna narracja ułożona według czasu nagrania.');
        setMusicSuggestion('Spokojna kompozycja fortepianowa z narastającym finałem');
        toast.showSuccess(`✨ Ułożono ${fallbackSeq.length} ujęć w spójną chronologię z dodatkami!`);
      }
    } catch (err: any) {
      console.warn('[MergeModal] Handled sequencing flow:', err?.message || err);
    } finally {
      setIsLoading(false);
    }
  };

  // Re-trigger analysis when modal opens or clips list changes
  useEffect(() => {
    if (!isOpen || clips.length === 0) return;
    const currentClipsKey = clips.map(c => c.id).sort().join(',');
    if (currentClipsKey !== prevClipsIdsRef.current) {
      prevClipsIdsRef.current = currentClipsKey;
      handleStartAnalysis();
    }
  }, [isOpen, clips]);

  const handleUpdateItem = (clipId: string, updates: Partial<SequencedItem>) => {
    setSequencedItems(prev => prev.map(item => item.clipId === clipId ? { ...item, ...updates } : item));
  };

  const handleMoveOrder = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sequencedItems.length) return;

    const copy = [...sequencedItems];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    // Recalculate targetOrder
    copy.forEach((item, i) => {
      item.targetOrder = i + 1;
    });

    setSequencedItems(copy);
  };

  const buildDirectorOptions = (targetTab: 'montage' | 'export'): DirectorMergeOptions => ({
    includeIntroTitleCard,
    introTitle,
    introSubtitle,
    introDuration,
    introStyle,
    includeOutroTitleCard,
    outroTitle,
    outroSubtitle,
    outroDuration,
    includeSceneTitles,
    includeSubtitles,
    applyTransitions,
    applySmartTrim,
    colorGrade,
    generateChapters,
    includeSoundtrack,
    soundtrackPresetId,
    targetTab
  });

  const handleApplyAllDirectorOptionsAtOnce = (targetTab: 'montage' | 'export' = 'montage') => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do filmu.');
      return;
    }

    const options: DirectorMergeOptions = {
      includeIntroTitleCard: includeIntroTitleCard,
      introTitle: introTitle || 'MASTER CUT PRODUCTION',
      introSubtitle: introSubtitle || 'Oficjalny Montaż Reżyserski',
      introDuration: 3.5,
      introStyle: introStyle || 'cinematic',
      includeOutroTitleCard: includeOutroTitleCard,
      outroTitle: outroTitle || 'NAPISY KOŃCOWE',
      outroSubtitle: outroSubtitle || 'Dziękujemy za uwagę • Montaż i postprodukcja: Kapi-studio by Piotr',
      outroDuration: 4.0,
      includeSceneTitles: includeSceneTitles,
      includeSubtitles: includeSubtitles,
      applyTransitions: true,
      applySmartTrim: applySmartTrim,
      colorGrade: colorGrade || 'golden_hour',
      generateChapters: true,
      includeSoundtrack: includeSoundtrack,
      soundtrackPresetId: soundtrackPresetId || 'altar_procession',
      targetTab
    };

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      emotion: i.emotion,
      timeOfDay: i.timeOfDay,
      transition: 'dissolve',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`✨ Reżyser zastosował wszystkie opcje (Intro Liturgiczne, Karty Scen, Podziękowania i Muzyka)!`);
    onClose();
  };

  const handleApplyToTimeline = () => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do dodania na oś czasu.');
      return;
    }

    const options = buildDirectorOptions('montage');

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      emotion: i.emotion,
      timeOfDay: i.timeOfDay,
      transition: applyTransitions ? i.transition : 'cut',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`🎬 Zbudowano Oś Czasu z ${active.length} ujęć z wybranymi dodatkami!`);
    onClose();
  };

  const handleMergeAndExportDirectly = () => {
    const active = sequencedItems.filter(i => i.includeInTimeline);
    if (active.length === 0) {
      toast.showWarning('Wybierz przynajmniej jedno ujęcie do filmu.');
      return;
    }

    const options = buildDirectorOptions('export');

    onApplyToTimeline(active.map(i => ({
      clip: i.clip,
      smartTitle: i.smartTitle,
      subtitleCaption: i.subtitleCaption,
      category: i.category,
      emotion: i.emotion,
      timeOfDay: i.timeOfDay,
      transition: applyTransitions ? i.transition : 'cut',
      trimStart: applySmartTrim ? i.trimStart : 0,
      trimEnd: applySmartTrim ? i.trimEnd : i.clip.duration
    })), options);

    toast.showSuccess(`⚡ Scalono ${active.length} filmów z dodatkami. Przechodzę do okna eksportu!`);
    onClose();
  };

  const handleApplyCaptions = () => {
    onApplyCaptionsToLibrary(sequencedItems.map(i => ({
      id: i.clipId,
      name: i.smartTitle,
      category: i.category,
      comment: i.subtitleCaption,
      tags: [i.category, 'ai_chronological']
    })));

    toast.showSuccess(`🏷️ Zaktualizowano tytuły, podpisy i kategorie ${sequencedItems.length} ujęć w bibliotece!`);
  };

  const totalDuration = useMemo(() => {
    const clipsDur = sequencedItems
      .filter(i => i.includeInTimeline)
      .reduce((acc, i) => {
        const start = applySmartTrim ? i.trimStart : 0;
        const end = applySmartTrim ? i.trimEnd : i.clip.duration;
        return acc + Math.max(0, end - start);
      }, 0);
    const introDur = includeIntroTitleCard ? introDuration : 0;
    return clipsDur + introDur;
  }, [sequencedItems, applySmartTrim, includeIntroTitleCard, introDuration]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-inner shrink-0">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-heading font-bold text-white flex items-center gap-2">
                Scalanie Filmów • Precyzyjna Kompozycja i Mastering
              </h2>
              <p className="text-xs text-zinc-400">
                Łączenie {clips.length} zaznaczonych filmów, czołówka tytułowa, napisy i optymalizacja klatek
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAnalysis}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 transition-all cursor-pointer shadow-sm"
              title="Przelicz ponownie chronologię i napisy"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Przelicz sekwencję</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Controls & Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
          
          {/* Top Options Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5 font-mono">
                Styl i tempo montażu
              </label>
              <select
                value={pacing}
                onChange={(e: any) => setPacing(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="cinematic">Kinowy i płynny (klasyczny przepływ)</option>
                <option value="dynamic">Dynamiczny teledysk (szybkie cięcia)</option>
                <option value="emotional">Wzruszający reportaż (akcent na dialogi)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5 font-mono">
                Styl podpisów i narracji
              </label>
              <select
                value={captionStyle}
                onChange={(e: any) => setCaptionStyle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="cinematic_poetic">Poetycki i narracyjny</option>
                <option value="elegant_classic">Klasyczny i elegancki</option>
                <option value="modern_short">Nowoczesny i zwięzły</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5 font-mono">
                Tytuł Główny Filmu / Produkcji
              </label>
              <input
                type="text"
                value={coupleNames}
                onChange={(e) => setCoupleNames(e.target.value)}
                placeholder="np. KRONIKI 2026"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Wybrane Dodatki Reżyserskie Panel */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-lg space-y-3">
            <div 
              onClick={() => setIsEffectsPanelOpen(prev => !prev)}
              className="flex items-center justify-between border-b border-zinc-800 pb-2 cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2 font-mono">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Dodatki i Efekty Montażowe (Aktywne w Scalonym Filmie)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                  {[
                    includeIntroTitleCard && 'Intro',
                    includeSceneTitles && 'Karty Scen',
                    includeOutroTitleCard && 'Outro',
                    includeSubtitles && 'Napisy',
                    applyTransitions && 'Przejścia',
                    generateChapters && 'Rozdziały'
                  ].filter(Boolean).length} aktywnych
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 hidden sm:inline group-hover:text-zinc-200 transition-colors">
                  {isEffectsPanelOpen ? 'Zwiń opcje dodatków' : 'Rozwiń opcje dodatków'}
                </span>
                <button
                  type="button"
                  className="p-1 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-white transition-colors"
                >
                  {isEffectsPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {isEffectsPanelOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {/* Dodatek 1: Plansza Intro (Kinowa / Studio) */}
              <div className={`p-3 rounded-xl border transition-all ${
                includeIntroTitleCard ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5 text-amber-400" />
                    Wstępna karta (Intro)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeIntroTitleCard}
                    onChange={(e) => setIncludeIntroTitleCard(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                {includeIntroTitleCard && (
                  <div className="space-y-1.5 text-[11px]">
                    <input
                      type="text"
                      value={introTitle}
                      onChange={(e) => setIntroTitle(e.target.value)}
                      placeholder="Główny tytuł filmu"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-white font-medium focus:border-amber-500 outline-none"
                    />
                    <input
                      type="text"
                      value={introSubtitle}
                      onChange={(e) => setIntroSubtitle(e.target.value)}
                      placeholder="Podtytuł / Realizacja"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-400 focus:border-amber-500 outline-none"
                    />
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Styl planszy:</span>
                      <select
                        value={introStyle}
                        onChange={(e: any) => setIntroStyle(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-amber-300 font-mono text-[10px]"
                      >
                        <option value="cinematic">Kinowy Gold & Noir</option>
                        <option value="modern_bold">Nowoczesny Bold</option>
                        <option value="studio_slate">Studio Slate (Klaps)</option>
                        <option value="minimalist">Minimalistyczny Clean</option>
                        <option value="classic">Klasyczny Serif</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Dodatek 2: Karty Pomiędzy Filmami (Opisujące co się dzieje) */}
              <div className={`p-3 rounded-xl border transition-all ${
                includeSceneTitles ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Karty pomiędzy filmami (Sceny)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeSceneTitles}
                    onChange={(e) => setIncludeSceneTitles(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Eleganckie plansze wprowadzające między aktami filmu opisujące co się dzieje (Prolog, Ekspozycja, Główna Akcja, Kulminacja).
                </p>
              </div>

              {/* Dodatek 3: Karta Końcowa (Napisy i Kredyty) */}
              <div className={`p-3 rounded-xl border transition-all ${
                includeOutroTitleCard ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-amber-400" />
                    Karta końcowa (Napisy / Kredyty)
                  </span>
                  <input
                    type="checkbox"
                    checked={includeOutroTitleCard}
                    onChange={(e) => setIncludeOutroTitleCard(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                {includeOutroTitleCard && (
                  <div className="space-y-1.5 text-[11px]">
                    <input
                      type="text"
                      value={outroTitle}
                      onChange={(e) => setOutroTitle(e.target.value)}
                      placeholder="Tytuł planszy końcowej"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-white font-medium focus:border-amber-500 outline-none"
                    />
                    <textarea
                      value={outroSubtitle}
                      onChange={(e) => setOutroSubtitle(e.target.value)}
                      placeholder="Napisy końcowe, podziękowania i kredyty..."
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-400 focus:border-amber-500 resize-none leading-tight outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Dodatek 4: Dźwięk i audio (100% oryginalny czysty dźwięk) */}
              <div className="p-3 rounded-xl border bg-zinc-900/60 border-zinc-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                    Dźwięk & Audio
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/30">
                    100% Czysty dźwięk
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Zachowany zostaje wyłącznie oryginalny, krystaliczny dźwięk z nagrań oraz Twoje własne wgrane pliki MP3 / nagrania głosu. Żadnych sztucznych szumów.
                </p>
              </div>

              {/* Dodatek 5: Napisy scen */}
              <div className={`p-3 rounded-xl border transition-all ${
                includeSubtitles ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TypeIcon className="w-3.5 h-3.5 text-amber-400" />
                    Kinowe napisy / podpisy scen
                  </span>
                  <input
                    type="checkbox"
                    checked={includeSubtitles}
                    onChange={(e) => setIncludeSubtitles(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Automatycznie generuje podpisy narracyjne na dole ekranu, zsynchronizowane z każdym ujęciem.
                </p>
              </div>

              {/* Dodatek 6: Płynne przejścia */}
              <div className={`p-3 rounded-xl border transition-all ${
                applyTransitions ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Płynne przejścia (Crossfade)
                  </span>
                  <input
                    type="checkbox"
                    checked={applyTransitions}
                    onChange={(e) => setApplyTransitions(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Eliminuje ostre cięcia, nakłada przenikanie (dissolve) oraz ściemnienie (dip black) na zmiany scen.
                </p>
              </div>

              {/* Dodatek 7: Smart Trim */}
              <div className={`p-3 rounded-xl border transition-all ${
                applySmartTrim ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-amber-400" />
                    Inteligentne cięcie (Smart Trim)
                  </span>
                  <input
                    type="checkbox"
                    checked={applySmartTrim}
                    onChange={(e) => setApplySmartTrim(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Obcina niestabilne pierwsze i ostatnie klatki nagrań smartfonowych i kamerowych.
                </p>
              </div>

              {/* Dodatek 8: Kolorystyka i Grading */}
              <div className="p-3 rounded-xl border bg-zinc-900/60 border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-amber-400" />
                    Profil barwny filmu (LUT)
                  </span>
                </div>
                <select
                  value={colorGrade}
                  onChange={(e: any) => setColorGrade(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-amber-300 focus:border-amber-500 cursor-pointer"
                >
                  <option value="golden_hour">Złota Godzina (Ciepłe, złociste światło)</option>
                  <option value="cinematic">Kinowy Kontrast (Deep Cinema Noir)</option>
                  <option value="warm">Ciepły i miękki</option>
                  <option value="vintage">Styl Retro 35mm / Vintage</option>
                  <option value="natural">Naturalny (Wierne barwy studyjne)</option>
                  <option value="none">Brak korekcji (Oryginał)</option>
                </select>
              </div>

              {/* Dodatek 9: Rozdziały filmu */}
              <div className={`p-3 rounded-xl border transition-all ${
                generateChapters ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-950/60 border-zinc-800/40 opacity-60'
              }`}>
                <label className="flex items-center justify-between cursor-pointer mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                    Rozdziały filmu (Chapters)
                  </span>
                  <input
                    type="checkbox"
                    checked={generateChapters}
                    onChange={(e) => setGenerateChapters(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Dzieli scalony film na logiczne rozdziały (Prolog, Ekspozycja, Główny Wątek, Kulminacja, Epilog).
                </p>
              </div>
            </div>
            )}
          </div>

          {/* Story Concept Banner */}
          {storyConcept && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-zinc-900/90 to-indigo-500/10 border border-amber-500/30 flex items-start gap-3 shadow-md">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 border border-amber-500/30">
                <Heart className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
                  Koncept Reżyserski Scalania
                </h4>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  {storyConcept}
                </p>
                {musicSuggestion && (
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 pt-0.5">
                    <Music className="w-3 h-3 text-amber-400" />
                    <span>Sugerowana oprawa muzyczna: <strong className="text-amber-200">{musicSuggestion}</strong></span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tabs for Sequence / Quick Captions */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('sequence')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === 'sequence' 
                    ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 shadow-sm' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                🎬 Oś Chronologiczna & Cięcia ({sequencedItems.length} ujęć)
              </button>
              <button
                onClick={() => setActiveTab('captions')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === 'captions' 
                    ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 shadow-sm' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                🏷️ Generator Podpisów & Tagi
              </button>
            </div>

            <div className="text-xs text-zinc-400 flex items-center gap-2 font-mono">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Łączny czas z dodatkami: <strong className="text-zinc-200">{Math.floor(totalDuration / 60)}m {Math.round(totalDuration % 60)}s</strong></span>
            </div>
          </div>

          {/* Loading state */}
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-[#FDE047]">
                Reżyser analizuje ujęcia, układa chronologię i przygotowuje dodatki...
              </p>
              <p className="text-xs text-[#8C7E64]">
                Rozpoznawanie etapów uroczystości, optymalizacja cięć i generowanie podpisów
              </p>
            </div>
          ) : activeTab === 'captions' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#FDE047] font-mono">
                    Generator Podpisów Scen & Tagi Biblioteki
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Możesz masowo edytować podpisy narracyjne, które wyświetlą się w dolnym pasku oraz zaktualizować bibliotekę mediów.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCaptions}
                  disabled={sequencedItems.length === 0}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <TypeIcon className="w-3.5 h-3.5" />
                  <span>Zapisz w bibliotece</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sequencedItems.map((item, index) => {
                  const catInfo = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.unassigned;
                  return (
                    <div 
                      key={item.clipId} 
                      className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 space-y-2.5 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold text-[#FDE047]">
                          #{index + 1} {item.clip.name}
                        </span>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                      </div>
                      
                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5 font-mono uppercase">Tytuł Sceny:</label>
                        <input
                          type="text"
                          value={item.smartTitle}
                          onChange={(e) => handleUpdateItem(item.clipId, { smartTitle: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-semibold focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5 font-mono uppercase">Podpis (Dolna belka narracyjna):</label>
                        <input
                          type="text"
                          value={item.subtitleCaption}
                          onChange={(e) => handleUpdateItem(item.clipId, { subtitleCaption: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-amber-200 italic focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sequencedItems.map((item, index) => {
                const catInfo = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.unassigned;
                const start = applySmartTrim ? item.trimStart : 0;
                const end = applySmartTrim ? item.trimEnd : item.clip.duration;
                const duration = Math.max(0, end - start);

                return (
                  <div
                    key={item.clipId}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      item.includeInTimeline 
                        ? 'bg-zinc-900/90 border-zinc-800 hover:border-amber-500/40 shadow-lg' 
                        : 'bg-zinc-950/60 border-zinc-800/40 opacity-50'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      
                      {/* Left: Reorder, Number & Thumbnail */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        <div className="flex flex-col gap-0.5 items-center shrink-0">
                          <button
                            onClick={() => handleMoveOrder(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Przesuń wcześniej"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-[11px] font-bold text-amber-300 font-mono shadow-inner">
                            {index + 1}
                          </span>
                          <button
                            onClick={() => handleMoveOrder(index, 'down')}
                            disabled={index === sequencedItems.length - 1}
                            className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Przesuń później"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Thumbnail / Video icon */}
                        <div className="w-20 h-14 rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden relative shrink-0 flex items-center justify-center shadow-inner">
                          {item.clip.thumbnailUrl ? (
                            <img src={item.clip.thumbnailUrl} alt={item.clip.name} className="w-full h-full object-cover" />
                          ) : (
                            <FileVideo className="w-6 h-6 text-zinc-500" />
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[9px] font-mono text-white">
                            {Math.round(duration)}s
                          </span>
                        </div>

                        {/* Middle: Title, Captions & Controls */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catInfo.color}`}>
                              {catInfo.icon} {catInfo.label}
                            </span>
                            {item.emotion && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                🎭 {item.emotion}
                              </span>
                            )}
                            {item.timeOfDay && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
                                ☀️ {item.timeOfDay}
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Oryginał: {item.clip.name}
                            </span>
                          </div>

                          {/* Editable Smart Title */}
                          <input
                            type="text"
                            value={item.smartTitle}
                            onChange={(e) => handleUpdateItem(item.clipId, { smartTitle: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-semibold focus:border-indigo-500 focus:outline-none"
                            placeholder="Tytuł ujęcia..."
                          />

                          {/* Editable Subtitle Caption */}
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <span className="text-[10px] uppercase font-bold text-amber-400/90 shrink-0">Podpis:</span>
                            <input
                              type="text"
                              value={item.subtitleCaption}
                              onChange={(e) => handleUpdateItem(item.clipId, { subtitleCaption: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800/80 rounded-md px-2 py-0.5 text-[11px] text-amber-200 italic focus:border-amber-500 focus:outline-none"
                              placeholder="Podpis narracyjny..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right: Trimming, Transitions & Toggle */}
                      <div className="flex flex-wrap lg:flex-col items-center sm:items-end justify-between sm:justify-end gap-2 shrink-0 border-t lg:border-t-0 border-zinc-800 pt-2 lg:pt-0 w-full lg:w-auto">
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800 text-[11px]">
                            <Scissors className="w-3 h-3 text-amber-400" />
                            <span className="text-zinc-400">Cięcie:</span>
                            <span className="font-mono text-amber-300">{start.toFixed(1)}s - {end.toFixed(1)}s</span>
                          </div>

                          <select
                            value={item.transition}
                            onChange={(e) => handleUpdateItem(item.clipId, { transition: e.target.value })}
                            className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-[11px] text-zinc-300 focus:border-indigo-500"
                          >
                            <option value="dissolve">Przenikanie (Dissolve)</option>
                            <option value="cut">Cięcie proste (Cut)</option>
                            <option value="dip_black">Przez czerń (Dip Black)</option>
                            <option value="dip_white">Przez biel (Dip White)</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.clip.objectUrl && (
                            <button
                              onClick={() => setPreviewClip({
                                url: item.clip.objectUrl!,
                                title: item.smartTitle,
                                caption: item.subtitleCaption
                              })}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                              title="Odtwórz podgląd z podpisem"
                            >
                              <Play className="w-3 h-3" />
                              <span className="text-[10px]">Podgląd</span>
                            </button>
                          )}

                          <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 hover:border-zinc-700">
                            <input
                              type="checkbox"
                              checked={item.includeInTimeline}
                              onChange={(e) => handleUpdateItem(item.clipId, { includeInTimeline: e.target.checked })}
                              className="accent-amber-500 rounded"
                            />
                            <span>Dołącz do filmu</span>
                          </label>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApplyCaptions}
              disabled={isLoading || sequencedItems.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs font-bold text-[#FDE047] hover:bg-zinc-800 hover:border-amber-400/50 transition-all cursor-pointer shadow-sm"
              title="Zaktualizuj nazwy, kategorie i podpisy w bibliotece ujęć"
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>Zastosuj Podpisy w Bibliotece</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleApplyAllDirectorOptionsAtOnce('montage')}
              disabled={isLoading || sequencedItems.length === 0}
              className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-zinc-950 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_4px_24px_rgba(245,158,11,0.35)] transition-all hover:scale-105 active:scale-95"
              title="Wszystkie opcje reżyserskie naraz: wstępna karta, chronologia, karty scen, napisy, podziękowania i muzyka"
            >
              <Sparkles className="w-4 h-4 fill-zinc-950" />
              <span>REŻYSER MASTER: SCAL I PODPISZ (WSZYSTKO W 1 KLIKNIĘCIU)</span>
            </button>

            <button
              onClick={handleMergeAndExportDirectly}
              disabled={isLoading || sequencedItems.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/50 text-xs font-bold text-amber-300 cursor-pointer transition-all shadow-md active:scale-95"
              title="Scal wszystkie ujęcia z wybranymi dodatkami i przejdź bezpośrednio do okna eksportu"
            >
              <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>Scal & Eksportuj</span>
            </button>
          </div>
        </div>

      </div>

      {/* Mini Video Preview Modal with Caption Overlay */}
      {previewClip && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-[#110E09] border border-[#D4AF37]/50 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-[#2A2214] flex items-center justify-between bg-[#19150E]">
              <span className="text-xs font-bold text-[#FDE047]">{previewClip.title}</span>
              <button onClick={() => setPreviewClip(null)} className="p-1 text-[#8C7E64] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src={previewClip.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
              
              {/* Caption Overlay */}
              <div className="absolute bottom-6 inset-x-6 text-center pointer-events-none">
                <span className="bg-black/75 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-lg text-xs md:text-sm font-serif-luxury text-white italic drop-shadow-md inline-block max-w-lg">
                  "{previewClip.caption}"
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
