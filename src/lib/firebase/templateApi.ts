import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './errors';
import type { ProjectTemplate } from '../../types/template';
import { safeClone } from '../safeJson';

export const PREBUILT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl_cinematic_trailer',
    userId: 'system',
    title: 'Kinowy Zwiastun Filmowy (Cinematic Trailer)',
    description: 'Klasyczna, arystotelesowska struktura zwiastuna filmowego: od intrygującego prologu, przez budowanie napięcia, aż po punkt kulminacyjny i napisy końcowe.',
    category: 'cinematic_trailer',
    icon: '🎬',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'cinematic_noir',
      resolution: '1080p',
      fps: 24,
      fitMode: 'fit',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'golden_hour_piano',
      introCard: {
        enabled: true,
        text: 'CINEMATIC MASTER CUT',
        subtitle: 'Oficjalna Produkcja • Studio Wideo',
        duration: 3.5,
        style: 'cinematic',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'THE END',
        subtitle: 'Dziękujemy za uwagę • Montaż i postprodukcja: Kapi-studio by Piotr',
        duration: 4.5,
        style: 'credits',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Prolog & Ekspozycja', targetDurationSec: 45, description: 'Wprowadzenie w świat i atmosferę filmu' },
        { chapterKey: 'a_roll', name: 'Narastające Napięcie', targetDurationSec: 60, description: 'Bohaterowie, motywacje i sceneria' },
        { chapterKey: 'b_roll', name: 'Punkt Zwrotny', targetDurationSec: 45, description: 'Przełomowe wydarzenie i zmiana tempa' },
        { chapterKey: 'climax', name: 'Kulminacja Emocji', targetDurationSec: 60, description: 'Szczyt dramaturgiczny i dynamiczny montaż' },
        { chapterKey: 'ending', name: 'Finał i Kredyty', targetDurationSec: 30, description: 'Wyciszenie i kinowe zamknięcie' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_commercial_promo',
    userId: 'system',
    title: 'Spot Reklamowy & Social Hook (Promo)',
    description: 'Dynamiczny montaż marketingowy (CapCut / Premiere style) zoptymalizowany pod uwagę widza: 3-sekundowy hook, prezentacja korzyści i wezwanie do działania.',
    category: 'commercial_promo',
    icon: '⚡',
    isPrebuilt: true,
    structure: {
      pacing: 'dynamic',
      colorGrade: 'vivid_master',
      resolution: '1080p',
      fps: 60,
      fitMode: 'fill',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'boho_celebration',
      introCard: {
        enabled: true,
        text: 'DISCOVER THE FUTURE',
        subtitle: 'Nowa Generacja Rozwiązań',
        duration: 2.5,
        style: 'modern_bold',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'GET STARTED TODAY',
        subtitle: 'Odwiedź stronę i dowiedz się więcej',
        duration: 3.5,
        style: 'modern_bold',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Hook (0-3s)', targetDurationSec: 15, description: 'Hipnotyzujące ujęcie przyciągające wzrok' },
        { chapterKey: 'b_roll', name: 'Problem i Wyzwanie', targetDurationSec: 25, description: 'Kontekst i potrzeba rynkowa' },
        { chapterKey: 'action', name: 'Rozwiązanie w Ruchu', targetDurationSec: 35, description: 'Dynamiczna prezentacja zalet' },
        { chapterKey: 'ending', name: 'Call to Action', targetDurationSec: 15, description: 'Końcowe wezwanie do działania' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_travel_vlog',
    userId: 'system',
    title: 'Dziennik Podróży & Vlog (Travel Odyssey)',
    description: 'Szerokie krajobrazy, ujęcia z drona, ciepłe kolory zachodzącego słońca i autentyczny zapis przygody z drogi.',
    category: 'travel_vlog',
    icon: '🌍',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'golden_hour',
      resolution: '1080p',
      fps: 30,
      fitMode: 'fit',
      applySmartTrim: false,
      applyTransitions: true,
      suggestedMusicPreset: 'venice_strings',
      introCard: {
        enabled: true,
        text: 'EXPEDITION ODYSSEY',
        subtitle: 'Dziennik Wyprawy • Nowe Horyzonty',
        duration: 3.0,
        style: 'minimalist',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'WSPOMNIENIA Z DROGI',
        subtitle: 'Dziękujemy za wspólną podróż • Do zobaczenia na szlaku',
        duration: 4.0,
        style: 'minimalist',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Wyruszamy w Drogę', targetDurationSec: 40, description: 'Podróż, lądowanie i pierwsze wrażenia' },
        { chapterKey: 'scenery', name: 'Majestat Krajobrazu', targetDurationSec: 60, description: 'Dron, panoramy i odkrywanie natury' },
        { chapterKey: 'b_roll', name: 'Złota Godzina', targetDurationSec: 50, description: 'Ciepłe światło i chwile zachwytu' },
        { chapterKey: 'ending', name: 'Powrót i Refleksje', targetDurationSec: 30, description: 'Wieczorny odpoczynek i podsumowanie' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_music_video',
    userId: 'system',
    title: 'Dynamiczny Teledysk Muzyczny (Music Video)',
    description: 'Szybki montaż w rytm muzyki, neony, kontrastowe barwy, krótkie ujęcia i mocne przejścia dynamiczne.',
    category: 'music_video',
    icon: '🎵',
    isPrebuilt: true,
    structure: {
      pacing: 'dynamic',
      colorGrade: 'vintage_35mm',
      resolution: '1080p',
      fps: 60,
      fitMode: 'fill',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'boho_celebration',
      introCard: {
        enabled: true,
        text: 'SYNTHESIS',
        subtitle: 'Official Music Video',
        duration: 2.5,
        style: 'cyber_neon',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'MUSIC & VISUALS',
        subtitle: 'Dostępne na wszystkich platformach streamingowych',
        duration: 3.5,
        style: 'credits',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Intro Beat', targetDurationSec: 20, description: 'Budowanie nastroju i pierwsze takty' },
        { chapterKey: 'a_roll', name: 'Zwrotka Główna', targetDurationSec: 40, description: 'Wokal i zbliżenia artysty' },
        { chapterKey: 'action', name: 'Refren & Eksplozja', targetDurationSec: 45, description: 'Dynamiczny taniec i światła' },
        { chapterKey: 'ending', name: 'Outro Fade', targetDurationSec: 25, description: 'Wyciszenie i logo' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_documentary',
    userId: 'system',
    title: 'Dokument & Autorski Reportaż (Documentary)',
    description: 'Spokojna narracja, autentyczność, ujęcia z wywiadów połączone z przebitkami i profesjonalnym klapsem filmowym.',
    category: 'documentary',
    icon: '📽️',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'cinematic_noir',
      resolution: '1080p',
      fps: 24,
      fitMode: 'fit',
      applySmartTrim: false,
      applyTransitions: true,
      suggestedMusicPreset: 'altar_procession',
      introCard: {
        enabled: true,
        text: 'GŁOSY PRZESZŁOŚCI',
        subtitle: 'Film Dokumentalny • Śledztwo Dziennikarskie',
        duration: 4.0,
        style: 'studio_slate',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'PODZIĘKOWANIA',
        subtitle: 'Dziękujemy wszystkim rozmówcom i archiwistom za współpracę',
        duration: 4.5,
        style: 'credits',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Wprowadzenie Faktów', targetDurationSec: 60, description: 'Geneza tematu i pierwsze dokumenty' },
        { chapterKey: 'interview', name: 'Głos Świadków', targetDurationSec: 90, description: 'Wywiady i relacje naocznych świadków' },
        { chapterKey: 'action', name: 'Konfrontacja i Analiza', targetDurationSec: 60, description: 'Kluczowe dowody i wnioski' },
        { chapterKey: 'ending', name: 'Podsumowanie i Puenta', targetDurationSec: 40, description: 'Zamknięcie i refleksje na przyszłość' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tpl_event_showcase',
    userId: 'system',
    title: 'Gala & Prestiżowe Wydarzenie (Event Showcase)',
    description: 'Elegancka relacja z gali, jubileuszu, konferencji lub bankietu firmowego z klasycznymi planszami i podziękowaniami.',
    category: 'event_showcase',
    icon: '✨',
    isPrebuilt: true,
    structure: {
      pacing: 'cinematic',
      colorGrade: 'golden_hour',
      resolution: '1080p',
      fps: 30,
      fitMode: 'fit',
      applySmartTrim: true,
      applyTransitions: true,
      suggestedMusicPreset: 'golden_hour_piano',
      introCard: {
        enabled: true,
        text: 'EXCELLENCE GALA',
        subtitle: 'Oficjalna Relacja z Uroczystości',
        duration: 3.5,
        style: 'cinematic',
        backgroundColor: 'gradient',
        cardType: 'intro'
      },
      outroCard: {
        enabled: true,
        text: 'DZIĘKUJEMY ZA OBECNOŚĆ',
        subtitle: 'Gratulacje dla laureatów • Do zobaczenia za rok',
        duration: 4.0,
        style: 'credits',
        backgroundColor: 'gradient',
        cardType: 'outro'
      },
      chapters: [
        { chapterKey: 'opening', name: 'Przybycie Gości', targetDurationSec: 45, description: 'Czerwony dywan, powitania i fotobudka' },
        { chapterKey: 'a_roll', name: 'Część Oficjalna & Nagrody', targetDurationSec: 90, description: 'Przemówienia zarządu i wręczenie statuetek' },
        { chapterKey: 'party', name: 'Bankiet i Kuluarowe Rozmowy', targetDurationSec: 75, description: 'Networking, catering i toast' },
        { chapterKey: 'ending', name: 'Finał Wieczoru', targetDurationSec: 30, description: 'Nocne podsumowanie i pożegnanie' }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function getUserTemplates(): Promise<ProjectTemplate[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = `users/${user.uid}/templates`;
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const userTemplates: ProjectTemplate[] = [];
    snapshot.forEach(docSnap => {
      userTemplates.push(docSnap.data() as ProjectTemplate);
    });

    return userTemplates;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.GET, path);
    } else {
      console.warn(`[Firestore Templates] Nie można pobrać szablonów z chmury (${path}):`, errMsg);
    }
    return [];
  }
}

export async function saveUserTemplate(template: Omit<ProjectTemplate, 'userId' | 'createdAt' | 'updatedAt'>): Promise<ProjectTemplate> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Musisz być zalogowany, aby zapisać szablon w chmurze Firebase.');
  }

  const templateId = template.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `users/${user.uid}/templates/${templateId}`;

  const fullTemplate: ProjectTemplate = {
    ...template,
    id: templateId,
    userId: user.uid,
    isPrebuilt: false,
    structure: safeClone(template.structure),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, path), fullTemplate, { merge: true });
    return fullTemplate;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } else {
      console.warn(`[Firestore Templates] Błąd zapisu szablonu (${path}):`, errMsg);
    }
    throw error;
  }
}

export async function deleteUserTemplate(templateId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const path = `users/${user.uid}/templates/${templateId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      console.warn(`[Firestore Templates] Błąd usuwania szablonu (${path}):`, errMsg);
    }
    throw error;
  }
}
