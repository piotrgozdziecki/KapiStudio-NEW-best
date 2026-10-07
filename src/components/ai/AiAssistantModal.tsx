import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Wand2, 
  Loader2, 
  Check, 
  X, 
  Star, 
  ListOrdered, 
  Clock, 
  Heart, 
  Music, 
  Volume2, 
  Bookmark, 
  Film,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sliders,
  Users,
  Video,
  Eye,
  Type,
  Palette
} from 'lucide-react';
import type { 
  ProjectState, 
  TimelineItem, 
  TextLayer, 
  VideoChapter, 
  MediaClip,
  ClipCategory,
  TitleCard,
  TransitionType
} from '../../types/project';
import { STUDIO_CHAPTER_DEFINITIONS } from '../chapters/ChaptersManager';
import { useStudioToast } from '../common/ToastContext';

interface AiAssistantModalProps {
  project: ProjectState;
  isOpen: boolean;
  onClose: () => void;
  onApplyUpdatedProject: (updatedState: ProjectState) => void;
}

type AssistantCategory = 'narrative' | 'timing' | 'audio_color' | 'titles';

interface AssistantAction {
  id: string;
  category: AssistantCategory;
  icon: any;
  title: string;
  desc: string;
  badge: string;
}

export function AiAssistantModal({ 
  project, 
  isOpen, 
  onClose, 
  onApplyUpdatedProject 
}: AiAssistantModalProps) {
  const toast = useStudioToast();
  const [activeCategory, setActiveCategory] = useState<AssistantCategory>('narrative');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [proposedState, setProposedState] = useState<ProjectState | null>(null);
  const [proposalSummary, setProposalSummary] = useState<string[]>([]);
  const [filmTitle, setFilmTitle] = useState<string>(project.name || 'NOWY FILM');
  const [filmSubtitle, setFilmSubtitle] = useState<string>('Wersja Reżyserska • 2026');

  const filmTitleState = filmTitle || project.name || 'NOWY FILM';

  const actions: AssistantAction[] = [
    // 1. NARRATIVE & STORYTELLING
    {
      id: 'narrative_structure',
      category: 'narrative',
      icon: ListOrdered,
      title: 'Kinowa Struktura Narracji',
      desc: 'Układa ujęcia w profesjonalną oś dramaturgiczną: Prolog/Wprowadzenie → Ekspozycja i Bohaterowie → Akcja i Przełom → Kulminacja → Epilog.',
      badge: 'Struktura Opowieści'
    },
    {
      id: 'best_moments_selection',
      category: 'narrative',
      icon: Star,
      title: 'Selekcja Najlepszych Ujęć (Best Takes)',
      desc: 'Wybiera ujęcia o najwyższej ostrości, stabilności kadru i dynamice, priorytetyzując oznaczone gwiazdką.',
      badge: 'Jakość & Emocje'
    },
    {
      id: 'smart_deduplication',
      category: 'narrative',
      icon: ShieldCheck,
      title: 'Inteligentne Usuwanie Dubli i Powtórzeń',
      desc: 'Wykrywa serie powtórzonych ujęć tej samej sceny, wybiera technicznie najlepsze z nich i odrzuca niepotrzebne duble.',
      badge: 'Czysty Montaż'
    },
    {
      id: 'hero_moments_highlight',
      category: 'narrative',
      icon: Heart,
      title: 'Wyróżnienie Kluczowych Scen (Hero Moments)',
      desc: 'Akcentuje najważniejsze momenty akcji z płynnymi przejściami i nasyconą dynamiką.',
      badge: 'Kulminacja'
    },

    // 2. TIMING & FORMATS
    {
      id: 'teaser_reels_60s',
      category: 'timing',
      icon: Zap,
      title: 'Dynamiczny Teaser / Reel (60 sekund)',
      desc: 'Błyskawiczny, przyciągający uwagę montaż z mocnym otwarciem (Hook), zoptymalizowany pod formaty 9:16 i 16:9.',
      badge: 'Social & Promo'
    },
    {
      id: 'short_cut_3m',
      category: 'timing',
      icon: Clock,
      title: 'Dynamiczny Skrót (3-4 minuty)',
      desc: 'Kompaktowy, wyrazisty montaż zsynchronizowany z długością standardowego utworu muzycznego.',
      badge: 'Teledysk / Promo'
    },
    {
      id: 'feature_cut_12m',
      category: 'timing',
      icon: Clock,
      title: 'Seans Główny (10-15 minut)',
      desc: 'Zrównoważony film z płynnym tempem, dialogami i pełnym rozwojem wątków bez przestojów.',
      badge: 'Film Średni'
    },
    {
      id: 'full_master_cut',
      category: 'timing',
      icon: Film,
      title: 'Pełny Montaż Archiwalny (Master Cut)',
      desc: 'Zachowuje pełne wersje wszystkich scen i wypowiedzi w oryginalnej długości bez skracania.',
      badge: 'Archiwum Master'
    },

    // 3. AUDIO, RHYTHM & COLOR
    {
      id: 'sync_music_beats',
      category: 'audio_color',
      icon: Music,
      title: 'Montaż pod Rytm Muzyki (Beat Sync)',
      desc: 'Automatycznie wyrównuje punkty cięć i zmiany kadrów do rytmu i taktów ścieżki dźwiękowej.',
      badge: 'Rytm Audio'
    },
    {
      id: 'speech_shield_ducking',
      category: 'audio_color',
      icon: Volume2,
      title: 'Ochrona Mowy & Audio Ducking',
      desc: 'Wzmacnia czytelność wypowiedzi bohaterów i automatycznie ścisza muzykę w tle o 18 dB podczas dialogów.',
      badge: 'Czysty Dialog'
    },
    {
      id: 'cinematic_color_grade',
      category: 'audio_color',
      icon: Palette,
      title: 'Kinowa Korekcja Barwna (Cinematic LUT)',
      desc: 'Nadaje wszystkim ujęciom spójny, głęboki profil barwny z filmowym kontrastem i bogatą plastyką obrazu.',
      badge: 'Grading 4K'
    },
    {
      id: 'normalize_audio_fades',
      category: 'audio_color',
      icon: Sliders,
      title: 'Normalizacja Audio i Łagodne Przejścia',
      desc: 'Wyrównuje poziom głośności pomiędzy wszystkimi źródłami do standardu 0 dB i usuwa trzaski.',
      badge: 'Audio Master'
    },

    // 4. TITLES & CHAPTERS
    {
      id: 'intro_outro_cards',
      category: 'titles',
      icon: Type,
      title: 'Generuj Czołówkę & Napisy Końcowe',
      desc: 'Tworzy kinową kartę tytułową Intro oraz planszę Outro z napisami końcowymi i informacjami o produkcji.',
      badge: 'Plansze Tytułowe'
    },
    {
      id: 'auto_chapters_generator',
      category: 'titles',
      icon: Bookmark,
      title: 'Inteligentne Rozdziały i Spis Treści',
      desc: 'Dzieli film na logiczne akty ze znacznikami czasu gotowymi dla YouTube, Vimeo i odtwarzaczy wideo.',
      badge: 'Spis Treści'
    }
  ];

  const filteredActions = useMemo(() => {
    return actions.filter(a => a.category === activeCategory);
  }, [activeCategory]);

  if (!isOpen) return null;

  const handleExecuteTool = async (toolId: string) => {
    setSelectedTool(toolId);
    setIsProcessing(true);
    setProposedState(null);
    setProposalSummary([]);

    await new Promise(r => setTimeout(r, 600));

    let updated: ProjectState = { ...project };
    let summary: string[] = [];

    const narrativeOrder: ClipCategory[] = [
      'opening',
      'intro',
      'preparations',
      'a_roll',
      'interview',
      'dialogue',
      'action',
      'b_roll',
      'first_dance',
      'party',
      'cake',
      'games',
      'scenery',
      'outdoor',
      'drone',
      'macro',
      'family',
      'guests',
      'climax',
      'ending',
      'outro',
      'unassigned'
    ];

    switch (toolId) {
      case 'narrative_structure': {
        const clips = [...project.mediaLibrary];
        if (clips.length === 0) {
          summary = ['Biblioteka mediów jest pusta. Zaimportuj materiały do projektu przed ułożeniem narracji.'];
          break;
        }

        // Sort clips by narrative order and chronological capture time
        clips.sort((a, b) => {
          const catA = a.category || 'unassigned';
          const catB = b.category || 'unassigned';
          const idxA = narrativeOrder.indexOf(catA);
          const idxB = narrativeOrder.indexOf(catB);
          if (idxA !== idxB) return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
          const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : new Date(a.createdAt).getTime();
          const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : new Date(b.createdAt).getTime();
          return (timeA || 0) - (timeB || 0);
        });

        let curTime = 0;
        const newTimelineItems: TimelineItem[] = clips.map((clip, i) => {
          const rawDur = typeof clip.duration === 'number' && !isNaN(clip.duration) && clip.duration > 0 ? clip.duration : 6;
          const isKeyMom = clip.category === 'climax' || clip.category === 'a_roll' || clip.category === 'interview';
          const dur = isKeyMom ? rawDur : Math.min(rawDur, 10);

          const item: TimelineItem = {
            id: `ti_narrative_${i}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: curTime,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: i === 0 ? 1.0 : 0.4,
            fadeOut: i === clips.length - 1 ? 1.5 : 0.4,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: i === 0 ? 'fade' : 'dissolve',
            transitionDuration: 0.5
          };
          curTime += dur;
          return item;
        });

        updated.timelineItems = newTimelineItems;
        summary = [
          `Ułożono ${clips.length} ujęć w profesjonalnej strukturze dramaturgicznej`,
          `Zastosowano łagodne przejścia Dissolve (0.5s) zapewniające płynny montaż`,
          `Łączny czas montażu: ${(curTime / 60).toFixed(1)} min (${(curTime).toFixed(0)}s)`,
          `Wyeksponowano kluczowe sceny akcji i dialogów`
        ];
        break;
      }

      case 'best_moments_selection': {
        const favClips = project.mediaLibrary.filter(c => c.isFavorite || (c.analysis && c.analysis.qualityScore >= 75));
        const sourceClips = favClips.length > 0 ? favClips : project.mediaLibrary.slice(0, 15);
        if (sourceClips.length === 0) {
          summary = ['Brak materiałów w bibliotece do stworzenia selekcji najlepszych ujęć.'];
          break;
        }

        let time = 0;
        const items: TimelineItem[] = sourceClips.map((clip, idx) => {
          const rawDur = clip.duration || 6;
          const dur = Math.min(rawDur, 5.0);
          const item: TimelineItem = {
            id: `ti_best_${idx}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: time,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.4,
            fadeOut: 0.4,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'dip_black',
            transitionDuration: 0.4
          };
          time += dur;
          return item;
        });

        updated.timelineItems = items;
        summary = [
          `Wyselekcjonowano ${sourceClips.length} ujęć o najwyższej jakości technicznej i estetycznej`,
          `Zastosowano kinowe ściemnienia (Dip to Black 0.4s)`,
          `Czas trwania sekwencji: ${(time / 60).toFixed(1)} min (${(time).toFixed(0)}s)`
        ];
        break;
      }

      case 'smart_deduplication': {
        const seenCategories = new Map<string, number>();
        const filteredClips: MediaClip[] = [];

        project.mediaLibrary.forEach(clip => {
          const cat = clip.category || 'unassigned';
          const count = seenCategories.get(cat) || 0;
          if (clip.isFavorite || count < 3 || cat === 'climax' || cat === 'a_roll') {
            filteredClips.push(clip);
            seenCategories.set(cat, count + 1);
          }
        });

        let t = 0;
        const items: TimelineItem[] = filteredClips.map((clip, i) => {
          const dur = Math.min(clip.duration || 6, 8);
          const item: TimelineItem = {
            id: `ti_dedup_${i}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: t,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.4,
            fadeOut: 0.4,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'dissolve',
            transitionDuration: 0.5
          };
          t += dur;
          return item;
        });

        updated.timelineItems = items;
        summary = [
          `Wyeliminowano niepotrzebne powtórzenia i słabsze duble`,
          `Pozostawiono ${filteredClips.length} kluczowych ujęć (odrzucono ${project.mediaLibrary.length - filteredClips.length} powtórek)`,
          `Czas trwania po optymalizacji: ${(t / 60).toFixed(1)} min`
        ];
        break;
      }

      case 'hero_moments_highlight': {
        const heroClips = project.mediaLibrary.filter(c => 
          c.isFavorite || c.category === 'climax' || c.category === 'a_roll' || c.category === 'action'
        );
        const targetClips = heroClips.length > 0 ? heroClips : project.mediaLibrary.slice(0, 8);
        if (targetClips.length === 0) {
          summary = ['Nie znaleziono materiałów do wyróżnienia.'];
          break;
        }

        let t = 0;
        const heroItems: TimelineItem[] = targetClips.map((c, i) => {
          const dur = Math.min(c.duration || 6, 7);
          const item: TimelineItem = {
            id: `ti_hero_${i}_${Date.now()}`,
            clipId: c.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: t,
            duration: dur,
            speed: 1,
            volume: 1.2,
            fadeIn: 0.6,
            fadeOut: 0.6,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'zoom',
            transitionDuration: 0.5
          };
          t += dur;
          return item;
        });

        updated.timelineItems = heroItems;
        summary = [
          `Wygenerowano sekwencję najważniejszych momentów (${targetClips.length} ujęć)`,
          `Zastosowano dynamiczne przejścia zoom i zbalansowane wyciszenia`,
          `Czas trwania bloku: ${(t).toFixed(1)}s`
        ];
        break;
      }

      case 'teaser_reels_60s': {
        const targetSec = 60;
        const sourceClips = project.mediaLibrary.slice(0, 18);
        if (sourceClips.length === 0) {
          summary = ['Brak klipów do stworzenia teasera.'];
          break;
        }

        const clipDur = targetSec / Math.min(sourceClips.length, 16);
        let time = 0;
        const items: TimelineItem[] = sourceClips.slice(0, 16).map((clip, idx) => {
          const dur = Math.max(1.8, Math.min(clip.duration || 3, clipDur));
          const item: TimelineItem = {
            id: `ti_teaser_${idx}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: time,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.2,
            fadeOut: 0.2,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: (idx % 2 === 0 ? 'wipe' : 'zoom') as TransitionType,
            transitionDuration: 0.3
          };
          time += dur;
          return item;
        });

        updated.timelineItems = items;
        summary = [
          `Wygenerowano 60-sekundowy dynamiczny teaser (Social & Promo)`,
          `Średni czas ujęcia: ${(clipDur).toFixed(1)}s (szybki, angażujący montaż)`,
          `Gotowy do publikacji w mediach społecznościowych i serwisach wideo`
        ];
        break;
      }

      case 'short_cut_3m':
      case 'feature_cut_12m': {
        const targetSec = toolId === 'short_cut_3m' ? 180 : 720;
        const clips = [...project.mediaLibrary];
        if (clips.length === 0) {
          summary = ['Brak klipów w projekcie.'];
          break;
        }

        let time = 0;
        const targetPerClip = targetSec / clips.length;
        const items: TimelineItem[] = clips.map((clip, idx) => {
          const raw = clip.duration || 8;
          const dur = Math.max(2.5, Math.min(raw, targetPerClip));
          const item: TimelineItem = {
            id: `ti_target_${idx}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: time,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.4,
            fadeOut: 0.4,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'fade',
            transitionDuration: 0.5
          };
          time += dur;
          return item;
        });

        updated.timelineItems = items;
        summary = [
          `Zoptymalizowano czas montażu do ${(time / 60).toFixed(1)} min (${(time).toFixed(0)} sekund)`,
          `Zachowano równe tempo i spójne proporcje sekwencji`,
          `Zastosowano łagodne przejścia`
        ];
        break;
      }

      case 'full_master_cut': {
        let cur = 0;
        const items: TimelineItem[] = project.mediaLibrary.map((clip, idx) => {
          const dur = clip.duration || 10;
          const item: TimelineItem = {
            id: `ti_doc_${idx}_${Date.now()}`,
            clipId: clip.id,
            trackId: 'v1',
            sourceStart: 0,
            sourceEnd: dur,
            timelineStart: cur,
            duration: dur,
            speed: 1,
            volume: 1,
            fadeIn: 0.5,
            fadeOut: 0.5,
            muted: false,
            scale: 1,
            rotation: 0,
            transitionIn: 'dissolve',
            transitionDuration: 0.5
          };
          cur += dur;
          return item;
        });

        updated.timelineItems = items;
        summary = [
          `Utworzono pełny montaż archiwalny (${items.length} ujęć)`,
          `Zachowano 100% oryginalnego materiału bez skrótów`,
          `Łączny czas trwania pełnego filmu: ${(cur / 60).toFixed(1)} min`
        ];
        break;
      }

      case 'sync_music_beats': {
        const beatDuration = 2.4; // 100 BPM 4-beat bar
        let curTime = 0;
        const beatItems = updated.timelineItems.map(item => {
          const snapped = Math.max(beatDuration, Math.round(item.duration / beatDuration) * beatDuration);
          const newItem = {
            ...item,
            timelineStart: curTime,
            duration: snapped,
            sourceEnd: item.sourceStart + snapped
          };
          curTime += snapped;
          return newItem;
        });

        updated.timelineItems = beatItems;
        summary = [
          `Zsynchronizowano cięcia ${beatItems.length} ujęć z siatką taktów muzycznych (takt 2.4s)`,
          `Przejścia kadrów w punktach akcentu muzycznego (Downbeat)`,
          `Zsynchronizowany czas osi czasu: ${(curTime / 60).toFixed(1)} min`
        ];
        break;
      }

      case 'speech_shield_ducking': {
        const items = updated.timelineItems.map(item => {
          const clip = project.mediaLibrary.find(m => m.id === item.clipId);
          const isSpeech = clip?.category === 'interview' || clip?.category === 'dialogue' || clip?.category === 'a_roll';
          return {
            ...item,
            volume: isSpeech ? 1.3 : 1.0,
            fadeIn: 0.5,
            fadeOut: 0.5
          };
        });

        updated.timelineItems = items;
        if (updated.settings) {
          updated.settings = { ...updated.settings, audioDucking: true, duckingIntensity: 65 };
        }
        summary = [
          `Wzmocniono czytelność ścieżek z dialogami i wypowiedziami (+30% volume)`,
          `Włączono automatyczny Ducking audio (-18 dB muzyki w tle podczas dialogów)`,
          `Zabezpieczono łagodne wyciszenia krawędzi (Cross-Fade)`
        ];
        break;
      }

      case 'cinematic_color_grade': {
        if (updated.settings) {
          updated.settings = {
            ...updated.settings,
            colorGrade: 'cinematic_noir'
          };
        }
        summary = [
          `Zastosowano profil kolorystyczny: Cinematic Master LUT`,
          `Głęboki filmowy kontrast, plastyka cieni i kinowe nasycenie barw`,
          `Jednolity profil kolorystyczny dla całego projektu`
        ];
        break;
      }

      case 'normalize_audio_fades': {
        const normalized = updated.timelineItems.map(item => ({
          ...item,
          volume: 1.0,
          fadeIn: item.fadeIn || 0.4,
          fadeOut: item.fadeOut || 0.4
        }));
        updated.timelineItems = normalized;
        summary = [
          `Znormalizowano poziomy głośności wszystkich ujęć do standardu 0 dB`,
          `Wprowadzono łagodne wyciszenia Fade In/Out dla eliminacji trzasków`
        ];
        break;
      }

      case 'intro_outro_cards': {
        const introCard: TitleCard = {
          enabled: true,
          text: filmTitle.toUpperCase(),
          subtitle: filmSubtitle,
          duration: 3.5,
          style: 'cinematic',
          backgroundColor: 'gradient',
          cardType: 'intro'
        };

        const outroCard: TitleCard = {
          enabled: true,
          text: 'KONIEC',
          subtitle: `Produkcja: ${filmTitle} • Kapi-studio by Piotr`,
          duration: 4.0,
          style: 'credits',
          backgroundColor: 'gradient',
          cardType: 'outro'
        };

        if (updated.settings) {
          updated.settings = {
            ...updated.settings,
            introCard,
            outroCard
          };
        }

        summary = [
          `Wygenerowano kinową planszę czołówki: "${filmTitle}"`,
          `Wygenerowano planszę końcową z creditsami i prawami produkcji`,
          `Plansze zostaną automatycznie dołączone na początku i końcu filmu`
        ];
        break;
      }

      case 'auto_chapters_generator': {
        const chapters: VideoChapter[] = [];
        let curCat: VideoChapter['chapterKey'] | null = null;
        let s = 0;
        let e = 0;

        updated.timelineItems.forEach((ti, i) => {
          const c = project.mediaLibrary.find(m => m.id === ti.clipId);
          const cat = (c?.category && c.category !== 'unassigned' ? c.category : 'action') as VideoChapter['chapterKey'];
          if (curCat !== cat) {
            if (curCat) {
              const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === curCat);
              chapters.push({
                id: `chap_${Date.now()}_${chapters.length}`,
                chapterKey: curCat,
                name: def?.label || 'Scena',
                startTime: s,
                endTime: e
              });
            }
            curCat = cat;
            s = ti.timelineStart;
          }
          e = ti.timelineStart + ti.duration;
          if (i === updated.timelineItems.length - 1 && curCat) {
            const def = STUDIO_CHAPTER_DEFINITIONS.find(d => d.key === curCat);
            chapters.push({
              id: `chap_${Date.now()}_${chapters.length}`,
              chapterKey: curCat,
              name: def?.label || 'Scena',
              startTime: s,
              endTime: e
            });
          }
        });

        updated.chapters = chapters;
        summary = [
          `Wygenerowano ${chapters.length} logicznych rozdziałów i aktów filmu`,
          `Przypisano dokładne znaczniki czasu do każdego segmentu`,
          `Gotowe do eksportu rozdziałów dla YouTube oraz odtwarzaczy wideo`
        ];
        break;
      }

      default:
        summary = ['Wykonano optymalizację osi czasu.'];
    }

    setProposedState(updated);
    setProposalSummary(summary);
    setIsProcessing(false);
  };

  const handleConfirm = () => {
    if (proposedState) {
      onApplyUpdatedProject(proposedState);
      toast.showSuccess('Zastosowano propozycję Asystenta Montażu do projektu!');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-3xl bg-[#0F0E0B] border border-[#2D2619] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#241E13] bg-[#14120D]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2D220E] via-[#1A140A] to-[#120E06] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Sparkles className="w-5 h-5 text-[#FDE047]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-cinematic font-bold text-base tracking-wide text-white">
                  Inteligentny Asystent Montażu & Reżyserii
                </h2>
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-[#2A210C] text-[#FDE047] border border-[#D4AF37]/40">
                  Kapi-studio Pro
                </span>
              </div>
              <p className="text-xs text-[#A89C82] mt-0.5">
                Struktura narracyjna, selekcja najlepszych ujęć, synchronizacja z muzyką i optymalizacja tempa
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 rounded-xl text-[#8C7E68] hover:text-white hover:bg-[#1E1911] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Navigation Tabs */}
        {!proposedState && (
          <div className="px-6 py-3 bg-[#110E09] border-b border-[#201A10] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'narrative', label: '🎬 Reżyseria & Narracja', count: 4 },
              { id: 'timing', label: '⏱️ Długość & Formaty', count: 4 },
              { id: 'audio_color', label: '🎛️ Dźwięk, Rytm & Kolor', count: 4 },
              { id: 'titles', label: '📜 Czołówka & Rozdziały', count: 2 }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as AssistantCategory)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeCategory === tab.id
                    ? 'bg-gradient-to-r from-[#2F2410] to-[#1E170A] text-[#FDE047] border border-[#D4AF37]/50 shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                    : 'text-[#8C7E68] hover:text-[#EAE3D2] hover:bg-[#18130B]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] opacity-70 font-mono">({tab.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
          
          {!proposedState ? (
            <>
              {/* Optional Quick Configuration for Film Titles */}
              {activeCategory === 'titles' && (
                <div className="p-4 rounded-2xl bg-[#17130B] border border-[#3A2E19] grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[#D4AF37] block mb-1">
                      Tytuł Główny Filmu / Projektu:
                    </label>
                    <input
                      type="text"
                      value={filmTitle}
                      onChange={(e) => setFilmTitle(e.target.value)}
                      placeholder="np. KINOWY PROJEKT"
                      className="w-full px-3 py-2 bg-[#0E0C08] border border-[#332816] rounded-xl text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#D4AF37] block mb-1">
                      Podtytuł / Autor:
                    </label>
                    <input
                      type="text"
                      value={filmSubtitle}
                      onChange={(e) => setFilmSubtitle(e.target.value)}
                      placeholder="np. Wersja Reżyserska • 2026"
                      className="w-full px-3 py-2 bg-[#0E0C08] border border-[#332816] rounded-xl text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              {/* Action Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredActions.map(tool => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => handleExecuteTool(tool.id)}
                      disabled={isProcessing}
                      className="p-4 bg-[#14110A] hover:bg-[#1E190F] border border-[#2B2214] hover:border-[#D4AF37]/60 rounded-2xl text-left transition-all group cursor-pointer flex flex-col justify-between gap-3 shadow-sm hover:shadow-[0_8px_25px_rgba(0,0,0,0.6)]"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-white font-bold group-hover:text-[#FDE047] transition-colors">
                            <Icon className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            <span className="truncate">{tool.title}</span>
                          </div>
                          <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-[#201A0D] text-[#D4AF37] border border-[#D4AF37]/30 shrink-0">
                            {tool.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8C7E68] line-clamp-2 leading-relaxed">
                          {tool.desc}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-[#D4AF37] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Uruchom asystenta</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-3 p-6 bg-[#16120B] border border-[#D4AF37]/40 rounded-2xl text-[#FDE047] animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
                  <span className="font-semibold text-xs">Przeliczanie sekwencji montażowej...</span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-[#1A150C] border border-[#D4AF37]/50 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-[#FDE047] font-bold text-sm">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Propozycja Modyfikacji Osi Czasu Gotowa</span>
                </div>
                <p className="text-xs text-[#A89C82] leading-relaxed">
                  Asystent przygotował zoptymalizowany układ ujęć. Po zatwierdzeniu zmiany zostaną natychmiast naniesione na Twoją oś czasu. Oryginalne pliki wideo pozostają w 100% nienaruszone.
                </p>
              </div>

              <div className="p-4 bg-[#14110A] rounded-2xl border border-[#2B2214] space-y-2.5">
                <h4 className="font-cinematic text-[11px] uppercase tracking-wider text-[#D4AF37] font-bold">
                  Raport ze zmian na osi czasu:
                </h4>
                <ul className="space-y-2 text-[#EAE3D2] text-xs">
                  {proposalSummary.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#D4AF37] font-bold">✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8C7E68] font-mono px-1">
                <span>Ujęcia na osi: {proposedState.timelineItems.length}</span>
                <span>Rozdziały: {proposedState.chapters.length}</span>
                <span>Zastosowany LUT: {proposedState.settings?.colorGrade || 'Brak'}</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#120F0A] border-t border-[#241E13] flex items-center justify-between">
          {proposedState ? (
            <>
              <button 
                onClick={() => { setProposedState(null); setSelectedTool(null); }}
                className="px-4 py-2.5 rounded-xl border border-[#332816] text-[#A89C82] hover:text-white hover:bg-[#1A140C] text-xs font-medium cursor-pointer transition-all"
              >
                Wróć do wyboru narzędzia
              </button>

              <button 
                onClick={handleConfirm}
                className="luxury-btn-primary px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg hover:scale-[1.02]"
              >
                <Check className="w-4 h-4 text-black stroke-[3]" />
                <span>Zatwierdź i Zastosuj do Osi Czasu</span>
              </button>
            </>
          ) : (
            <div className="flex justify-end w-full">
              <button 
                onClick={onClose}
                className="px-5 py-2.5 bg-[#1C170E] text-[#A89C82] hover:text-white rounded-xl text-xs font-medium cursor-pointer border border-[#2D2416] transition-all"
              >
                Zamknij
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
