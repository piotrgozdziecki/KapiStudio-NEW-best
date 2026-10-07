import React, { useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  User, 
  MapPin, 
  Type, 
  Film, 
  CheckCircle2, 
  X, 
  Sliders, 
  Wand2, 
  RotateCcw,
  BookOpen,
  Volume2,
  Layers,
  Music
} from 'lucide-react';
import type { 
  ProjectState, 
  TextLayer, 
  VideoChapter, 
  ColorGradingPreset, 
  TimelineItem,
  TitleCard
} from '../../types/project';
import { useStudioToast } from '../common/ToastContext';

interface ProjectNarrativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyProject: (updatedState: ProjectState) => void;
}

export type NarrativeGenre = 'cinematic' | 'documentary' | 'commercial' | 'travel' | 'event' | 'music_video';

interface NarrativeActDef {
  id: string;
  actTitle: string;
  chapterKey: string;
  title: string;
  description: string;
  badge: string;
}

const GENRE_DEFAULTS: Record<NarrativeGenre, {
  name: string;
  desc: string;
  badge: string;
  colorGrade: ColorGradingPreset;
  acts: NarrativeActDef[];
}> = {
  cinematic: {
    name: 'Kinowy Film Fabularny',
    desc: 'Klasyczna, arystotelesowska struktura 5 aktów: od intrygującego prologu po emocjonalną kulminację',
    badge: 'Kino & Dramat',
    colorGrade: 'cinematic_noir',
    acts: [
      { id: 'a1', actTitle: 'Akt I: Prolog', chapterKey: 'opening', title: 'Cienie i Światło', description: 'Tajemnicze wprowadzenie w świat i atmosferę opowieści.', badge: 'Wprowadzenie' },
      { id: 'a2', actTitle: 'Akt II: Ekspozycja', chapterKey: 'a_roll', title: 'Bohaterowie i Kontekst', description: 'Prezentacja kluczowych postaci, motywacji i scenerii.', badge: 'Rozwinięcie' },
      { id: 'a3', actTitle: 'Akt III: Punkt Zwrotny', chapterKey: 'b_roll', title: 'Nieoczekiwany Przełom', description: 'Główny punkt zwrotny zmieniający bieg wydarzeń.', badge: 'Punkt Zwrotny' },
      { id: 'a4', actTitle: 'Akt IV: Kulminacja', chapterKey: 'climax', title: 'Moment Prawdy', description: 'Maksymalne napięcie dramaturgiczne i emocjonalny szczyt.', badge: 'Szczyt Emocji' },
      { id: 'a5', actTitle: 'Akt V: Epilog', chapterKey: 'ending', title: 'Nowy Horyzont', description: 'Wyciszenie, refleksja i kinowe zamknięcie historii.', badge: 'Zamknięcie' }
    ]
  },
  documentary: {
    name: 'Dokument & Reportaż',
    desc: 'Autentyczny zapis faktów, wypowiedzi świadków i głęboki wgląd w temat',
    badge: 'Fakty & Ludzie',
    colorGrade: 'vintage_35mm',
    acts: [
      { id: 'd1', actTitle: 'Część 1: Tło Historyczne', chapterKey: 'opening', title: 'Geneza i Miejsce', description: 'Nakreślenie kontekstu i pierwszych faktów.', badge: 'Tło' },
      { id: 'd2', actTitle: 'Część 2: Główny Temat', chapterKey: 'interview', title: 'Wypowiedzi i Relacje', description: 'Głosy bohaterów, autentyczne emocje i wywiady.', badge: 'Wywiady' },
      { id: 'd3', actTitle: 'Część 3: Konfrontacja', chapterKey: 'action', title: 'Kluczowe Dowody', description: 'Główne wydarzenia ukazane z bliska.', badge: 'Akcja' },
      { id: 'd4', actTitle: 'Część 4: Podsumowanie', chapterKey: 'ending', title: 'Wnioski i Przyszłość', description: 'Podsumowanie tematu i puenta reportażu.', badge: 'Wnioski' }
    ]
  },
  commercial: {
    name: 'Spot Reklamowy & Promo',
    desc: 'Dynamiczny montaż skoncentrowany na przyciągnięciu uwagi (Hook 3s, Problem, Rozwiązanie, CTA)',
    badge: 'Marketing & Marka',
    colorGrade: 'vivid_master',
    acts: [
      { id: 'c1', actTitle: 'Sekwencja 1: Hook (0-3s)', chapterKey: 'opening', title: 'Zatrzymaj Wzrok', description: 'Mocne, hipnotyzujące pierwsze ujęcie budzące ciekawość.', badge: 'Hook' },
      { id: 'c2', actTitle: 'Sekwencja 2: Problem i Wyzwanie', chapterKey: 'b_roll', title: 'Dlaczego to ma znaczenie', description: 'Ukazanie wyzwania, które rozwiązuje produkt.', badge: 'Problem' },
      { id: 'c3', actTitle: 'Sekwencja 3: Rozwiązanie w Akcji', chapterKey: 'action', title: 'Innowacja w Praktyce', description: 'Dynamiczna prezentacja zalet i unikalnych cech.', badge: 'Rozwiązanie' },
      { id: 'c4', actTitle: 'Sekwencja 4: Call to Action', chapterKey: 'ending', title: 'Działaj Teraz', description: 'Jasne wezwanie do działania i logo marki.', badge: 'CTA' }
    ]
  },
  travel: {
    name: 'Dziennik Podróży & Vlog',
    desc: 'Malownicze krajobrazy, dynamika przygody i autentyczne chwile z drogi',
    badge: 'Przygoda & Natura',
    colorGrade: 'golden_hour',
    acts: [
      { id: 't1', actTitle: 'Dzień 1: Wyruszamy', chapterKey: 'opening', title: 'Kierunek: Nieznane', description: 'Przygotowania, podróż i pierwsze wrażenia z lądowania.', badge: 'Początek' },
      { id: 't2', actTitle: 'Dzień 2: Serce Krajobrazu', chapterKey: 'scenery', title: 'Majestat Natury', description: 'Szerokie panoramy, ujęcia z drona i lokalny klimat.', badge: 'Krajobraz' },
      { id: 't3', actTitle: 'Dzień 3: Złota Godzina', chapterKey: 'b_roll', title: 'Ciepło Zachodu Słońca', description: 'Niezapomniane chwile w najpiękniejszym świetle dnia.', badge: 'Golden Hour' },
      { id: 't4', actTitle: 'Dzień 4: Pożegnanie z Miejscem', chapterKey: 'ending', title: 'Wspomnienia na Zawsze', description: 'Ostatnie spojrzenie i droga powrotna.', badge: 'Powrót' }
    ]
  },
  music_video: {
    name: 'Teledysk Muzyczny & Performance',
    desc: 'Dynamiczny montaż zsynchronizowany z rytmem, ujęcia artystyczne i ekspresja wizualna',
    badge: 'Rytm & Ekspresja',
    colorGrade: 'cinematic_noir',
    acts: [
      { id: 'm1', actTitle: 'Zwrotka 1: Wprowadzenie', chapterKey: 'opening', title: 'Intro & Solo', description: 'Budowanie nastroju, zbliżenia i intymna atmosfera.', badge: 'Wstęp' },
      { id: 'm2', actTitle: 'Refren 1: Eksplozja Energii', chapterKey: 'action', title: 'Główny Motyw', description: 'Maksymalny ruch, dynamiczne cięcia na beat i choreografia.', badge: 'Energia' },
      { id: 'm3', actTitle: 'Bridge / Solo: Zmiana Tempa', chapterKey: 'b_roll', title: 'Przebitka Koncepcyjna', description: 'Slow-motion, detale światła i zmiana perspektywy.', badge: 'Kontrast' },
      { id: 'm4', actTitle: 'Wielki Finał: Kulminacja', chapterKey: 'climax', title: 'Wszystkie Światła', description: 'Maksymalna ekspresja, pełna sekwencja i mocny akord końcowy.', badge: 'Finał' }
    ]
  },
  event: {
    name: 'Gala & Prestiżowe Wydarzenie',
    desc: 'Elegancka relacja z prestiżowego wydarzenia, jubileuszu, konferencji lub uroczystości',
    badge: 'Prestiż & Relacja',
    colorGrade: 'golden_hour',
    acts: [
      { id: 'e1', actTitle: 'Część I: Przybycie Gości', chapterKey: 'opening', title: 'Czerwony Dywan', description: 'Uroczyste powitanie, ścianka i powitalne toasty.', badge: 'Welcome' },
      { id: 'e2', actTitle: 'Część II: Kulminacja i Wystąpienia', chapterKey: 'a_roll', title: 'Główne Przemówienia', description: 'Inspirujące słowa, nagrody i uroczysty moment.', badge: 'Scena' },
      { id: 'e3', actTitle: 'Część III: Energia i Zabawa', chapterKey: 'action', title: 'Nieformalna Atmosfera', description: 'Networking, muzyka, bankiet i uśmiechy gości.', badge: 'Atmosfera' },
      { id: 'e4', actTitle: 'Część IV: Finał', chapterKey: 'ending', title: 'Kulminacja Wieczoru', description: 'Finałowy toast, światła i pamiątkowe zakończenie.', badge: 'Finał' }
    ]
  }
};

export function ProjectNarrativeModal({
  isOpen,
  onClose,
  project,
  onApplyProject
}: ProjectNarrativeModalProps) {
  const toast = useStudioToast();

  const [projectTitle, setProjectTitle] = useState(project.name || 'Nowy Film');
  const [authorName, setAuthorName] = useState('Studio Produkcyjne');
  const [tagline, setTagline] = useState('Wersja Reżyserska 2026');
  const [selectedGenre, setSelectedGenre] = useState<NarrativeGenre>('cinematic');

  const [acts, setActs] = useState<NarrativeActDef[]>(GENRE_DEFAULTS.cinematic.acts);

  // Switch genre updates acts
  const handleSelectGenre = (genre: NarrativeGenre) => {
    setSelectedGenre(genre);
    setActs(GENRE_DEFAULTS[genre].acts);
  };

  const handleUpdateAct = (index: number, field: keyof NarrativeActDef, value: string) => {
    const copy = [...acts];
    copy[index] = { ...copy[index], [field]: value };
    setActs(copy);
  };

  if (!isOpen) return null;

  const handleApplyToProject = () => {
    const totalClips = project.timelineItems.length > 0 
      ? project.timelineItems 
      : project.mediaLibrary;

    const totalDur = totalClips.reduce((acc, c) => acc + (c.duration || 0), 0);
    const actInterval = totalDur > 0 ? totalDur / Math.max(1, acts.length) : 10;

    // Generate Chapters
    const newChapters: VideoChapter[] = acts.map((act, idx) => ({
      id: `chap_${Date.now()}_${idx}`,
      chapterKey: act.chapterKey,
      name: `${act.actTitle} • ${act.title}`,
      startTime: Number((idx * actInterval).toFixed(1)),
      endTime: Number(((idx + 1) * actInterval).toFixed(1)),
      description: act.description
    }));

    // Generate Text Layers for lower thirds & act titles
    const newTextLayers: TextLayer[] = acts.map((act, idx) => ({
      id: `txt_${Date.now()}_${idx}`,
      text: act.title,
      type: idx === 0 ? 'title' : 'chapter',
      style: 'cinematic',
      timelineStart: Number((idx * actInterval + 0.5).toFixed(1)),
      duration: 3.5,
      position: { x: 0.5, y: 0.82 },
      fontSize: 32,
      fontWeight: '600',
      color: '#FFFFFF',
      outlineColor: 'rgba(0,0,0,0.8)',
      outlineWidth: 2,
      shadow: true,
      animation: 'fade'
    }));

    // Generate cinematic Intro Title Card
    const introCard: TitleCard = {
      enabled: true,
      text: projectTitle.toUpperCase(),
      subtitle: `${authorName} • ${tagline}`,
      duration: 3.5,
      style: 'cinematic',
      backgroundColor: '#0a0d14',
      cardType: 'intro',
      animation: 'fade'
    };

    // Generate Outro Card
    const outroCard: TitleCard = {
      enabled: true,
      text: 'FIN',
      subtitle: `Realizacja i Postprodukcja: ${authorName}`,
      duration: 4.0,
      style: 'classic',
      backgroundColor: '#000000',
      cardType: 'outro',
      animation: 'fade'
    };

    const currentGenreDef = GENRE_DEFAULTS[selectedGenre];

    const updatedProject: ProjectState = {
      ...project,
      name: projectTitle,
      chapters: newChapters,
      textLayers: [...(project.textLayers || []), ...newTextLayers],
      settings: {
        ...project.settings,
        colorGrade: currentGenreDef.colorGrade,
        introCard,
        outroCard
      }
    };

    onApplyProject(updatedProject);
    toast.showSuccess(`Zastosowano kinową strukturę (${currentGenreDef.name}) z ${acts.length} aktami!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-zinc-100">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-heading">
                  Kreator Narracji i Struktury Filmowej
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Uniwersalny Reżyser
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Wybierz gatunek i styl, aby wygenerować profesjonalną strukturę aktów, plansze tytułowe i LUT barwny
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-zinc-950">
          
          {/* Genre selector grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              1. Wybierz Gatunek i Styl Narracji
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.keys(GENRE_DEFAULTS) as NarrativeGenre[]).map((genreKey) => {
                const def = GENRE_DEFAULTS[genreKey];
                const isSelected = selectedGenre === genreKey;
                return (
                  <button
                    key={genreKey}
                    type="button"
                    onClick={() => handleSelectGenre(genreKey)}
                    className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                        {def.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {def.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {def.desc}
                    </p>
                    {isSelected && (
                      <div className="absolute bottom-0 right-0 w-8 h-8 bg-amber-500/20 rounded-tl-xl flex items-center justify-center text-amber-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project branding */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Type className="w-4 h-4 text-amber-400" />
              2. Tytuł Dzieła & Informacje o Twórcach (Plansza Początkowa)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Główny Tytuł Filmu</span>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="np. KRONIKI MISTRZÓW"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Autor / Studio Produkcyjne</span>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="np. Kapi-Studio Production"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Podtytuł / Hasło / Rok</span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="np. Wersja Reżyserska 2026"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Acts and chapters editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                3. Struktura Aktów i Rozdziałów ({acts.length} części)
              </label>
              <button
                type="button"
                onClick={() => setActs(GENRE_DEFAULTS[selectedGenre].acts)}
                className="text-[11px] text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Przywróć domyślne dla gatunku
              </button>
            </div>

            <div className="space-y-2.5">
              {acts.map((act, index) => (
                <div 
                  key={act.id}
                  className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between"
                >
                  <div className="flex items-center gap-3 w-full sm:w-1/3">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={act.title}
                      onChange={(e) => handleUpdateAct(index, 'title', e.target.value)}
                      placeholder="Nazwa aktu..."
                      className="bg-transparent text-xs font-bold text-white border-b border-transparent hover:border-zinc-700 focus:border-amber-400 focus:outline-none w-full py-0.5"
                    />
                  </div>

                  <div className="flex-1 w-full sm:w-auto">
                    <input
                      type="text"
                      value={act.description}
                      onChange={(e) => handleUpdateAct(index, 'description', e.target.value)}
                      placeholder="Krótki opis dramaturgiczny..."
                      className="bg-transparent text-[11px] text-zinc-400 border-b border-transparent hover:border-zinc-700 focus:border-amber-400 focus:outline-none w-full py-0.5"
                    />
                  </div>

                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-750 font-mono">
                    {act.actTitle}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 transition cursor-pointer"
          >
            Anuluj
          </button>
          
          <button
            type="button"
            onClick={handleApplyToProject}
            className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
          >
            <Sparkles className="w-4 h-4 fill-zinc-950" />
            Zastosuj Scenariusz i Generuj Karty
          </button>
        </div>

      </div>
    </div>
  );
}

export { ProjectNarrativeModal as WeddingNarrativeModal };
