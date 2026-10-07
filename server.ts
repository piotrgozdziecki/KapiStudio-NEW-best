// Fix tsx quirk where globalThis.__dirname and __filename are set to '.' in ESM, breaking createRequire in Node 22
if ((globalThis as any).__dirname === '.') {
  delete (globalThis as any).__dirname;
}
if ((globalThis as any).__filename === '.') {
  delete (globalThis as any).__filename;
}

import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

// Prioritize IPv4 and configure global Undici dispatcher to prevent ConnectTimeoutError on Google API endpoints
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}
if ((dns as any).setDefaultAutoSelectFamily) {
  try {
    (dns as any).setDefaultAutoSelectFamily(true);
  } catch {}
}

try {
  const globalAgent = new Agent({
    connect: {
      timeout: 30000,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1000
    },
    keepAliveTimeout: 5000,
    keepAliveMaxTimeout: 45000
  });
  setGlobalDispatcher(globalAgent);
} catch (agentErr) {
  console.warn('[Server] Note on global Undici dispatcher setup:', agentErr);
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs';
import multer from 'multer';
import * as https from 'node:https';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable CORS and parsing
app.use(cors());
app.use(express.json({ limit: '2048mb' }));
app.use(express.urlencoded({ limit: '2048mb', extended: true }));

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Firebase status endpoint
app.get('/api/firebase-status', (req, res) => {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json({
        status: 'connected',
        projectId: config.projectId,
        databaseId: config.firestoreDatabaseId,
        tier: 'Firebase Spark (Free Tier: 50k reads/day, 20k writes/day, 1GB data)',
        storageBucket: config.storageBucket,
        authDomain: config.authDomain
      });
    } else {
      res.json({ status: 'not_configured' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2048 * 1024 * 1024 } // 2GB limit per video export
});

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return (getAI() as any)[prop];
  }
});

// Helper for retrying with exponential backoff on 429 (Rate Limit) or 503 (Unavailable / High Demand)
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
    const isRetryable = 
      (err?.status === 'RESOURCE_EXHAUSTED' || 
      err?.status === 429 || 
      err?.status === 503 ||
      err?.status === 'UNAVAILABLE' ||
      err?.error?.code === 429 ||
      err?.error?.code === 503 ||
      err?.error?.status === 'UNAVAILABLE' ||
      errStr.includes('429') || 
      errStr.includes('503') ||
      errStr.includes('RESOURCE_EXHAUSTED') || 
      errStr.includes('UNAVAILABLE') ||
      errStr.includes('quota') ||
      errStr.includes('limit reached') ||
      errStr.includes('high demand') ||
      errStr.includes('temporarily unavailable') ||
      errStr.includes('ECONNRESET') ||
      errStr.includes('ETIMEDOUT') ||
      err?.name === 'FetchError') &&
      err?.status !== 402 &&
      err?.error?.code !== 402 &&
      !errStr.includes('402') &&
      !errStr.includes('credits are depleted');
      
    if (retries > 0 && isRetryable) {
      console.log(`[AI Retry] Retrying in ${delayMs}ms... (attempts left: ${retries}). Error: ${errStr.substring(0, 80)}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, retries - 1, Math.round(delayMs * 1.5));
    }
    throw err;
  }
}

// Executes with immediate model failover if the primary model is experiencing a 503/429 spike
async function executeWithModelFallback<T>(
  taskFn: (modelName: string) => Promise<T>,
  models: string[] = ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
): Promise<T> {
  let lastError: any = null;
  for (const model of models) {
    try {
      return await retryWithBackoff(() => taskFn(model), 1, 800);
    } catch (err: any) {
      lastError = err;
      const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
      console.warn(`[AI Failover] Model ${model} under load (${errStr.substring(0, 60)}). Switching to backup model.`);
    }
  }
  throw lastError;
}

// Directives and stylistic blueprints for high quality video production
const moodDirectives: Record<string, {
  name: string;
  style: string;
  musicStyle: string;
  voiceoverStyle: string;
  timelineGuidelines: string;
}> = {
  high_quality: {
    name: "Master Quality Studio Cut",
    style: "Szlachetny reportaż kinowy najwyższej próby. Autentyczne, głębokie emocje, naturalne światło, miękki bokeh, kinowa proporcja 2.39:1 i precyzyjny montaż z naciskiem na dramaturgię i mikro-ekspresje.",
    musicStyle: "Emocjonalna orkiestracja symfoniczna (akustyczny fortepian, sekcja smyczkowa, studyjna przestrzeń).",
    voiceoverStyle: "Głęboki, ciepły, dojrzały lektor snujący wciągającą opowieść.",
    timelineGuidelines: "Mistrzowska dramaturgia – budowanie napięcia od spowolnionego wprowadzenia, przez punkt kulminacyjny, aż po wyraziste zakończenie."
  },
  cinematic: {
    name: "Kinowy Film Fabularny / Trailer",
    style: "Dramatyczny, zwiastunowy charakter z głębokimi cieniami, kontrastowym oświetleniem i kinowym ruchem kamery (dron, slidery, gimbal).",
    musicStyle: "Epicki, rosnący aranż symfoniczny z pulsującą perkusją filmową i dętymi akcentami.",
    voiceoverStyle: "Dojrzały, dostojny i intrygujący voiceover kinowy z pauzami budującymi napięcie.",
    timelineGuidelines: "Segmentowa struktura 5 aktów (Prolog -> Ekspozycja -> Punkt Zwrotny -> Kulminacja -> Epilog)."
  },
  documentary: {
    name: "Dokument & Reportaż",
    style: "Autentyczny zapis faktów, surowe piękno otoczenia, wywiady z bohaterami oraz przebitki detali i kontekstu miejsca.",
    musicStyle: "Minimalistyczny ambient, ciepła gitara akustyczna i subtelne smyczki.",
    voiceoverStyle: "Spokojny, obiektywny i wiarygodny głos przewodnika lub dziennikarza.",
    timelineGuidelines: "Harmonijny montaż łączący wypowiedzi (A-Roll) z bogatym materiałem ilustracyjnym (B-Roll)."
  },
  commercial: {
    name: "Spot Reklamowy & Promo",
    style: "Dynamiczny, nowoczesny montaż marketingowy z silnym hookiem w pierwszych sekundach, rytmem i wyraźnym call-to-action.",
    musicStyle: "Nowoczesny beat elektroniczny, upbeat funk lub dynamiczny cinematic percussion (110-128 BPM).",
    voiceoverStyle: "Pewny siebie, energiczny, profesjonalny i perswazyjny głos lektorski.",
    timelineGuidelines: "Krótkie, wyraziste cięcia (Hook 0-3s -> Problem -> Rozwiązanie -> Korzyści -> CTA)."
  },
  travel: {
    name: "Dziennik Podróży & Przygoda",
    style: "Szerokie plany krajobrazu, ujęcia z drona, złota godzina i autentyczna pasja odkrywania świata.",
    musicStyle: "Inspirujący indie-folk, dynamiczny world music lub atmosferyczny ambient ze świergotem natury.",
    voiceoverStyle: "Ciepły, osobisty pamiętnik podróżnika pełen zachwytu i refleksji.",
    timelineGuidelines: "Rytm podróży – przeplatanie dynamicznych ujęć drogi ze statycznymi, malowniczymi pejzażami."
  },
  energetic: {
    name: "Dynamiczny Teledysk & Akcja",
    style: "Porywający, rytmiczny montaż z synchronizacją z muzyką (beat-matching), żywymi barwami i dynamicznymi przejściami.",
    musicStyle: "Upbeat pop/electronic mashup z wyrazistym basowym kickiem (120-130 BPM).",
    voiceoverStyle: "Energiczny, entuzjastyczny głos budujący wysoki poziom adrenaliny.",
    timelineGuidelines: "Krótkie cięcia w punkt uderzenia stopy perkusji, speed-rampy i szybkie zbliżenia."
  },
  modern: {
    name: "Modern Social Reel & Aesthetic",
    style: "Świeży, minimalistyczny styl inspirowany estetyką nowoczesnych mediów cyfrowych. Wyrazista typografia i estetyczne kadrowanie.",
    musicStyle: "Stylowy lo-fi, chill-house lub nowofalowy elektroniczny soundscape.",
    voiceoverStyle: "Lekki, bezpośredni, autentyczny i naturalny ton współczesnego twórcy.",
    timelineGuidelines: "Aesthetic cuts, mikro-detale, płynne zoomy i dynamiczne plansze tytułowe."
  },
  romantic: {
    name: "Nastrojowy Film Wspomnieniowy",
    style: "Pastelowa, poetycka aura z miękkim światłem. Skupienie na małych gestach, bliskości, uśmiechach i nastrojowych kadrach w plenerze.",
    musicStyle: "Ciepły akustyczny duet fortepianu i gitary z aksamitnym podkładem smyczkowym (60-75 BPM).",
    voiceoverStyle: "Czuła, poetycka narracja z intymnymi refleksjami i ciepłym głosem lektora.",
    timelineGuidelines: "Płynny, zmysłowy montaż oparty na ujęciach w zwolnionym tempie i łagodnych przenikaniach."
  },
  nostalgic: {
    name: "Ponadczasowy Analog 35mm / Vintage",
    style: "Klimat taśmy celuloidowej, ciepłe odcienie, organiczne mikro-ziarno, winieta i nostalgiczna barwa światła.",
    musicStyle: "Nostalgiczny akustyczny utwór z delikatnym szumem winylu, pianinem i instrumentami smyczkowymi.",
    voiceoverStyle: "Ciepły, gawędziarski głos przypominający ponadczasowe historie i wspomnienia.",
    timelineGuidelines: "Ciepłe, powolne ujęcia budujące głęboką atmosferę pamięci i nostalgii."
  }
};

// Fallback universal storyboard generator when AI API quota is temporarily saturated
function generateFallbackStory(analyzedItems: any[] = [], mood: string = 'cinematic') {
  const items = analyzedItems.length > 0 ? analyzedItems : [
    { name: 'Prolog i Ujęcia Wstępne', type: 'video', description: 'Wprowadzenie w świat i atmosferę opowieści' },
    { name: 'Główny Wątek i Postacie', type: 'video', description: 'Ekspozycja bohaterów i kluczowe sceny' },
    { name: 'Punkt Zwrotny i Rozwinięcie', type: 'video', description: 'Dynamiczny rozwój akcji i kulisy' },
    { name: 'Finał i Kredyty Końcowe', type: 'video', description: 'Kulminacja wydarzeń i podsumowanie' }
  ];

  const moodTemplates: Record<string, {
    title: string;
    concept: string;
    music: string;
    actions: string[];
    voiceover: string;
  }> = {
    cinematic: {
      title: 'Początek Nowego Horyzontu – Master Cut',
      concept: 'Monumentalny, wielowątkowy reportaż kinowy ukazujący historię w epickich kadrach i symfonicznej oprawie dźwiękowej.',
      music: 'Hans Zimmer style – Time & Epiphany (Cinematic Orchestral Suite)',
      actions: [
        'Prolog – majestatyczne kadry detali, gra świateł w porannym słońcu i narastające napięcie',
        'Ekspozycja – prezentacja bohaterów, motywacji i przestrzeni narracyjnej',
        'Punkt zwrotny – nieoczekiwane wydarzenie zmieniające bieg historii',
        'Główna akcja – dynamiczne, pełne emocji ujęcia z bliska',
        'Kulminacja – maksymalne napięcie dramaturgiczne i szczyt emocjonalny',
        'Wyciszenie – refleksyjne spojrzenie na przebyte wyzwania',
        'Finałowy epilog – kinowe zamknięcie i napisy końcowe'
      ],
      voiceover: 'Są historie, które nie potrzebują słów, bo każda klatka niesie w sobie prawdę o człowieku i jego drodze.'
    },
    documentary: {
      title: 'Głos Świadków – Kronika Wydarzeń',
      concept: 'Autentyczny i poruszający zapis faktów, łączący szczere wypowiedzi rozmówców z bogatym materiałem archiwalnym i plenerowym.',
      music: 'Max Richter – On The Nature of Daylight (Ambient Piano & Strings)',
      actions: [
        'Wprowadzenie w temat – tło historyczne, lokalizacja i pierwsze fakty',
        'Wywiad kluczowy – intymne wyznania i osobista perspektywa świadka',
        'Przebitki ilustracyjne – detale dokumentów, archiwalne kadry i otoczenie',
        'Konfrontacja z rzeczywistością – kluczowe dowody i punkt kulminacyjny śledztwa',
        'Podsumowanie i wnioski na przyszłość – głos ekspertów',
        'Finałowe ujęcie i plansze informacyjne'
      ],
      voiceover: 'Prawda nie leży na powierzchni. Wymaga cierpliwości, by wsłuchać się w to, co najważniejsze.'
    },
    commercial: {
      title: 'Zdefiniuj Przyszłość – Spot Promocyjny',
      concept: 'Maksymalnie angażujący, dynamiczny montaż reklamowy z natychmiastowym zatrzymaniem uwagi i jasnym przesłaniem.',
      music: 'Modern High-Energy Electronic Beats (124 BPM Future Bass)',
      actions: [
        'Hook 0-3s – hipnotyzujące, ultra-dynamiczne ujęcie przyciągające wzrok',
        'Problem i wyzwanie – ukazanie realnej potrzeby rynkowej',
        'Przełomowa innowacja – dynamiczne zbliżenia na produkt i technologię',
        'Doświadczenie w praktyce – uśmiech i satysfakcja użytkownika',
        'Kluczowe korzyści – szybkie cięcia detali i efektowne przejścia',
        'Call to Action (CTA) – mocne logo, hasło przewodnie i wezwanie do działania'
      ],
      voiceover: 'Przyszłość nie czeka na nikogo. Bądź o krok przed wszystkimi – odkryj nową definicję perfekcji.'
    },
    travel: {
      title: 'Ścieżki Nieznanego – Dziennik Podróży',
      concept: 'Malowniczy esej podróżniczy celebrujący majestat natury, lokalną kulturę i wolność odkrywania świata.',
      music: 'Bon Iver / ODESZA – A Moment Apart (Indie Electronic Chill)',
      actions: [
        'Wyruszenie w drogę – wschód słońca, przygotowanie sprzętu i pierwsze kilometry',
        'Majestat krajobrazu – szerokie panoramy z drona i bezkres natury',
        'Spotkania z ludźmi – autentyczne uśmiechy, lokalne smaki i kultura',
        'Złota godzina – ciepłe promienie słońca muskające horyzont',
        'Wieczorne ognisko – chwile wyciszenia pod rozgwieżdżonym niebem',
        'Powrót ze wspomnieniami – ostatnie spojrzenie na przebytą drogę'
      ],
      voiceover: 'Podróżowanie to nie ucieczka. To powrót do tego, co w nas najprostsze i najprawdziwsze.'
    },
    energetic: {
      title: 'Czysta Energia – Dynamic Showcase',
      concept: 'Porywający teledysk o zawrotnym tempie, perfekcyjnie zsynchronizowany z każdym uderzeniem basu.',
      music: 'Swedish House Mafia / The Weeknd – High Energy Bass Mix',
      actions: [
        'Odliczanie do dropu – rosnące tempo, mikro-cięcia i błyski światła',
        'Wybuch energii – spektakularne ujęcia akcji i dynamiczny ruch kamery',
        'Speed-ramps i rotacje – widowiskowe akrobacje i popisy',
        'Kulminacja rytmu – salwy świateł, dym i nieskrępowana pasja',
        'Finałowy drop – potężne uderzenie basu i zamrożenie klatki'
      ],
      voiceover: 'Gdy pasja przejmuje kontrolę, każda sekunda zamienia się w czystą energię.'
    },
    romantic: {
      title: 'Niezapomniane Chwile – Poemat Wizualny',
      concept: 'Nastrojowy, pełen ciepła reportaż filmowy łączący najważniejsze chwile i emocje bohaterów.',
      music: 'Ludovico Einaudi – Nuvole Bianche (Cinematic Piano & String Mix)',
      actions: [
        'Początek opowieści – czułe spojrzenia, przygotowania i ciche bicie serca',
        'Kluczowe spotkanie – uroczysty moment i szczere emocje najbliższych',
        'Wspólne chwile w plenerze – złota godzina i naturalny uśmiech',
        'Radosna celebracja – toasty, muzyka i spontaniczny taniec',
        'Finałowy spacer w ciepłym blasku świateł i pożegnanie dnia'
      ],
      voiceover: 'To był moment, w którym każde spojrzenie miało znaczenie, a wspomnienia stały się wieczne.'
    },
    nostalgic: {
      title: 'Kronika Wspomnień – Vintage 35mm',
      concept: 'Ciepła, poetycka opowieść w stylu retro, skupiona na autentyczności i ponadczasowym uroku.',
      music: 'Acoustic Strings & Folk Choir with Vinyl Warmth',
      actions: [
        'Promienie słońca przez okno – spokój i ciepło poranka',
        'Uchwycone spojrzenia – szczere uśmiechy i głębokie spojrzenia w obiektyw',
        'Wspólne chwile – beztroska radość w gronie przyjaciół',
        'Ciepłe, złociste światło zmierzchu – spacer wśród natury',
        'Ciche zamknięcie – nostalgiczny kadr na koniec pięknego dnia'
      ],
      voiceover: 'Prawdziwe piękno kryje się w prostych chwilach, które trwają w naszej pamięci na zawsze.'
    }
  };

  const selected = moodTemplates[mood] || moodTemplates.cinematic;

  const defaultClipNames = [
    'Prolog i ujęcia wprowadzające.mp4',
    'Ekspozycja i główni bohaterowie.mp4',
    'Punkt kulminacyjny akcji.mp4',
    'Dynamiczna sekwencja plenerowa.mp4',
    'Scena dialogowa i zbliżenia.mp4',
    'Atmosferyczne przebitki B-roll.mp4',
    'Finał i kinowe podsumowanie.mp4'
  ];

  const itemsList = (Array.isArray(items) && items.length > 0)
    ? items
    : defaultClipNames.map(name => ({ name }));

  const timeline = itemsList.map((item, idx) => {
    const startSecTotal = idx * 30;
    const endSecTotal = (idx + 1) * 30;
    const sMin = Math.floor(startSecTotal / 60);
    const sSec = startSecTotal % 60;
    const eMin = Math.floor(endSecTotal / 60);
    const eSec = endSecTotal % 60;
    const timeStr = `${sMin}:${sSec < 10 ? '0' : ''}${sSec}-${eMin}:${eSec < 10 ? '0' : ''}${eSec}`;

    return {
      time: timeStr,
      elementName: item?.name || `Ujęcie ${idx + 1}`,
      action: selected.actions[idx % selected.actions.length]
    };
  });

  return {
    title: selected.title,
    concept: selected.concept,
    musicSuggestion: selected.music,
    timeline,
    voiceover: selected.voiceover,
    mood
  };
}

// Utility to fetch a file from Google Drive and return as base64 with retry
async function fetchDriveFileBase64(fileId: string, token: string): Promise<{ base64: string, mimeType: string }> {
  return retryWithBackoff(async () => {
    const urlMetadata = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`;
    const urlMedia = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headers = { Authorization: `Bearer ${token}` };

    const driveFetch = (url: string): Promise<{ buffer: Buffer, headers: any }> => {
      return new Promise((resolve, reject) => {
        https.get(url, { headers, family: 4 }, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Drive API error: ${res.statusCode}`));
            return;
          }
          const chunks: any[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers }));
        }).on('error', reject);
      });
    };

    try {
      const metaRes = await driveFetch(urlMetadata);
      const meta = JSON.parse(metaRes.buffer.toString());
      
      const mediaRes = await driveFetch(urlMedia);
      return {
        base64: mediaRes.buffer.toString('base64'),
        mimeType: meta.mimeType || 'application/octet-stream'
      };
    } catch (err: any) {
      throw err;
    }
  }, 2, 800);
}

app.post('/api/analyze-media', async (req, res) => {
  try {
    const { items, fileData, mimeType, fileName, accessToken } = req.body;
    
    // Normalize items array whether input is a single file payload or an array
    let normalizedItems: any[] = [];
    if (Array.isArray(items) && items.length > 0) {
      normalizedItems = items;
    } else if (fileData || fileName) {
      normalizedItems = [{
        name: fileName || 'Materiał wideo',
        base64: fileData || '',
        mimeType: mimeType || 'image/jpeg',
        type: 'local'
      }];
    }

    if (!normalizedItems || !normalizedItems.length) {
      return res.status(200).json({ 
        description: "Ujęcie studyjne",
        results: [{ name: "Ujęcie wideo", type: "image", description: "Ujęcie studyjne wideo" }] 
      });
    }

    const analysisResults = [];

    for (const item of normalizedItems) {
      const itemName = item.name || item.fileName || 'Ujęcie wideo';
      console.log(`Analyzing item: ${itemName} (${item.type || 'local'})`);
      let base64 = '';
      let itemMimeType = item.mimeType || 'image/jpeg';
      
      if (item.type === 'drive' && item.id) {
        if (!accessToken) {
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Ujęcie z Google Drive: ${itemName}`,
            transcription: null
          });
          continue;
        }
        try {
          const driveData = await fetchDriveFileBase64(item.id, accessToken);
          base64 = driveData.base64;
          itemMimeType = driveData.mimeType;
        } catch (driveErr) {
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Ujęcie z Google Drive: ${itemName}`,
            transcription: null
          });
          continue;
        }
      } else {
        base64 = item.base64 || item.fileData || '';
      }
      
      const isVideo = itemMimeType.startsWith('video/');
      const isImage = itemMimeType.startsWith('image/');
      
      if (isVideo) {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: `Analiza ujęcia wideo dla studia montażu filmowego. Zwróć JSON:
{
  "description": "krótki, profesjonalny opis sceny (2-3 zdania)",
  "emotion": "cinematic" | "energetic" | "nostalgic" | "solemn" | "joyful" | "neutral" | "dramatic",
  "timeOfDay": "morning" | "afternoon" | "golden_hour" | "evening" | "night",
  "sceneType": "detale" | "ludzie" | "akcja" | "krajobraz" | "dialog" | "architektura"
}` }
                ]
              },
              config: { responseMimeType: "application/json" }
            })
          );
          
          const parsed = JSON.parse(modelResponse.text || '{}');
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: parsed.description || `Ujęcie wideo: ${itemName}`,
            emotion: parsed.emotion || 'neutral',
            timeOfDay: parsed.timeOfDay || 'afternoon',
            sceneType: parsed.sceneType || 'akcja',
            transcription: null
          });
        } catch (videoErr: any) {
          console.log("Dostosowanie opisu wideo:", videoErr.message);
          analysisResults.push({
            name: itemName,
            type: 'video',
            description: `Ujęcie wideo: ${itemName} – ujęcie filmowe do montażu.`,
            emotion: 'neutral',
            timeOfDay: 'afternoon',
            sceneType: 'akcja',
            transcription: null
          });
        }
      } else {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          
          const modelResponse = await retryWithBackoff(() => 
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: `Analiza zdjęcia / klatki dla studia montażu. Zwróć JSON:
{
  "description": "krótki opis kadru (1-2 zdania)",
  "emotion": "cinematic" | "energetic" | "nostalgic" | "solemn" | "joyful" | "neutral" | "dramatic",
  "timeOfDay": "morning" | "afternoon" | "golden_hour" | "evening" | "night",
  "sceneType": "detale" | "ludzie" | "akcja" | "krajobraz" | "architektura"
}` }
                ]
              },
              config: { responseMimeType: "application/json" }
            })
          );
          
          const parsed = JSON.parse(modelResponse.text || '{}');
          analysisResults.push({
            name: itemName,
            type: 'image',
            description: parsed.description || `Kadr / Zdjęcie: ${itemName}`,
            emotion: parsed.emotion || 'neutral',
            timeOfDay: parsed.timeOfDay || 'afternoon',
            sceneType: parsed.sceneType || 'ludzie',
            transcription: null
          });
        } catch (imgErr: any) {
          console.log("Dostosowanie opisu zdjęcia:", imgErr.message);
          analysisResults.push({
            name: itemName,
            type: 'image',
            description: `Kadr / Zdjęcie: ${itemName} – ujęcie graficzne.`,
            emotion: 'neutral',
            timeOfDay: 'afternoon',
            sceneType: 'ludzie',
            transcription: null
          });
        }
      }
    }
    
    const singleDescription = analysisResults[0]?.description || "Ujęcie wideo do projektu montażowego.";
    res.json({ description: singleDescription, results: analysisResults });
  } catch (err: any) {
    console.error("Analyze media error:", err);
    res.json({
      description: "Klatka z projektu wideo.",
      results: [{ name: "Ujęcie filmowe", type: "image", description: "Ujęcie filmowe" }]
    });
  }
});

const handleGenerateStory = async (req: express.Request, res: express.Response) => {
  try {
    const { analyzedItems, mood = 'cinematic', format = 'highlight', extras = [] } = req.body;
    const rawItems = Array.isArray(analyzedItems) && analyzedItems.length > 0
      ? analyzedItems
      : (Array.isArray(req.body.items) && req.body.items.length > 0 ? req.body.items : []);
    const moodConfig = moodDirectives[mood] || moodDirectives.cinematic;

    const formatInstructions = "\nWYBRANY FORMAT: Oryginalny format i proporcje filmu (nieokreślony, zachowujący naturalne ujęcia wideo bez sztucznego kadrowania i bez sztywnego limitu długości).\n- Pacing: Płynny, kinowy montaż o najwyższej jakości studyjnej.";

    let extrasInstructions = "";
    if (extras && Array.isArray(extras) && extras.length > 0) {
      extrasInstructions = `\nWYBRANE DODATKOWE WSTAWKI DO AUTOMATYCZNEGO WPLECIENIA W OŚ CZASU:\n` + extras.map((e: string) => {
        if (e === 'dynamic_intro') return `- Dynamiczne Intro z tytułem (efektowny początek filmu z kinowym motywem wstępnym)`;
        if (e === 'guest_thanks') return `- Podziękowania i plansza informacyjna (ciepły, wzruszający segment z podziękowaniami)`;
        if (e === 'outro_credits') return `- Zakończenie z napisami końcowymi (kinowe outro i napisy końcowe)`;
        return `- ${e}`;
      }).join('\n') + `\nAutomatycznie wpleć te wybrane dodatkowe wstawki jako dedykowane pozycje w osi czasu (timeline) na odpowiednich pozycjach (np. intro na samym początku przed materiałami, a napisy końcowe na samym końcu).`;
    }

    const prompt = `
Jesteś nagradzanym reżyserem i montażystą filmów najwyższej klasy.
Twoim zadaniem jest stworzenie wyjątkowego scenariusza i narracji wideo z powierzonych ujęć.

WYBRANY NASTRÓJ I KIERUNEK ARTYSTYCZNY:
👉 ${moodConfig.name.toUpperCase()}
${formatInstructions}
${extrasInstructions}

WYTYCZNE DLA TEGO NASTROJU:
- Klimat, emocje i narracja: ${moodConfig.style}
- Kierunek muzyczny: ${moodConfig.musicStyle}
- Styl narracji lektorskiej (Voiceover): ${moodConfig.voiceoverStyle}
- Zasady montażu na osi czasu: ${moodConfig.timelineGuidelines}

Oto przeanalizowane klipy i zdjęcia:
${JSON.stringify(rawItems, null, 2)}

Zaprojektuj spójne, profesjonalne widowisko filmowe ściśle w wybranym nastroju "${moodConfig.name}".
Zwróć wynik jako JSON z polami:
- "title": Tytuł filmu idealnie oddający nastrój "${moodConfig.name}"
- "concept": Koncept i motyw przewodni z uwzględnieniem wybranego stylu
- "musicSuggestion": Konkretna propozycja utworu muzycznego (wykonawca i tytuł) pasująca do: ${moodConfig.musicStyle}
- "timeline": Tablica obiektów { "time": "zakres np. 0:00-0:15", "elementName": "nazwa pliku lub wstawki", "action": "precyzyjny opis ujęcia, dynamiki, przejścia i emocji zgodny z nastrojem" }
- "voiceover": Porywający tekst z offu dla lektora napisany w stylu: "${moodConfig.voiceoverStyle}".
    `;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          concept: { type: Type.STRING },
          musicSuggestion: { type: Type.STRING },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                elementName: { type: Type.STRING },
                action: { type: Type.STRING }
              },
              required: ["time", "elementName", "action"]
            }
          },
          voiceover: { type: Type.STRING }
        },
        required: ["title", "concept", "musicSuggestion", "timeline", "voiceover"]
      }
    };

    let storyData: any = null;

    try {
      const response = await executeWithModelFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
      );

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.timeline && parsed.title) {
        storyData = parsed;
      }
    } catch (modelErr: any) {
      console.log('Automatyczne przejście do trybu reżysera offline dla scenariusza.');
    }

    if (!storyData || !storyData.timeline || storyData.timeline.length === 0) {
      console.log(`Przełączono na reżysera awaryjnego offline dla nastroju '${mood}'`);
      storyData = generateFallbackStory(rawItems, mood);
    }

    return res.json({ ...storyData, mood });
  } catch (err: any) {
    console.error('[AI Director] Error generating story:', err);
    if (err?.cause) console.error('[AI Director] Cause:', err.cause?.message || err.cause);
    console.log('Automatyczne przejście do trybu standardowego dla scenariusza.');
    const fallback = generateFallbackStory(req.body?.analyzedItems || req.body?.items, req.body?.mood || 'romantic');
    res.json(fallback);
  }
};

app.post('/api/generate-story', handleGenerateStory);
app.post('/api/generate-storyboard', handleGenerateStory);

// Stream a file from Google Drive directly to client (e.g. <video> or <img>)
app.get('/api/drive/stream/:id', async (req, res) => {
  const fileId = req.params.id;
  const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
  if (!token) return res.status(401).json({ error: 'Missing access token' });

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };
  if (req.headers.range) {
    headers['Range'] = req.headers.range as string;
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  // Wrapper for request execution with retry
  const executeRequest = (attempt = 1) => {
    const request = https.get(url, { headers, family: 4 }, (driveRes) => {
      // Handle redirects
      if (driveRes.statusCode === 301 || driveRes.statusCode === 302 || driveRes.statusCode === 307 || driveRes.statusCode === 308) {
        if (driveRes.headers.location) {
          https.get(driveRes.headers.location, { headers, family: 4 }, (redirectRes) => {
            handleResponse(redirectRes);
          }).on('error', handleError);
          return;
        }
      }
      handleResponse(driveRes);
    });

    const handleResponse = (driveRes: any) => {
      if (driveRes.statusCode && driveRes.statusCode >= 400 && driveRes.statusCode !== 206) {
        if (attempt < 2) {
          console.log(`[Server] Drive stream retry ${attempt}/2 due to status ${driveRes.statusCode}`);
          executeRequest(attempt + 1);
          return;
        }
        res.status(driveRes.statusCode).end();
        return;
      }

      res.status(driveRes.statusCode || 200);
      const contentType = driveRes.headers['content-type'] || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (driveRes.headers['content-range']) res.setHeader('Content-Range', driveRes.headers['content-range']);
      if (driveRes.headers['content-length']) res.setHeader('Content-Length', driveRes.headers['content-length']);

      driveRes.pipe(res);
    };

    const handleError = (err: any) => {
      if (attempt < 2) {
        console.log(`[Server] Drive stream retry ${attempt}/2 due to error: ${err.message}`);
        executeRequest(attempt + 1);
        return;
      }
      console.warn('[Server] Drive stream connection error (https):', err.message);
      if (err.cause) {
        console.warn('[Server] Drive stream error cause:', err.cause.message || err.cause);
      }
      if (!res.headersSent) {
        res.status(504).json({ error: 'Błąd strumieniowania z Dysku Google' });
      }
    };

    request.on('error', handleError);
    req.on('close', () => {
      request.destroy();
    });
  };

  executeRequest();
});

// List user files from Google Drive
app.get('/api/drive/list', async (req, res) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const token = (req.query.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) {
      return res.status(200).json({ files: [], requiresAuth: true, error: 'Wymagany token autoryzacji Google' });
    }

    const q = "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/json')";
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,webViewLink,videoMediaMetadata,imageMediaMetadata)&orderBy=modifiedTime desc&pageSize=100`;

    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      const isAuthOrScope = driveRes.status === 401 || driveRes.status === 403;
      return res.status(200).json({ 
        files: [],
        requiresAuth: isAuthOrScope,
        error: isAuthOrScope ? 'INSUFFICIENT_SCOPE' : `Błąd Google Drive (${driveRes.status})`,
        details: errorText 
      });
    }

    const data = await driveRes.json();
    res.json({ files: data.files || [] });
  } catch (err: any) {
    console.warn('[Server] Drive list notice:', err?.message || err);
    res.status(200).json({ files: [], warning: 'Drive list unavailable', error: err.message });
  } finally {
    clearTimeout(timeoutId);
  }
});

// Upload file directly to user's Google Drive
app.post('/api/drive/upload', async (req, res) => {
  try {
    const { fileName, mimeType, content, isBase64 } = req.body;
    const token = (req.body.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });
    if (!fileName || !content) return res.status(400).json({ error: 'Brak nazwy pliku lub zawartości' });

    const boundary = '-------GoogleDriveMultipartBoundary314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: mimeType || 'application/json'
    };

    let bodyBuffer: Buffer;
    if (isBase64) {
      const fileBuffer = Buffer.from(content, 'base64');
      const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
      bodyBuffer = Buffer.concat([
        Buffer.from(header, 'utf8'),
        fileBuffer,
        Buffer.from(closeDelimiter, 'utf8')
      ]);
    } else {
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType || 'application/json'}\r\n\r\n` +
        content +
        closeDelimiter;
      bodyBuffer = Buffer.from(multipartRequestBody, 'utf8');
    }

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length)
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `Błąd zapisu na Google Drive: ${errorText}` });
    }

    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err: any) {
    console.error('Drive upload error:', err);
    res.status(500).json({ error: err.message || 'Błąd zapisu pliku na Google Drive' });
  }
});

// Direct binary file upload to Google Drive (e.g. rendered MP4 movies)
app.post('/api/drive/upload-binary', upload.single('file'), async (req, res) => {
  try {
    const token = (req.body.accessToken as string) || (req.headers.authorization?.replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Wymagany token autoryzacji Google' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Brak przesłanego pliku binarnego' });

    const fileName = req.body.fileName || file.originalname || 'film_montaz.mp4';
    const mimeType = req.body.mimeType || file.mimetype || 'video/mp4';

    const boundary = '-------GoogleDriveMultipartBoundaryBinary987654';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: mimeType
    };

    const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(header, 'utf8'),
      file.buffer,
      Buffer.from(closeDelimiter, 'utf8')
    ]);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length)
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `Błąd zapisu wideo na Google Drive: ${errorText}` });
    }

    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err: any) {
    console.error('Drive binary upload error:', err);
    res.status(500).json({ error: err.message || 'Błąd zapisu pliku binarnego na Google Drive' });
  }
});

app.post('/api/generate-cover', async (req, res) => {
  try {
    const { prompt, size } = req.body;
    
    // Size should be "1K", "2K", or "4K"
    const validSizes = ["1K", "2K", "4K"];
    const imageSize = validSizes.includes(size) ? size : "1K";

    const response = await retryWithBackoff(() => 
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            { text: prompt || "Piękna, artystyczna, kinowa kompozycja filmowa, profesjonalne oświetlenie sceniczne, wysmakowany kadr" }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      })
    ).catch(err => {
      console.log("Przełączono na okładkę awaryjną (limit API obrazów).");
      // Fallback: return a special flag or a generic high-quality cinema image URL
      return { fallback: true };
    });

    if (!response || ('fallback' in response)) {
      // Return a high quality public domain cinema placeholder
      return res.json({ 
        imageUrl: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=1200",
        isFallback: true,
        message: "Osiągnięto limit generatora AI. Użyto kinowej okładki zastępczej."
      });
    }

    // Find image part
    let base64Image = null;
    const candidates = (response as any).candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content?.parts || []) {
        if (part.inlineData) {
           base64Image = part.inlineData.data;
           break;
        }
      }
    }

    if (base64Image) {
       res.json({ imageUrl: `data:image/jpeg;base64,${base64Image}` });
    } else {
       throw new Error("No image generated.");
    }
  } catch (err: any) {
    console.log('Korzystanie z okładki standardowej.');
    res.json({ 
      imageUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1200",
      isFallback: true,
      message: "Użyto pięknej okładki zastępczej."
    });
  }
});

app.post('/api/storyboard-tips', async (req, res) => {
  try {
    const { mood } = req.body;
    
    const prompt = `Zaproponuj 2 krótkie, inspirujące wskazówki lub trendy (max 1-2 zdania każda) dotyczące technik filmowania, oświetlenia lub montażu dla wideo w nastroju: ${mood}.
Użyj narzędzia Google Search, aby znaleźć najnowsze techniki i trendy. Odpowiedz w języku polskim.`;

    const response = await retryWithBackoff(() =>
      (ai.models.generateContent as any)({
        model: 'gemini-3.8-flash',
        contents: prompt,
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      })
    );

    const parsed = JSON.parse((response as any).text || '[]');
    res.json({ tips: parsed });
  } catch (err: any) {
    console.log('Korzystanie ze standardowych wskazówek reżyserskich.');
    // Return fallback tips on API exhaustion
    const fallbackTips = [
      "Stosuj przemyślaną głębię ostrości i regułę trójpodziału, aby wyróżnić główny motyw sceny i nadać ujęciom kinowej plastyki.",
      "Wykorzystaj kontrast oświetlenia i 'złotą godzinę', by zbudować głębię kadru oraz naturalne, organiczne flary optyczne."
    ];
    res.json({ tips: fallbackTips, isFallback: true });
  }
});

// Generator poetyckiego scenariusza i lektora audio AI (Gemini TTS)
app.post('/api/generate-voiceover-tts', async (req, res) => {
  try {
    const { text, style = 'cinematic_poetic', projectTitle = 'Mój Film Kinowy', coupleNames, voiceName = 'Kore' } = req.body;
    const title = projectTitle || coupleNames || 'Autorska Produkcja';
    
    let textToSpeak = text;

    // If no text provided, generate a creative poetic narration text first
    if (!textToSpeak || textToSpeak.length < 5) {
      const scriptPrompt = `Jesteś mistrzem scenopisarstwa i reżyserii filmowej.
Napisz klimatyczny, wciągający i krótki (2-4 zdania, ok. 25-45 słów) tekst narracyjny z offu (voice-over) dla projektu: "${title}".
Styl i gatunek: "${style}" (np. kinowy zwiastun, nastrojowy dokument, dynamiczna relacja, poetycka refleksja).
Napisz wyłącznie czysty tekst po polsku, gotowy do odczytania przez profesjonalnego lektora.`;

      try {
        const scriptRes = await retryWithBackoff(() => 
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: scriptPrompt
          })
        );
        textToSpeak = scriptRes.text?.trim() || "To był dzień, w którym każde spojrzenie miało znaczenie, a przysięga stała się początkiem najpiękniejszej wspólnej drogi.";
      } catch (err) {
        textToSpeak = "Dwa serca, jedna obietnica na całe życie. Dziś zaczyna się nasza najpiękniejsza wspólna opowieść.";
      }
    }

    // Call Gemini TTS model gemini-3.8-flash-lite-tts to convert text to spoken audio
    let audioBase64: string | null = null;
    try {
      const ttsResponse = await retryWithBackoff(() => 
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: {
            role: 'user',
            parts: [
              {
                text: textToSpeak
              } as any
            ]
          },
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName || "Kore" }
              }
            }
          }
        }),
        2,
        1000
      );

      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr: any) {
      console.warn('[TTS] Gemini TTS API unavailable or quota reached:', ttsErr?.message || ttsErr);
    }

    res.json({
      scriptText: textToSpeak,
      audioBase64: audioBase64,
      audioMimeType: 'audio/wav',
      voiceName: voiceName || 'Kore'
    });
  } catch (err: any) {
    console.error('Voiceover TTS error:', err);
    res.status(500).json({ error: err?.message || 'Błąd generowania lektora AI' });
  }
});

// Inteligentna sugestia korekty czasu ujęć na podstawie notatek reżyserskich i tempa montażu
app.post('/api/smart-duration-suggestion', async (req, res) => {
  try {
    const { items, directorNotes, tempo } = req.body;
    
    const prompt = `Jesteś ekspertem profesjonalnego montażu filmowego i reżyserii kinowej. Przeanalizuj poniższe ujęcia, notatki reżyserskie oraz docelowe tempo montażu ("${tempo || 'kinowe'}").
Notatki reżysera: "${directorNotes || 'Brak dodatkowych notatek'}"

Ujęcia do analizy:
${JSON.stringify(items || [], null, 2)}

Zaproponuj optymalne czasy trwania (w sekundach) dla każdego ujęcia oraz krótkie uzasadnienie reżyserskie, aby idealnie pasowały do tempa "${tempo}" i uwzględniały notatki.
Odpowiedz jako JSON z polami:
- "overallAdvice": Ogólna wskazówka montażowa (1-2 zdania)
- "suggestions": Tablica obiektów zawierająca { "itemId": "...", "suggestedDuration": numer_w_sekundach, "reason": "uzasadnienie" }
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallAdvice: { type: Type.STRING },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING },
                suggestedDuration: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["itemId", "suggestedDuration", "reason"]
            }
          }
        },
        required: ["overallAdvice", "suggestions"]
      }
    };

    let resultData: any = null;

    try {
      const response = await executeWithModelFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
      );
      resultData = JSON.parse(response.text || '{}');
    } catch (e: any) {
      console.log('Automatyczne przejście do trybu regułowego dla smart-duration.');
    }

    if (!resultData || !resultData.suggestions) {
      // Rule-based fallback
      const tempoMultiplier = tempo === 'dynamiczny' ? 0.7 : tempo === 'emocjonalny' ? 1.4 : 1.0;
      const suggestions = (items || []).map((item: any, idx: number) => {
        const base = (idx % 2 === 0 ? 4 : 6) * tempoMultiplier;
        return {
          itemId: item.id || String(idx),
          suggestedDuration: Math.round(base * 10) / 10,
          reason: `Dopasowano do tempa ${tempo} na podstawie analizy struktury.`
        };
      });
      resultData = {
        overallAdvice: `Rytm montażu "${tempo}" został zoptymalizowany dla płynnego przepływu emocji.`,
        suggestions
      };
    }

    res.json(resultData);
  } catch (err: any) {
    console.error('[AI Duration] Error:', err);
    if (err?.cause) console.error('[AI Duration] Cause:', err.cause?.message || err.cause);
    console.log('Smart duration fallback aktywny.');
    const suggestions = (req.body?.items || []).map((item: any, idx: number) => ({
      itemId: item.id || String(idx),
      suggestedDuration: 5,
      reason: "Standardowy czas ekspozycji."
    }));
    res.json({
      overallAdvice: "Zastosowano standardowy balans czasowy.",
      suggestions
    });
  }
});

// Automatyczne podpisywanie i tagowanie klipów wideo przez AI
app.post('/api/auto-caption-clips', async (req, res) => {
  try {
    const { clips = [], style = 'cinematic_poetic' } = req.body;
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ captions: [] });
    }

    const prompt = `Jesteś mistrzem montażu i scenarzystą filmowym.
Dla każdego z poniższych ujęć wideo przygotuj:
1. "smartTitle": Elegancki, filmowy tytuł sceny w języku polskim (np. "Prolog – Ujęcia Wstępne", "Główny Wątek Akcji", "Punkt Kulminacyjny").
2. "subtitleCaption": Subtelny, filmowy podpis / cytat narracyjny w stylu "${style}" do wyświetlenia na ekranie jako podtytuł lub lektor.
3. "category": Jedna z kategorii: "opening", "intro", "a_roll", "b_roll", "interview", "action", "dialogue", "scenery", "drone", "climax", "ending", "outro".
4. "directorNote": Krótka uwaga montażowa dla montażysty (np. "Wycisz mikrofon, nałóż ciepły grading").
5. "suggestedTag": 2-3 słowa kluczowe.

Lista klipów:
${JSON.stringify(clips.map((c: any, i: number) => ({
  index: i,
  id: c.id,
  name: c.name,
  duration: c.duration,
  capturedAt: c.capturedAt || c.createdAt,
  tags: c.tags,
  comment: c.comment
})), null, 2)}
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipId: { type: Type.STRING },
                smartTitle: { type: Type.STRING },
                subtitleCaption: { type: Type.STRING },
                category: { type: Type.STRING },
                directorNote: { type: Type.STRING },
                suggestedTag: { type: Type.STRING }
              },
              required: ["clipId", "smartTitle", "subtitleCaption", "category", "directorNote"]
            }
          }
        },
        required: ["captions"]
      }
    };

    let result: any = null;

    try {
      const response = await executeWithModelFallback((modelName) =>
        ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
      );
      result = JSON.parse(response.text || '{}');
    } catch (err1: any) {
      console.log('Użycie inteligentnego generatora regułowego dla podpisów.');
    }

    if (!result || !result.captions || result.captions.length === 0) {
      const stageKeywords: { key: string; name: string; quote: string; cat: string }[] = [
        { key: 'prologue', name: 'Prolog i Ujęcia Wstępne', quote: 'Początek historii, w której każda chwila ma znaczenie.', cat: 'opening' },
        { key: 'aroll', name: 'Główny Wątek i Postacie', quote: 'Autentyczne emocje i sedno opowieści.', cat: 'a_roll' },
        { key: 'broll', name: 'Przebitki i Detale Otoczenia', quote: 'Klimat i przestrzeń budujące nastrój.', cat: 'b_roll' },
        { key: 'action', name: 'Dynamiczna Sekwencja Ruchu', quote: 'Czysta energia i dynamika wydarzeń.', cat: 'action' },
        { key: 'climax', name: 'Punkt Kulminacyjny', quote: 'Szczyt emocji i moment zwrotny.', cat: 'climax' },
        { key: 'ending', name: 'Finał i Kredyty Końcowe', quote: 'Niezapomniane zakończenie pełne refleksji.', cat: 'ending' }
      ];

      const fallbackCaptions = clips.map((clip: any, idx: number) => {
        const stage = stageKeywords[idx % stageKeywords.length];
        return {
          clipId: clip.id,
          smartTitle: `${stage.name} (${clip.name || `Ujęcie ${idx + 1}`})`,
          subtitleCaption: stage.quote,
          category: stage.cat,
          directorNote: "Dopasuj płynne przejście i zachowaj naturalne audio otoczenia.",
          suggestedTag: stage.cat
        };
      });
      result = { captions: fallbackCaptions };
    }

    res.json(result);
  } catch (err: any) {
    console.error('[AI Caption] Error:', err);
    if (err?.cause) console.error('[AI Caption] Cause:', err.cause?.message || err.cause);
    res.json({ captions: [] });
  }
});

// Inteligentne scalanie chronologiczne i sekwencjonowanie filmu przez AI
app.post('/api/smart-chronological-sequencing', async (req, res) => {
  try {
    const { 
      clips = [], 
      pacing = 'cinematic', 
      projectTitle = 'Nowy Projekt Filmowy', 
      projectYear = '2026',
      coupleNames, 
      weddingDate 
    } = req.body;
    const title = projectTitle || coupleNames || 'Autorska Produkcja Filmowa';
    const year = projectYear || weddingDate || '2026';
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ orderedSequence: [], storyConcept: '' });
    }

    const prompt = `Jesteś światowej klasy reżyserem montażu filmowego. Twoim zadaniem jest stworzenie arcydzieła (Master Montage) dla projektu filmowego: "${title}" (${year}).
Przeanalizuj poniższe klipy i przygotuj zaawansowany scenariusz montażu (Smart Montage) z uwzględnieniem pory dnia, nastroju i tempa.

WYTYCZNE ARTYSTYCZNE:
1. GRUPOWANIE (Clustering):
   - Pogrupuj klipy w logiczne akty: Prolog (otwarcie), Ekspozycja (A-Roll), Przebitki (B-Roll), Kulminacja (punkt zwrotny/akcja), Epilog (finał).
   - Wykryj "Time of Day": morning, afternoon, golden_hour, evening, night.
2. ARC EMOCJONALNY:
   - Buduj napięcie. Zacznij od intrygującego wstępu, przejdź do rozwinięcia, a następnie do szczytu dramaturgicznego i wyciszenia.
3. INTELIGENTNY MONTAŻ (BRAK SZTUCZNYCH OGRANICZEŃ DŁUGOŚCI):
   - Dopasuj długość każdego ujęcia do jego naturalnej treści i dramaturgii.
   - Nie narzucaj sztywnych limitów: ujęcia detali mogą trwać 3-6s, sceny ruchu 5-15s, a kluczowe dialogi i wypowiedzi pełną długość nagrania!
4. DYNAMICZNE PRZEJŚCIA:
   - Wybieraj spośród: "dissolve", "dip_black", "dip_white", "zoom", "blur", "light_leak", "film_burn", "fade", "slide", "wipe".
   - Dopasuj transition do nastroju klipu: 
     * cinematic -> dissolve / dip_black / fade
     * energetic -> zoom / film_burn / wipe
     * solemn -> dip_black / fade
     * modern -> slide / dissolve
   - "cut" (brak przejścia) stosuj przy szybkim tempie.

Wytyczne tempa montażu: "${pacing}".

Klipy:
${JSON.stringify(clips.map((c: any) => ({
  id: c.id,
  name: c.name,
  duration: c.duration,
  capturedAt: c.capturedAt || c.createdAt,
  tags: c.tags,
  comment: c.comment
})), null, 2)}
`;

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storyConcept: { type: Type.STRING },
          musicSuggestion: { type: Type.STRING },
          orderedSequence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipId: { type: Type.STRING },
                targetOrder: { type: Type.NUMBER },
                smartTitle: { type: Type.STRING },
                subtitleCaption: { type: Type.STRING },
                category: { type: Type.STRING },
                emotion: { type: Type.STRING },
                timeOfDay: { type: Type.STRING },
                transition: { type: Type.STRING },
                trimStart: { type: Type.NUMBER },
                trimEnd: { type: Type.NUMBER },
                directorReason: { type: Type.STRING }
              },
              required: ["clipId", "targetOrder", "smartTitle", "subtitleCaption", "category", "transition", "emotion", "timeOfDay"]
            }
          }
        },
        required: ["storyConcept", "musicSuggestion", "orderedSequence"]
      }
    };

    let result: any = null;

    try {
      const response = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1200
      );
      result = JSON.parse(response.text || '{}');
    } catch (err1: any) {
      console.log('Fallback flash-lite dla smart-chronological-sequencing.');
      try {
        const fallbackRes = await retryWithBackoff(() =>
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig
          }),
          1,
          800
        );
        result = JSON.parse(fallbackRes.text || '{}');
      } catch (err2: any) {
        console.log('Algorytm regułowy dla sekwencjonowania chronologicznego.');
      }
    }

    // Helper function to produce beautiful Polish scene titles without technical filenames
    const sanitizeSceneTitle = (title: string, cat: string, index: number): string => {
      let t = (title || '').replace(/\.[a-zA-Z0-9]{2,5}$/i, '').trim();
      const isTechnical = !t || 
        /\.(mp4|mov|avi|mkv|jpg|jpeg|png)$/i.test(title || '') ||
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

    if (!result || !result.orderedSequence || result.orderedSequence.length === 0) {
      const sortedClips = [...clips].sort((a: any, b: any) => {
        const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      });

      const categoriesList = ['opening', 'a_roll', 'b_roll', 'action', 'climax', 'ending'];

      const fallbackSequence = sortedClips.map((clip: any, idx: number) => {
        const catIdx = Math.min(categoriesList.length - 1, Math.floor((idx / sortedClips.length) * categoriesList.length));
        const cat = categoriesList[catIdx];
        const clipDur = clip.duration || 10;
        const trimEnd = clipDur;
        const cleanTitle = sanitizeSceneTitle(clip.name, cat, idx);

        return {
          clipId: clip.id,
          targetOrder: idx + 1,
          smartTitle: cleanTitle,
          subtitleCaption: `Ujęcie filmowe – ${cleanTitle}.`,
          category: cat,
          transition: idx === 0 ? 'dip_black' : 'dissolve',
          trimStart: 0,
          trimEnd: Number(trimEnd.toFixed(2)),
          directorReason: "Ułożono precyzyjnie według naturalnej chronologii z zachowaniem pełnej treści sceny."
        };
      });

      result = {
        storyConcept: `Kinowa kronika wideo ułożona w naturalnej chronologii z płynnymi przejściami i kartami scen.`,
        musicSuggestion: "Akustyczny fortepian i orkiestra symfoniczna (75-90 BPM)",
        orderedSequence: fallbackSequence
      };
    } else {
      const clipMap = new Map(clips.map((c: any) => [c.id, c]));
      result.orderedSequence = result.orderedSequence.map((item: any, idx: number) => {
        const origClip = clipMap.get(item.clipId);
        const totalDur = origClip ? origClip.duration : 15;
        
        let tStart = typeof item.trimStart === 'number' && item.trimStart >= 0 ? item.trimStart : 0;
        let tEnd = typeof item.trimEnd === 'number' && item.trimEnd > tStart ? item.trimEnd : totalDur;
        
        if (tEnd > totalDur) tEnd = totalDur;
        if (tStart >= tEnd) tStart = 0;

        const cat = item.category || 'a_roll';
        const cleanTitle = sanitizeSceneTitle(item.smartTitle, cat, idx);
        const cleanSubtitle = (item.subtitleCaption && !item.subtitleCaption.includes('.mp4')) 
          ? item.subtitleCaption 
          : `Wyjątkowe ujęcie filmowe (${cleanTitle}).`;

        return {
          ...item,
          smartTitle: cleanTitle,
          subtitleCaption: cleanSubtitle,
          trimStart: Number(tStart.toFixed(2)),
          trimEnd: Number(tEnd.toFixed(2)),
          transition: item.transition || (idx === 0 ? 'dip_black' : 'dissolve')
        };
      });
    }

    res.json(result);
  } catch (err: any) {
    console.warn('[Chronological Sequencing] Server fallback triggered:', err?.message || err);
    
    const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
    const sortedClips = [...clips].sort((a: any, b: any) => {
      const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    });

    const categoriesList = ['opening', 'a_roll', 'b_roll', 'action', 'climax', 'ending'];
    const fallbackSequence = sortedClips.map((clip: any, idx: number) => {
      const catIdx = Math.min(categoriesList.length - 1, Math.floor((idx / Math.max(1, sortedClips.length)) * categoriesList.length));
      const cat = categoriesList[catIdx];
      const clipDur = clip.duration || 10;
      return {
        clipId: clip.id,
        targetOrder: idx + 1,
        smartTitle: `Scena ${idx + 1}: ${clip.name || 'Ujęcie'}`,
        subtitleCaption: `Ujęcie filmowe w projekcie wideo.`,
        category: cat,
        emotion: 'cinematic',
        timeOfDay: idx < sortedClips.length * 0.3 ? 'morning' : (idx < sortedClips.length * 0.7 ? 'afternoon' : 'evening'),
        transition: idx === 0 ? 'dip_black' : 'dissolve',
        trimStart: 0,
        trimEnd: clipDur,
        directorReason: "Ułożono według chronologii czasu nagrania."
      };
    });

    res.json({
      storyConcept: `Kinowa kronika wideo ułożona w naturalnej chronologii z płynnymi przejściami.`,
      musicSuggestion: "Akustyczny fortepian i orkiestra symfoniczna (75-90 BPM)",
      orderedSequence: fallbackSequence
    });
  }
});

// Catch-all 404 for API routes to prevent serving index.html for failed API requests
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Nie odnaleziono endpointu API: ${req.originalUrl}` });
});

// Global error handler for unhandled exceptions in routes
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Global Server Error]', err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Wystąpił nieoczekiwany błąd serwera', 
      details: err?.message || String(err) 
    });
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const staticPath = fs.existsSync(path.join(distPath, 'index.html')) ? distPath : null;

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && staticPath) {
    console.log(`[Production] Serving static files from: ${staticPath}`);
    app.use(express.static(staticPath, { maxAge: '1h' }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  } else {
    // Development mode - Mount Vite middlewares for instant live updates
    console.log('[Dev/Live] Mounting Vite SPA middlewares');
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error('[Server] Vite middleware error:', viteErr);
      if (staticPath) {
        app.use(express.static(staticPath, { maxAge: '1h' }));
        app.get('*', (req, res) => {
          res.sendFile(path.join(staticPath, 'index.html'));
        });
      }
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KAPI-STUDIO server running on port ${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
