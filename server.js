// server.ts
import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs";
import multer from "multer";
import * as https from "node:https";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
if (globalThis.__dirname === ".") {
  delete globalThis.__dirname;
}
if (globalThis.__filename === ".") {
  delete globalThis.__filename;
}
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
  }
}
if (dns.setDefaultAutoSelectFamily) {
  try {
    dns.setDefaultAutoSelectFamily(true);
  } catch {
  }
}
try {
  const globalAgent = new Agent({
    connect: {
      timeout: 3e4,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1e3
    },
    keepAliveTimeout: 5e3,
    keepAliveMaxTimeout: 45e3
  });
  setGlobalDispatcher(globalAgent);
} catch (agentErr) {
  console.warn("[Server] Note on global Undici dispatcher setup:", agentErr);
}
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.use(cors());
app.use(express.json({ limit: "2048mb" }));
app.use(express.urlencoded({ limit: "2048mb", extended: true }));
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptime: Math.floor(process.uptime()),
    port: PORT,
    environment: process.env.NODE_ENV || "development"
  });
});
app.get("/api/firebase-status", (req, res) => {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      res.json({
        status: "connected",
        projectId: config.projectId,
        databaseId: config.firestoreDatabaseId,
        tier: "Firebase Spark (Free Tier: 50k reads/day, 20k writes/day, 1GB data)",
        storageBucket: config.storageBucket,
        authDomain: config.authDomain
      });
    } else {
      res.json({ status: "not_configured" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2048 * 1024 * 1024 }
  // 2GB limit per video export
});
var aiClient = null;
function getAI() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
var ai = new Proxy({}, {
  get(_target, prop) {
    return getAI()[prop];
  }
});
async function retryWithBackoff(fn, retries = 2, delayMs = 1e3) {
  try {
    return await fn();
  } catch (err) {
    const errStr = typeof err === "string" ? err : err?.message || JSON.stringify(err || "");
    const isRetryable = (err?.status === "RESOURCE_EXHAUSTED" || err?.status === 429 || err?.status === 503 || err?.status === "UNAVAILABLE" || err?.error?.code === 429 || err?.error?.code === 503 || err?.error?.status === "UNAVAILABLE" || errStr.includes("429") || errStr.includes("503") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("UNAVAILABLE") || errStr.includes("quota") || errStr.includes("limit reached") || errStr.includes("high demand") || errStr.includes("temporarily unavailable") || errStr.includes("ECONNRESET") || errStr.includes("ETIMEDOUT") || err?.name === "FetchError") && err?.status !== 402 && err?.error?.code !== 402 && !errStr.includes("402") && !errStr.includes("credits are depleted");
    if (retries > 0 && isRetryable) {
      console.log(`[AI Retry] Retrying in ${delayMs}ms... (attempts left: ${retries}). Error: ${errStr.substring(0, 80)}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, retries - 1, Math.round(delayMs * 1.5));
    }
    throw err;
  }
}
async function executeWithModelFallback(taskFn, models = ["gemini-3.1-flash-lite", "gemini-3.8-flash"]) {
  let lastError = null;
  for (const model of models) {
    try {
      return await retryWithBackoff(() => taskFn(model), 1, 800);
    } catch (err) {
      lastError = err;
      const errStr = typeof err === "string" ? err : err?.message || JSON.stringify(err || "");
      console.warn(`[AI Failover] Model ${model} under load (${errStr.substring(0, 60)}). Switching to backup model.`);
    }
  }
  throw lastError;
}
var moodDirectives = {
  high_quality: {
    name: "Master Quality Studio Cut",
    style: "Szlachetny reporta\u017C kinowy najwy\u017Cszej pr\xF3by. Autentyczne, g\u0142\u0119bokie emocje, naturalne \u015Bwiat\u0142o, mi\u0119kki bokeh, kinowa proporcja 2.39:1 i precyzyjny monta\u017C z naciskiem na dramaturgi\u0119 i mikro-ekspresje.",
    musicStyle: "Emocjonalna orkiestracja symfoniczna (akustyczny fortepian, sekcja smyczkowa, studyjna przestrze\u0144).",
    voiceoverStyle: "G\u0142\u0119boki, ciep\u0142y, dojrza\u0142y lektor snuj\u0105cy wci\u0105gaj\u0105c\u0105 opowie\u015B\u0107.",
    timelineGuidelines: "Mistrzowska dramaturgia \u2013 budowanie napi\u0119cia od spowolnionego wprowadzenia, przez punkt kulminacyjny, a\u017C po wyraziste zako\u0144czenie."
  },
  cinematic: {
    name: "Kinowy Film Fabularny / Trailer",
    style: "Dramatyczny, zwiastunowy charakter z g\u0142\u0119bokimi cieniami, kontrastowym o\u015Bwietleniem i kinowym ruchem kamery (dron, slidery, gimbal).",
    musicStyle: "Epicki, rosn\u0105cy aran\u017C symfoniczny z pulsuj\u0105c\u0105 perkusj\u0105 filmow\u0105 i d\u0119tymi akcentami.",
    voiceoverStyle: "Dojrza\u0142y, dostojny i intryguj\u0105cy voiceover kinowy z pauzami buduj\u0105cymi napi\u0119cie.",
    timelineGuidelines: "Segmentowa struktura 5 akt\xF3w (Prolog -> Ekspozycja -> Punkt Zwrotny -> Kulminacja -> Epilog)."
  },
  documentary: {
    name: "Dokument & Reporta\u017C",
    style: "Autentyczny zapis fakt\xF3w, surowe pi\u0119kno otoczenia, wywiady z bohaterami oraz przebitki detali i kontekstu miejsca.",
    musicStyle: "Minimalistyczny ambient, ciep\u0142a gitara akustyczna i subtelne smyczki.",
    voiceoverStyle: "Spokojny, obiektywny i wiarygodny g\u0142os przewodnika lub dziennikarza.",
    timelineGuidelines: "Harmonijny monta\u017C \u0142\u0105cz\u0105cy wypowiedzi (A-Roll) z bogatym materia\u0142em ilustracyjnym (B-Roll)."
  },
  commercial: {
    name: "Spot Reklamowy & Promo",
    style: "Dynamiczny, nowoczesny monta\u017C marketingowy z silnym hookiem w pierwszych sekundach, rytmem i wyra\u017Anym call-to-action.",
    musicStyle: "Nowoczesny beat elektroniczny, upbeat funk lub dynamiczny cinematic percussion (110-128 BPM).",
    voiceoverStyle: "Pewny siebie, energiczny, profesjonalny i perswazyjny g\u0142os lektorski.",
    timelineGuidelines: "Kr\xF3tkie, wyraziste ci\u0119cia (Hook 0-3s -> Problem -> Rozwi\u0105zanie -> Korzy\u015Bci -> CTA)."
  },
  travel: {
    name: "Dziennik Podr\xF3\u017Cy & Przygoda",
    style: "Szerokie plany krajobrazu, uj\u0119cia z drona, z\u0142ota godzina i autentyczna pasja odkrywania \u015Bwiata.",
    musicStyle: "Inspiruj\u0105cy indie-folk, dynamiczny world music lub atmosferyczny ambient ze \u015Bwiergotem natury.",
    voiceoverStyle: "Ciep\u0142y, osobisty pami\u0119tnik podr\xF3\u017Cnika pe\u0142en zachwytu i refleksji.",
    timelineGuidelines: "Rytm podr\xF3\u017Cy \u2013 przeplatanie dynamicznych uj\u0119\u0107 drogi ze statycznymi, malowniczymi pejza\u017Cami."
  },
  energetic: {
    name: "Dynamiczny Teledysk & Akcja",
    style: "Porywaj\u0105cy, rytmiczny monta\u017C z synchronizacj\u0105 z muzyk\u0105 (beat-matching), \u017Cywymi barwami i dynamicznymi przej\u015Bciami.",
    musicStyle: "Upbeat pop/electronic mashup z wyrazistym basowym kickiem (120-130 BPM).",
    voiceoverStyle: "Energiczny, entuzjastyczny g\u0142os buduj\u0105cy wysoki poziom adrenaliny.",
    timelineGuidelines: "Kr\xF3tkie ci\u0119cia w punkt uderzenia stopy perkusji, speed-rampy i szybkie zbli\u017Cenia."
  },
  modern: {
    name: "Modern Social Reel & Aesthetic",
    style: "\u015Awie\u017Cy, minimalistyczny styl inspirowany estetyk\u0105 nowoczesnych medi\xF3w cyfrowych. Wyrazista typografia i estetyczne kadrowanie.",
    musicStyle: "Stylowy lo-fi, chill-house lub nowofalowy elektroniczny soundscape.",
    voiceoverStyle: "Lekki, bezpo\u015Bredni, autentyczny i naturalny ton wsp\xF3\u0142czesnego tw\xF3rcy.",
    timelineGuidelines: "Aesthetic cuts, mikro-detale, p\u0142ynne zoomy i dynamiczne plansze tytu\u0142owe."
  },
  romantic: {
    name: "Nastrojowy Film Wspomnieniowy",
    style: "Pastelowa, poetycka aura z mi\u0119kkim \u015Bwiat\u0142em. Skupienie na ma\u0142ych gestach, blisko\u015Bci, u\u015Bmiechach i nastrojowych kadrach w plenerze.",
    musicStyle: "Ciep\u0142y akustyczny duet fortepianu i gitary z aksamitnym podk\u0142adem smyczkowym (60-75 BPM).",
    voiceoverStyle: "Czu\u0142a, poetycka narracja z intymnymi refleksjami i ciep\u0142ym g\u0142osem lektora.",
    timelineGuidelines: "P\u0142ynny, zmys\u0142owy monta\u017C oparty na uj\u0119ciach w zwolnionym tempie i \u0142agodnych przenikaniach."
  },
  nostalgic: {
    name: "Ponadczasowy Analog 35mm / Vintage",
    style: "Klimat ta\u015Bmy celuloidowej, ciep\u0142e odcienie, organiczne mikro-ziarno, winieta i nostalgiczna barwa \u015Bwiat\u0142a.",
    musicStyle: "Nostalgiczny akustyczny utw\xF3r z delikatnym szumem winylu, pianinem i instrumentami smyczkowymi.",
    voiceoverStyle: "Ciep\u0142y, gaw\u0119dziarski g\u0142os przypominaj\u0105cy ponadczasowe historie i wspomnienia.",
    timelineGuidelines: "Ciep\u0142e, powolne uj\u0119cia buduj\u0105ce g\u0142\u0119bok\u0105 atmosfer\u0119 pami\u0119ci i nostalgii."
  }
};
function generateFallbackStory(analyzedItems = [], mood = "cinematic") {
  const items = analyzedItems.length > 0 ? analyzedItems : [
    { name: "Prolog i Uj\u0119cia Wst\u0119pne", type: "video", description: "Wprowadzenie w \u015Bwiat i atmosfer\u0119 opowie\u015Bci" },
    { name: "G\u0142\xF3wny W\u0105tek i Postacie", type: "video", description: "Ekspozycja bohater\xF3w i kluczowe sceny" },
    { name: "Punkt Zwrotny i Rozwini\u0119cie", type: "video", description: "Dynamiczny rozw\xF3j akcji i kulisy" },
    { name: "Fina\u0142 i Kredyty Ko\u0144cowe", type: "video", description: "Kulminacja wydarze\u0144 i podsumowanie" }
  ];
  const moodTemplates = {
    cinematic: {
      title: "Pocz\u0105tek Nowego Horyzontu \u2013 Master Cut",
      concept: "Monumentalny, wielow\u0105tkowy reporta\u017C kinowy ukazuj\u0105cy histori\u0119 w epickich kadrach i symfonicznej oprawie d\u017Awi\u0119kowej.",
      music: "Hans Zimmer style \u2013 Time & Epiphany (Cinematic Orchestral Suite)",
      actions: [
        "Prolog \u2013 majestatyczne kadry detali, gra \u015Bwiate\u0142 w porannym s\u0142o\u0144cu i narastaj\u0105ce napi\u0119cie",
        "Ekspozycja \u2013 prezentacja bohater\xF3w, motywacji i przestrzeni narracyjnej",
        "Punkt zwrotny \u2013 nieoczekiwane wydarzenie zmieniaj\u0105ce bieg historii",
        "G\u0142\xF3wna akcja \u2013 dynamiczne, pe\u0142ne emocji uj\u0119cia z bliska",
        "Kulminacja \u2013 maksymalne napi\u0119cie dramaturgiczne i szczyt emocjonalny",
        "Wyciszenie \u2013 refleksyjne spojrzenie na przebyte wyzwania",
        "Fina\u0142owy epilog \u2013 kinowe zamkni\u0119cie i napisy ko\u0144cowe"
      ],
      voiceover: "S\u0105 historie, kt\xF3re nie potrzebuj\u0105 s\u0142\xF3w, bo ka\u017Cda klatka niesie w sobie prawd\u0119 o cz\u0142owieku i jego drodze."
    },
    documentary: {
      title: "G\u0142os \u015Awiadk\xF3w \u2013 Kronika Wydarze\u0144",
      concept: "Autentyczny i poruszaj\u0105cy zapis fakt\xF3w, \u0142\u0105cz\u0105cy szczere wypowiedzi rozm\xF3wc\xF3w z bogatym materia\u0142em archiwalnym i plenerowym.",
      music: "Max Richter \u2013 On The Nature of Daylight (Ambient Piano & Strings)",
      actions: [
        "Wprowadzenie w temat \u2013 t\u0142o historyczne, lokalizacja i pierwsze fakty",
        "Wywiad kluczowy \u2013 intymne wyznania i osobista perspektywa \u015Bwiadka",
        "Przebitki ilustracyjne \u2013 detale dokument\xF3w, archiwalne kadry i otoczenie",
        "Konfrontacja z rzeczywisto\u015Bci\u0105 \u2013 kluczowe dowody i punkt kulminacyjny \u015Bledztwa",
        "Podsumowanie i wnioski na przysz\u0142o\u015B\u0107 \u2013 g\u0142os ekspert\xF3w",
        "Fina\u0142owe uj\u0119cie i plansze informacyjne"
      ],
      voiceover: "Prawda nie le\u017Cy na powierzchni. Wymaga cierpliwo\u015Bci, by ws\u0142ucha\u0107 si\u0119 w to, co najwa\u017Cniejsze."
    },
    commercial: {
      title: "Zdefiniuj Przysz\u0142o\u015B\u0107 \u2013 Spot Promocyjny",
      concept: "Maksymalnie anga\u017Cuj\u0105cy, dynamiczny monta\u017C reklamowy z natychmiastowym zatrzymaniem uwagi i jasnym przes\u0142aniem.",
      music: "Modern High-Energy Electronic Beats (124 BPM Future Bass)",
      actions: [
        "Hook 0-3s \u2013 hipnotyzuj\u0105ce, ultra-dynamiczne uj\u0119cie przyci\u0105gaj\u0105ce wzrok",
        "Problem i wyzwanie \u2013 ukazanie realnej potrzeby rynkowej",
        "Prze\u0142omowa innowacja \u2013 dynamiczne zbli\u017Cenia na produkt i technologi\u0119",
        "Do\u015Bwiadczenie w praktyce \u2013 u\u015Bmiech i satysfakcja u\u017Cytkownika",
        "Kluczowe korzy\u015Bci \u2013 szybkie ci\u0119cia detali i efektowne przej\u015Bcia",
        "Call to Action (CTA) \u2013 mocne logo, has\u0142o przewodnie i wezwanie do dzia\u0142ania"
      ],
      voiceover: "Przysz\u0142o\u015B\u0107 nie czeka na nikogo. B\u0105d\u017A o krok przed wszystkimi \u2013 odkryj now\u0105 definicj\u0119 perfekcji."
    },
    travel: {
      title: "\u015Acie\u017Cki Nieznanego \u2013 Dziennik Podr\xF3\u017Cy",
      concept: "Malowniczy esej podr\xF3\u017Cniczy celebruj\u0105cy majestat natury, lokaln\u0105 kultur\u0119 i wolno\u015B\u0107 odkrywania \u015Bwiata.",
      music: "Bon Iver / ODESZA \u2013 A Moment Apart (Indie Electronic Chill)",
      actions: [
        "Wyruszenie w drog\u0119 \u2013 wsch\xF3d s\u0142o\u0144ca, przygotowanie sprz\u0119tu i pierwsze kilometry",
        "Majestat krajobrazu \u2013 szerokie panoramy z drona i bezkres natury",
        "Spotkania z lud\u017Ami \u2013 autentyczne u\u015Bmiechy, lokalne smaki i kultura",
        "Z\u0142ota godzina \u2013 ciep\u0142e promienie s\u0142o\u0144ca muskaj\u0105ce horyzont",
        "Wieczorne ognisko \u2013 chwile wyciszenia pod rozgwie\u017Cd\u017Conym niebem",
        "Powr\xF3t ze wspomnieniami \u2013 ostatnie spojrzenie na przebyt\u0105 drog\u0119"
      ],
      voiceover: "Podr\xF3\u017Cowanie to nie ucieczka. To powr\xF3t do tego, co w nas najprostsze i najprawdziwsze."
    },
    energetic: {
      title: "Czysta Energia \u2013 Dynamic Showcase",
      concept: "Porywaj\u0105cy teledysk o zawrotnym tempie, perfekcyjnie zsynchronizowany z ka\u017Cdym uderzeniem basu.",
      music: "Swedish House Mafia / The Weeknd \u2013 High Energy Bass Mix",
      actions: [
        "Odliczanie do dropu \u2013 rosn\u0105ce tempo, mikro-ci\u0119cia i b\u0142yski \u015Bwiat\u0142a",
        "Wybuch energii \u2013 spektakularne uj\u0119cia akcji i dynamiczny ruch kamery",
        "Speed-ramps i rotacje \u2013 widowiskowe akrobacje i popisy",
        "Kulminacja rytmu \u2013 salwy \u015Bwiate\u0142, dym i nieskr\u0119powana pasja",
        "Fina\u0142owy drop \u2013 pot\u0119\u017Cne uderzenie basu i zamro\u017Cenie klatki"
      ],
      voiceover: "Gdy pasja przejmuje kontrol\u0119, ka\u017Cda sekunda zamienia si\u0119 w czyst\u0105 energi\u0119."
    },
    romantic: {
      title: "Niezapomniane Chwile \u2013 Poemat Wizualny",
      concept: "Nastrojowy, pe\u0142en ciep\u0142a reporta\u017C filmowy \u0142\u0105cz\u0105cy najwa\u017Cniejsze chwile i emocje bohater\xF3w.",
      music: "Ludovico Einaudi \u2013 Nuvole Bianche (Cinematic Piano & String Mix)",
      actions: [
        "Pocz\u0105tek opowie\u015Bci \u2013 czu\u0142e spojrzenia, przygotowania i ciche bicie serca",
        "Kluczowe spotkanie \u2013 uroczysty moment i szczere emocje najbli\u017Cszych",
        "Wsp\xF3lne chwile w plenerze \u2013 z\u0142ota godzina i naturalny u\u015Bmiech",
        "Radosna celebracja \u2013 toasty, muzyka i spontaniczny taniec",
        "Fina\u0142owy spacer w ciep\u0142ym blasku \u015Bwiate\u0142 i po\u017Cegnanie dnia"
      ],
      voiceover: "To by\u0142 moment, w kt\xF3rym ka\u017Cde spojrzenie mia\u0142o znaczenie, a wspomnienia sta\u0142y si\u0119 wieczne."
    },
    nostalgic: {
      title: "Kronika Wspomnie\u0144 \u2013 Vintage 35mm",
      concept: "Ciep\u0142a, poetycka opowie\u015B\u0107 w stylu retro, skupiona na autentyczno\u015Bci i ponadczasowym uroku.",
      music: "Acoustic Strings & Folk Choir with Vinyl Warmth",
      actions: [
        "Promienie s\u0142o\u0144ca przez okno \u2013 spok\xF3j i ciep\u0142o poranka",
        "Uchwycone spojrzenia \u2013 szczere u\u015Bmiechy i g\u0142\u0119bokie spojrzenia w obiektyw",
        "Wsp\xF3lne chwile \u2013 beztroska rado\u015B\u0107 w gronie przyjaci\xF3\u0142",
        "Ciep\u0142e, z\u0142ociste \u015Bwiat\u0142o zmierzchu \u2013 spacer w\u015Br\xF3d natury",
        "Ciche zamkni\u0119cie \u2013 nostalgiczny kadr na koniec pi\u0119knego dnia"
      ],
      voiceover: "Prawdziwe pi\u0119kno kryje si\u0119 w prostych chwilach, kt\xF3re trwaj\u0105 w naszej pami\u0119ci na zawsze."
    }
  };
  const selected = moodTemplates[mood] || moodTemplates.cinematic;
  const defaultClipNames = [
    "Prolog i uj\u0119cia wprowadzaj\u0105ce.mp4",
    "Ekspozycja i g\u0142\xF3wni bohaterowie.mp4",
    "Punkt kulminacyjny akcji.mp4",
    "Dynamiczna sekwencja plenerowa.mp4",
    "Scena dialogowa i zbli\u017Cenia.mp4",
    "Atmosferyczne przebitki B-roll.mp4",
    "Fina\u0142 i kinowe podsumowanie.mp4"
  ];
  const itemsList = Array.isArray(items) && items.length > 0 ? items : defaultClipNames.map((name) => ({ name }));
  const timeline = itemsList.map((item, idx) => {
    const startSecTotal = idx * 30;
    const endSecTotal = (idx + 1) * 30;
    const sMin = Math.floor(startSecTotal / 60);
    const sSec = startSecTotal % 60;
    const eMin = Math.floor(endSecTotal / 60);
    const eSec = endSecTotal % 60;
    const timeStr = `${sMin}:${sSec < 10 ? "0" : ""}${sSec}-${eMin}:${eSec < 10 ? "0" : ""}${eSec}`;
    return {
      time: timeStr,
      elementName: item?.name || `Uj\u0119cie ${idx + 1}`,
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
async function fetchDriveFileBase64(fileId, token) {
  return retryWithBackoff(async () => {
    const urlMetadata = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`;
    const urlMedia = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headers = { Authorization: `Bearer ${token}` };
    const driveFetch = (url) => {
      return new Promise((resolve, reject) => {
        https.get(url, { headers, family: 4 }, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Drive API error: ${res.statusCode}`));
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers }));
        }).on("error", reject);
      });
    };
    try {
      const metaRes = await driveFetch(urlMetadata);
      const meta = JSON.parse(metaRes.buffer.toString());
      const mediaRes = await driveFetch(urlMedia);
      return {
        base64: mediaRes.buffer.toString("base64"),
        mimeType: meta.mimeType || "application/octet-stream"
      };
    } catch (err) {
      throw err;
    }
  }, 2, 800);
}
app.post("/api/analyze-media", async (req, res) => {
  try {
    const { items, fileData, mimeType, fileName, accessToken } = req.body;
    let normalizedItems = [];
    if (Array.isArray(items) && items.length > 0) {
      normalizedItems = items;
    } else if (fileData || fileName) {
      normalizedItems = [{
        name: fileName || "Materia\u0142 wideo",
        base64: fileData || "",
        mimeType: mimeType || "image/jpeg",
        type: "local"
      }];
    }
    if (!normalizedItems || !normalizedItems.length) {
      return res.status(200).json({
        description: "Uj\u0119cie studyjne",
        results: [{ name: "Uj\u0119cie wideo", type: "image", description: "Uj\u0119cie studyjne wideo" }]
      });
    }
    const analysisResults = [];
    for (const item of normalizedItems) {
      const itemName = item.name || item.fileName || "Uj\u0119cie wideo";
      console.log(`Analyzing item: ${itemName} (${item.type || "local"})`);
      let base64 = "";
      let itemMimeType = item.mimeType || "image/jpeg";
      if (item.type === "drive" && item.id) {
        if (!accessToken) {
          analysisResults.push({
            name: itemName,
            type: "video",
            description: `Uj\u0119cie z Google Drive: ${itemName}`,
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
            type: "video",
            description: `Uj\u0119cie z Google Drive: ${itemName}`,
            transcription: null
          });
          continue;
        }
      } else {
        base64 = item.base64 || item.fileData || "";
      }
      const isVideo = itemMimeType.startsWith("video/");
      const isImage = itemMimeType.startsWith("image/");
      if (isVideo) {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          const modelResponse = await retryWithBackoff(
            () => ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: `Analiza uj\u0119cia wideo dla studia monta\u017Cu filmowego. Zwr\xF3\u0107 JSON:
{
  "description": "kr\xF3tki, profesjonalny opis sceny (2-3 zdania)",
  "emotion": "cinematic" | "energetic" | "nostalgic" | "solemn" | "joyful" | "neutral" | "dramatic",
  "timeOfDay": "morning" | "afternoon" | "golden_hour" | "evening" | "night",
  "sceneType": "detale" | "ludzie" | "akcja" | "krajobraz" | "dialog" | "architektura"
}` }
                ]
              },
              config: { responseMimeType: "application/json" }
            })
          );
          const parsed = JSON.parse(modelResponse.text || "{}");
          analysisResults.push({
            name: itemName,
            type: "video",
            description: parsed.description || `Uj\u0119cie wideo: ${itemName}`,
            emotion: parsed.emotion || "neutral",
            timeOfDay: parsed.timeOfDay || "afternoon",
            sceneType: parsed.sceneType || "akcja",
            transcription: null
          });
        } catch (videoErr) {
          console.log("Dostosowanie opisu wideo:", videoErr.message);
          analysisResults.push({
            name: itemName,
            type: "video",
            description: `Uj\u0119cie wideo: ${itemName} \u2013 uj\u0119cie filmowe do monta\u017Cu.`,
            emotion: "neutral",
            timeOfDay: "afternoon",
            sceneType: "akcja",
            transcription: null
          });
        }
      } else {
        try {
          if (!base64 || base64.length < 10) throw new Error("File too large or no data for inline analysis");
          const modelResponse = await retryWithBackoff(
            () => ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: {
                parts: [
                  { inlineData: { mimeType: itemMimeType, data: base64 } },
                  { text: `Analiza zdj\u0119cia / klatki dla studia monta\u017Cu. Zwr\xF3\u0107 JSON:
{
  "description": "kr\xF3tki opis kadru (1-2 zdania)",
  "emotion": "cinematic" | "energetic" | "nostalgic" | "solemn" | "joyful" | "neutral" | "dramatic",
  "timeOfDay": "morning" | "afternoon" | "golden_hour" | "evening" | "night",
  "sceneType": "detale" | "ludzie" | "akcja" | "krajobraz" | "architektura"
}` }
                ]
              },
              config: { responseMimeType: "application/json" }
            })
          );
          const parsed = JSON.parse(modelResponse.text || "{}");
          analysisResults.push({
            name: itemName,
            type: "image",
            description: parsed.description || `Kadr / Zdj\u0119cie: ${itemName}`,
            emotion: parsed.emotion || "neutral",
            timeOfDay: parsed.timeOfDay || "afternoon",
            sceneType: parsed.sceneType || "ludzie",
            transcription: null
          });
        } catch (imgErr) {
          console.log("Dostosowanie opisu zdj\u0119cia:", imgErr.message);
          analysisResults.push({
            name: itemName,
            type: "image",
            description: `Kadr / Zdj\u0119cie: ${itemName} \u2013 uj\u0119cie graficzne.`,
            emotion: "neutral",
            timeOfDay: "afternoon",
            sceneType: "ludzie",
            transcription: null
          });
        }
      }
    }
    const singleDescription = analysisResults[0]?.description || "Uj\u0119cie wideo do projektu monta\u017Cowego.";
    res.json({ description: singleDescription, results: analysisResults });
  } catch (err) {
    console.error("Analyze media error:", err);
    res.json({
      description: "Klatka z projektu wideo.",
      results: [{ name: "Uj\u0119cie filmowe", type: "image", description: "Uj\u0119cie filmowe" }]
    });
  }
});
var handleGenerateStory = async (req, res) => {
  try {
    const { analyzedItems, mood = "cinematic", format = "highlight", extras = [] } = req.body;
    const rawItems = Array.isArray(analyzedItems) && analyzedItems.length > 0 ? analyzedItems : Array.isArray(req.body.items) && req.body.items.length > 0 ? req.body.items : [];
    const moodConfig = moodDirectives[mood] || moodDirectives.cinematic;
    const formatInstructions = "\nWYBRANY FORMAT: Oryginalny format i proporcje filmu (nieokre\u015Blony, zachowuj\u0105cy naturalne uj\u0119cia wideo bez sztucznego kadrowania i bez sztywnego limitu d\u0142ugo\u015Bci).\n- Pacing: P\u0142ynny, kinowy monta\u017C o najwy\u017Cszej jako\u015Bci studyjnej.";
    let extrasInstructions = "";
    if (extras && Array.isArray(extras) && extras.length > 0) {
      extrasInstructions = `
WYBRANE DODATKOWE WSTAWKI DO AUTOMATYCZNEGO WPLECIENIA W O\u015A CZASU:
` + extras.map((e) => {
        if (e === "dynamic_intro") return `- Dynamiczne Intro z tytu\u0142em (efektowny pocz\u0105tek filmu z kinowym motywem wst\u0119pnym)`;
        if (e === "guest_thanks") return `- Podzi\u0119kowania i plansza informacyjna (ciep\u0142y, wzruszaj\u0105cy segment z podzi\u0119kowaniami)`;
        if (e === "outro_credits") return `- Zako\u0144czenie z napisami ko\u0144cowymi (kinowe outro i napisy ko\u0144cowe)`;
        return `- ${e}`;
      }).join("\n") + `
Automatycznie wple\u0107 te wybrane dodatkowe wstawki jako dedykowane pozycje w osi czasu (timeline) na odpowiednich pozycjach (np. intro na samym pocz\u0105tku przed materia\u0142ami, a napisy ko\u0144cowe na samym ko\u0144cu).`;
    }
    const prompt = `
Jeste\u015B nagradzanym re\u017Cyserem i monta\u017Cyst\u0105 film\xF3w najwy\u017Cszej klasy.
Twoim zadaniem jest stworzenie wyj\u0105tkowego scenariusza i narracji wideo z powierzonych uj\u0119\u0107.

WYBRANY NASTR\xD3J I KIERUNEK ARTYSTYCZNY:
\u{1F449} ${moodConfig.name.toUpperCase()}
${formatInstructions}
${extrasInstructions}

WYTYCZNE DLA TEGO NASTROJU:
- Klimat, emocje i narracja: ${moodConfig.style}
- Kierunek muzyczny: ${moodConfig.musicStyle}
- Styl narracji lektorskiej (Voiceover): ${moodConfig.voiceoverStyle}
- Zasady monta\u017Cu na osi czasu: ${moodConfig.timelineGuidelines}

Oto przeanalizowane klipy i zdj\u0119cia:
${JSON.stringify(rawItems, null, 2)}

Zaprojektuj sp\xF3jne, profesjonalne widowisko filmowe \u015Bci\u015Ble w wybranym nastroju "${moodConfig.name}".
Zwr\xF3\u0107 wynik jako JSON z polami:
- "title": Tytu\u0142 filmu idealnie oddaj\u0105cy nastr\xF3j "${moodConfig.name}"
- "concept": Koncept i motyw przewodni z uwzgl\u0119dnieniem wybranego stylu
- "musicSuggestion": Konkretna propozycja utworu muzycznego (wykonawca i tytu\u0142) pasuj\u0105ca do: ${moodConfig.musicStyle}
- "timeline": Tablica obiekt\xF3w { "time": "zakres np. 0:00-0:15", "elementName": "nazwa pliku lub wstawki", "action": "precyzyjny opis uj\u0119cia, dynamiki, przej\u015Bcia i emocji zgodny z nastrojem" }
- "voiceover": Porywaj\u0105cy tekst z offu dla lektora napisany w stylu: "${moodConfig.voiceoverStyle}".
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
    let storyData = null;
    try {
      const response = await executeWithModelFallback(
        (modelName) => ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ["gemini-3.1-flash-lite", "gemini-3.8-flash"]
      );
      const parsed = JSON.parse(response.text || "{}");
      if (parsed.timeline && parsed.title) {
        storyData = parsed;
      }
    } catch (modelErr) {
      console.log("Automatyczne przej\u015Bcie do trybu re\u017Cysera offline dla scenariusza.");
    }
    if (!storyData || !storyData.timeline || storyData.timeline.length === 0) {
      console.log(`Prze\u0142\u0105czono na re\u017Cysera awaryjnego offline dla nastroju '${mood}'`);
      storyData = generateFallbackStory(rawItems, mood);
    }
    return res.json({ ...storyData, mood });
  } catch (err) {
    console.error("[AI Director] Error generating story:", err);
    if (err?.cause) console.error("[AI Director] Cause:", err.cause?.message || err.cause);
    console.log("Automatyczne przej\u015Bcie do trybu standardowego dla scenariusza.");
    const fallback = generateFallbackStory(req.body?.analyzedItems || req.body?.items, req.body?.mood || "romantic");
    res.json(fallback);
  }
};
app.post("/api/generate-story", handleGenerateStory);
app.post("/api/generate-storyboard", handleGenerateStory);
app.get("/api/drive/stream/:id", async (req, res) => {
  const fileId = req.params.id;
  const token = req.query.accessToken || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing access token" });
  const headers = {
    "Authorization": `Bearer ${token}`
  };
  if (req.headers.range) {
    headers["Range"] = req.headers.range;
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const executeRequest = (attempt = 1) => {
    const request = https.get(url, { headers, family: 4 }, (driveRes) => {
      if (driveRes.statusCode === 301 || driveRes.statusCode === 302 || driveRes.statusCode === 307 || driveRes.statusCode === 308) {
        if (driveRes.headers.location) {
          https.get(driveRes.headers.location, { headers, family: 4 }, (redirectRes) => {
            handleResponse(redirectRes);
          }).on("error", handleError);
          return;
        }
      }
      handleResponse(driveRes);
    });
    const handleResponse = (driveRes) => {
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
      const contentType = driveRes.headers["content-type"] || "video/mp4";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (driveRes.headers["content-range"]) res.setHeader("Content-Range", driveRes.headers["content-range"]);
      if (driveRes.headers["content-length"]) res.setHeader("Content-Length", driveRes.headers["content-length"]);
      driveRes.pipe(res);
    };
    const handleError = (err) => {
      if (attempt < 2) {
        console.log(`[Server] Drive stream retry ${attempt}/2 due to error: ${err.message}`);
        executeRequest(attempt + 1);
        return;
      }
      console.warn("[Server] Drive stream connection error (https):", err.message);
      if (err.cause) {
        console.warn("[Server] Drive stream error cause:", err.cause.message || err.cause);
      }
      if (!res.headersSent) {
        res.status(504).json({ error: "B\u0142\u0105d strumieniowania z Dysku Google" });
      }
    };
    request.on("error", handleError);
    req.on("close", () => {
      request.destroy();
    });
  };
  executeRequest();
});
app.get("/api/drive/list", async (req, res) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12e3);
  try {
    const token = req.query.accessToken || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(200).json({ files: [], requiresAuth: true, error: "Wymagany token autoryzacji Google" });
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
        error: isAuthOrScope ? "INSUFFICIENT_SCOPE" : `B\u0142\u0105d Google Drive (${driveRes.status})`,
        details: errorText
      });
    }
    const data = await driveRes.json();
    res.json({ files: data.files || [] });
  } catch (err) {
    console.warn("[Server] Drive list notice:", err?.message || err);
    res.status(200).json({ files: [], warning: "Drive list unavailable", error: err.message });
  } finally {
    clearTimeout(timeoutId);
  }
});
app.post("/api/drive/upload", async (req, res) => {
  try {
    const { fileName, mimeType, content, isBase64 } = req.body;
    const token = req.body.accessToken || req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Wymagany token autoryzacji Google" });
    if (!fileName || !content) return res.status(400).json({ error: "Brak nazwy pliku lub zawarto\u015Bci" });
    const boundary = "-------GoogleDriveMultipartBoundary314159";
    const delimiter = `\r
--${boundary}\r
`;
    const closeDelimiter = `\r
--${boundary}--`;
    const metadata = {
      name: fileName,
      mimeType: mimeType || "application/json"
    };
    let bodyBuffer;
    if (isBase64) {
      const fileBuffer = Buffer.from(content, "base64");
      const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType || "application/octet-stream"}\r
\r
`;
      bodyBuffer = Buffer.concat([
        Buffer.from(header, "utf8"),
        fileBuffer,
        Buffer.from(closeDelimiter, "utf8")
      ]);
    } else {
      const multipartRequestBody = delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + delimiter + `Content-Type: ${mimeType || "application/json"}\r
\r
` + content + closeDelimiter;
      bodyBuffer = Buffer.from(multipartRequestBody, "utf8");
    }
    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(bodyBuffer.length)
      },
      body: bodyBuffer
    });
    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `B\u0142\u0105d zapisu na Google Drive: ${errorText}` });
    }
    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err) {
    console.error("Drive upload error:", err);
    res.status(500).json({ error: err.message || "B\u0142\u0105d zapisu pliku na Google Drive" });
  }
});
app.post("/api/drive/upload-binary", upload.single("file"), async (req, res) => {
  try {
    const token = req.body.accessToken || req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Wymagany token autoryzacji Google" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Brak przes\u0142anego pliku binarnego" });
    const fileName = req.body.fileName || file.originalname || "film_montaz.mp4";
    const mimeType = req.body.mimeType || file.mimetype || "video/mp4";
    const boundary = "-------GoogleDriveMultipartBoundaryBinary987654";
    const delimiter = `\r
--${boundary}\r
`;
    const closeDelimiter = `\r
--${boundary}--`;
    const metadata = {
      name: fileName,
      mimeType
    };
    const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r
\r
`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(header, "utf8"),
      file.buffer,
      Buffer.from(closeDelimiter, "utf8")
    ]);
    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(bodyBuffer.length)
      },
      body: bodyBuffer
    });
    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return res.status(uploadRes.status).json({ error: `B\u0142\u0105d zapisu wideo na Google Drive: ${errorText}` });
    }
    const fileResult = await uploadRes.json();
    res.json({ success: true, file: fileResult });
  } catch (err) {
    console.error("Drive binary upload error:", err);
    res.status(500).json({ error: err.message || "B\u0142\u0105d zapisu pliku binarnego na Google Drive" });
  }
});
app.post("/api/generate-cover", async (req, res) => {
  try {
    const { prompt, size } = req.body;
    const validSizes = ["1K", "2K", "4K"];
    const imageSize = validSizes.includes(size) ? size : "1K";
    const response = await retryWithBackoff(
      () => ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: {
          parts: [
            { text: prompt || "Pi\u0119kna, artystyczna, kinowa kompozycja filmowa, profesjonalne o\u015Bwietlenie sceniczne, wysmakowany kadr" }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      })
    ).catch((err) => {
      console.log("Prze\u0142\u0105czono na ok\u0142adk\u0119 awaryjn\u0105 (limit API obraz\xF3w).");
      return { fallback: true };
    });
    if (!response || "fallback" in response) {
      return res.json({
        imageUrl: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=1200",
        isFallback: true,
        message: "Osi\u0105gni\u0119to limit generatora AI. U\u017Cyto kinowej ok\u0142adki zast\u0119pczej."
      });
    }
    let base64Image = null;
    const candidates = response.candidates;
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
  } catch (err) {
    console.log("Korzystanie z ok\u0142adki standardowej.");
    res.json({
      imageUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1200",
      isFallback: true,
      message: "U\u017Cyto pi\u0119knej ok\u0142adki zast\u0119pczej."
    });
  }
});
app.post("/api/storyboard-tips", async (req, res) => {
  try {
    const { mood } = req.body;
    const prompt = `Zaproponuj 2 kr\xF3tkie, inspiruj\u0105ce wskaz\xF3wki lub trendy (max 1-2 zdania ka\u017Cda) dotycz\u0105ce technik filmowania, o\u015Bwietlenia lub monta\u017Cu dla wideo w nastroju: ${mood}.
U\u017Cyj narz\u0119dzia Google Search, aby znale\u017A\u0107 najnowsze techniki i trendy. Odpowiedz w j\u0119zyku polskim.`;
    const response = await retryWithBackoff(
      () => ai.models.generateContent({
        model: "gemini-3.8-flash",
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
    const parsed = JSON.parse(response.text || "[]");
    res.json({ tips: parsed });
  } catch (err) {
    console.log("Korzystanie ze standardowych wskaz\xF3wek re\u017Cyserskich.");
    const fallbackTips = [
      "Stosuj przemy\u015Blan\u0105 g\u0142\u0119bi\u0119 ostro\u015Bci i regu\u0142\u0119 tr\xF3jpodzia\u0142u, aby wyr\xF3\u017Cni\u0107 g\u0142\xF3wny motyw sceny i nada\u0107 uj\u0119ciom kinowej plastyki.",
      "Wykorzystaj kontrast o\u015Bwietlenia i 'z\u0142ot\u0105 godzin\u0119', by zbudowa\u0107 g\u0142\u0119bi\u0119 kadru oraz naturalne, organiczne flary optyczne."
    ];
    res.json({ tips: fallbackTips, isFallback: true });
  }
});
app.post("/api/generate-voiceover-tts", async (req, res) => {
  try {
    const { text, style = "cinematic_poetic", projectTitle = "M\xF3j Film Kinowy", coupleNames, voiceName = "Kore" } = req.body;
    const title = projectTitle || coupleNames || "Autorska Produkcja";
    let textToSpeak = text;
    if (!textToSpeak || textToSpeak.length < 5) {
      const scriptPrompt = `Jeste\u015B mistrzem scenopisarstwa i re\u017Cyserii filmowej.
Napisz klimatyczny, wci\u0105gaj\u0105cy i kr\xF3tki (2-4 zdania, ok. 25-45 s\u0142\xF3w) tekst narracyjny z offu (voice-over) dla projektu: "${title}".
Styl i gatunek: "${style}" (np. kinowy zwiastun, nastrojowy dokument, dynamiczna relacja, poetycka refleksja).
Napisz wy\u0142\u0105cznie czysty tekst po polsku, gotowy do odczytania przez profesjonalnego lektora.`;
      try {
        const scriptRes = await retryWithBackoff(
          () => ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: scriptPrompt
          })
        );
        textToSpeak = scriptRes.text?.trim() || "To by\u0142 dzie\u0144, w kt\xF3rym ka\u017Cde spojrzenie mia\u0142o znaczenie, a przysi\u0119ga sta\u0142a si\u0119 pocz\u0105tkiem najpi\u0119kniejszej wsp\xF3lnej drogi.";
      } catch (err) {
        textToSpeak = "Dwa serca, jedna obietnica na ca\u0142e \u017Cycie. Dzi\u015B zaczyna si\u0119 nasza najpi\u0119kniejsza wsp\xF3lna opowie\u015B\u0107.";
      }
    }
    let audioBase64 = null;
    try {
      const ttsResponse = await retryWithBackoff(
        () => ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: {
            role: "user",
            parts: [
              {
                text: textToSpeak
              }
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
        1e3
      );
      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr) {
      console.warn("[TTS] Gemini TTS API unavailable or quota reached:", ttsErr?.message || ttsErr);
    }
    res.json({
      scriptText: textToSpeak,
      audioBase64,
      audioMimeType: "audio/wav",
      voiceName: voiceName || "Kore"
    });
  } catch (err) {
    console.error("Voiceover TTS error:", err);
    res.status(500).json({ error: err?.message || "B\u0142\u0105d generowania lektora AI" });
  }
});
app.post("/api/smart-duration-suggestion", async (req, res) => {
  try {
    const { items, directorNotes, tempo } = req.body;
    const prompt = `Jeste\u015B ekspertem profesjonalnego monta\u017Cu filmowego i re\u017Cyserii kinowej. Przeanalizuj poni\u017Csze uj\u0119cia, notatki re\u017Cyserskie oraz docelowe tempo monta\u017Cu ("${tempo || "kinowe"}").
Notatki re\u017Cysera: "${directorNotes || "Brak dodatkowych notatek"}"

Uj\u0119cia do analizy:
${JSON.stringify(items || [], null, 2)}

Zaproponuj optymalne czasy trwania (w sekundach) dla ka\u017Cdego uj\u0119cia oraz kr\xF3tkie uzasadnienie re\u017Cyserskie, aby idealnie pasowa\u0142y do tempa "${tempo}" i uwzgl\u0119dnia\u0142y notatki.
Odpowiedz jako JSON z polami:
- "overallAdvice": Og\xF3lna wskaz\xF3wka monta\u017Cowa (1-2 zdania)
- "suggestions": Tablica obiekt\xF3w zawieraj\u0105ca { "itemId": "...", "suggestedDuration": numer_w_sekundach, "reason": "uzasadnienie" }
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
    let resultData = null;
    try {
      const response = await executeWithModelFallback(
        (modelName) => ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ["gemini-3.1-flash-lite", "gemini-3.8-flash"]
      );
      resultData = JSON.parse(response.text || "{}");
    } catch (e) {
      console.log("Automatyczne przej\u015Bcie do trybu regu\u0142owego dla smart-duration.");
    }
    if (!resultData || !resultData.suggestions) {
      const tempoMultiplier = tempo === "dynamiczny" ? 0.7 : tempo === "emocjonalny" ? 1.4 : 1;
      const suggestions = (items || []).map((item, idx) => {
        const base = (idx % 2 === 0 ? 4 : 6) * tempoMultiplier;
        return {
          itemId: item.id || String(idx),
          suggestedDuration: Math.round(base * 10) / 10,
          reason: `Dopasowano do tempa ${tempo} na podstawie analizy struktury.`
        };
      });
      resultData = {
        overallAdvice: `Rytm monta\u017Cu "${tempo}" zosta\u0142 zoptymalizowany dla p\u0142ynnego przep\u0142ywu emocji.`,
        suggestions
      };
    }
    res.json(resultData);
  } catch (err) {
    console.error("[AI Duration] Error:", err);
    if (err?.cause) console.error("[AI Duration] Cause:", err.cause?.message || err.cause);
    console.log("Smart duration fallback aktywny.");
    const suggestions = (req.body?.items || []).map((item, idx) => ({
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
app.post("/api/auto-caption-clips", async (req, res) => {
  try {
    const { clips = [], style = "cinematic_poetic" } = req.body;
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ captions: [] });
    }
    const prompt = `Jeste\u015B mistrzem monta\u017Cu i scenarzyst\u0105 filmowym.
Dla ka\u017Cdego z poni\u017Cszych uj\u0119\u0107 wideo przygotuj:
1. "smartTitle": Elegancki, filmowy tytu\u0142 sceny w j\u0119zyku polskim (np. "Prolog \u2013 Uj\u0119cia Wst\u0119pne", "G\u0142\xF3wny W\u0105tek Akcji", "Punkt Kulminacyjny").
2. "subtitleCaption": Subtelny, filmowy podpis / cytat narracyjny w stylu "${style}" do wy\u015Bwietlenia na ekranie jako podtytu\u0142 lub lektor.
3. "category": Jedna z kategorii: "opening", "intro", "a_roll", "b_roll", "interview", "action", "dialogue", "scenery", "drone", "climax", "ending", "outro".
4. "directorNote": Kr\xF3tka uwaga monta\u017Cowa dla monta\u017Cysty (np. "Wycisz mikrofon, na\u0142\xF3\u017C ciep\u0142y grading").
5. "suggestedTag": 2-3 s\u0142owa kluczowe.

Lista klip\xF3w:
${JSON.stringify(clips.map((c, i) => ({
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
    let result = null;
    try {
      const response = await executeWithModelFallback(
        (modelName) => ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig
        }),
        ["gemini-3.1-flash-lite", "gemini-3.8-flash"]
      );
      result = JSON.parse(response.text || "{}");
    } catch (err1) {
      console.log("U\u017Cycie inteligentnego generatora regu\u0142owego dla podpis\xF3w.");
    }
    if (!result || !result.captions || result.captions.length === 0) {
      const stageKeywords = [
        { key: "prologue", name: "Prolog i Uj\u0119cia Wst\u0119pne", quote: "Pocz\u0105tek historii, w kt\xF3rej ka\u017Cda chwila ma znaczenie.", cat: "opening" },
        { key: "aroll", name: "G\u0142\xF3wny W\u0105tek i Postacie", quote: "Autentyczne emocje i sedno opowie\u015Bci.", cat: "a_roll" },
        { key: "broll", name: "Przebitki i Detale Otoczenia", quote: "Klimat i przestrze\u0144 buduj\u0105ce nastr\xF3j.", cat: "b_roll" },
        { key: "action", name: "Dynamiczna Sekwencja Ruchu", quote: "Czysta energia i dynamika wydarze\u0144.", cat: "action" },
        { key: "climax", name: "Punkt Kulminacyjny", quote: "Szczyt emocji i moment zwrotny.", cat: "climax" },
        { key: "ending", name: "Fina\u0142 i Kredyty Ko\u0144cowe", quote: "Niezapomniane zako\u0144czenie pe\u0142ne refleksji.", cat: "ending" }
      ];
      const fallbackCaptions = clips.map((clip, idx) => {
        const stage = stageKeywords[idx % stageKeywords.length];
        return {
          clipId: clip.id,
          smartTitle: `${stage.name} (${clip.name || `Uj\u0119cie ${idx + 1}`})`,
          subtitleCaption: stage.quote,
          category: stage.cat,
          directorNote: "Dopasuj p\u0142ynne przej\u015Bcie i zachowaj naturalne audio otoczenia.",
          suggestedTag: stage.cat
        };
      });
      result = { captions: fallbackCaptions };
    }
    res.json(result);
  } catch (err) {
    console.error("[AI Caption] Error:", err);
    if (err?.cause) console.error("[AI Caption] Cause:", err.cause?.message || err.cause);
    res.json({ captions: [] });
  }
});
app.post("/api/smart-chronological-sequencing", async (req, res) => {
  try {
    const {
      clips = [],
      pacing = "cinematic",
      projectTitle = "Nowy Projekt Filmowy",
      projectYear = "2026",
      coupleNames,
      weddingDate
    } = req.body;
    const title = projectTitle || coupleNames || "Autorska Produkcja Filmowa";
    const year = projectYear || weddingDate || "2026";
    if (!Array.isArray(clips) || clips.length === 0) {
      return res.json({ orderedSequence: [], storyConcept: "" });
    }
    const prompt = `Jeste\u015B \u015Bwiatowej klasy re\u017Cyserem monta\u017Cu filmowego. Twoim zadaniem jest stworzenie arcydzie\u0142a (Master Montage) dla projektu filmowego: "${title}" (${year}).
Przeanalizuj poni\u017Csze klipy i przygotuj zaawansowany scenariusz monta\u017Cu (Smart Montage) z uwzgl\u0119dnieniem pory dnia, nastroju i tempa.

WYTYCZNE ARTYSTYCZNE:
1. GRUPOWANIE (Clustering):
   - Pogrupuj klipy w logiczne akty: Prolog (otwarcie), Ekspozycja (A-Roll), Przebitki (B-Roll), Kulminacja (punkt zwrotny/akcja), Epilog (fina\u0142).
   - Wykryj "Time of Day": morning, afternoon, golden_hour, evening, night.
2. ARC EMOCJONALNY:
   - Buduj napi\u0119cie. Zacznij od intryguj\u0105cego wst\u0119pu, przejd\u017A do rozwini\u0119cia, a nast\u0119pnie do szczytu dramaturgicznego i wyciszenia.
3. INTELIGENTNY MONTA\u017B (BRAK SZTUCZNYCH OGRANICZE\u0143 D\u0141UGO\u015ACI):
   - Dopasuj d\u0142ugo\u015B\u0107 ka\u017Cdego uj\u0119cia do jego naturalnej tre\u015Bci i dramaturgii.
   - Nie narzucaj sztywnych limit\xF3w: uj\u0119cia detali mog\u0105 trwa\u0107 3-6s, sceny ruchu 5-15s, a kluczowe dialogi i wypowiedzi pe\u0142n\u0105 d\u0142ugo\u015B\u0107 nagrania!
4. DYNAMICZNE PRZEJ\u015ACIA:
   - Wybieraj spo\u015Br\xF3d: "dissolve", "dip_black", "dip_white", "zoom", "blur", "light_leak", "film_burn", "fade", "slide", "wipe".
   - Dopasuj transition do nastroju klipu: 
     * cinematic -> dissolve / dip_black / fade
     * energetic -> zoom / film_burn / wipe
     * solemn -> dip_black / fade
     * modern -> slide / dissolve
   - "cut" (brak przej\u015Bcia) stosuj przy szybkim tempie.

Wytyczne tempa monta\u017Cu: "${pacing}".

Klipy:
${JSON.stringify(clips.map((c) => ({
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
    let result = null;
    try {
      const response = await retryWithBackoff(
        () => ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: schemaConfig
        }),
        2,
        1200
      );
      result = JSON.parse(response.text || "{}");
    } catch (err1) {
      console.log("Fallback flash-lite dla smart-chronological-sequencing.");
      try {
        const fallbackRes = await retryWithBackoff(
          () => ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: schemaConfig
          }),
          1,
          800
        );
        result = JSON.parse(fallbackRes.text || "{}");
      } catch (err2) {
        console.log("Algorytm regu\u0142owy dla sekwencjonowania chronologicznego.");
      }
    }
    const sanitizeSceneTitle = (title2, cat, index) => {
      let t = (title2 || "").replace(/\.[a-zA-Z0-9]{2,5}$/i, "").trim();
      const isTechnical = !t || /\.(mp4|mov|avi|mkv|jpg|jpeg|png)$/i.test(title2 || "") || /^(clip|video|dsc|img|vid|i\d{2,}|scena\s*\d*|ujęcie\s*\d*)/i.test(t);
      if (isTechnical) {
        const titleDictionary = {
          opening: ["Prolog i Wprowadzenie", "Scena Otwieraj\u0105ca", "Uj\u0119cia Wst\u0119pne"],
          intro: ["Czo\u0142\xF3wka i Prezentacja", "Ekspozycja \u015Awiata", "Pocz\u0105tek Historii"],
          a_roll: ["G\u0142\xF3wny W\u0105tek i Postacie", "Kluczowe Sceny", "Wypowiedzi i Relacje"],
          b_roll: ["Przebitki Atmosferyczne", "Detale i Otoczenie", "Uj\u0119cia Kontekstowe"],
          interview: ["G\u0142os \u015Awiadk\xF3w i Relacje", "Wywiad z Bohaterem", "Autentyczne Wypowiedzi"],
          action: ["Dynamiczna Sekwencja", "G\u0142\xF3wna Akcja w Ruchu", "Punkt Kulminacyjny"],
          dialogue: ["Wa\u017Cna Rozmowa", "Kluczowa Konfrontacja", "Wymiana Zda\u0144"],
          scenery: ["Majestat Krajobrazu", "Szeroki Kadr Plenerowy", "Uj\u0119cia Architektury"],
          drone: ["Uj\u0119cia z Lotu Ptaka", "Kinowa Panorama z Drona", "Perspektywa Przestrzenna"],
          climax: ["Szczyt Dramaturgiczny", "Moment Prze\u0142omowy", "Fina\u0142owe Napi\u0119cie"],
          ending: ["Zako\u0144czenie i Epilog", "Wyciszenie Emocji", "Fina\u0142owy Kadr"],
          outro: ["Napisy Ko\u0144cowe", "Podsumowanie Projektu", "Plansza Zamykaj\u0105ca"],
          preparations: ["Prolog i Wprowadzenie", "Przygotowania i Detale", "Uj\u0119cia Wst\u0119pne"],
          ceremony: ["Kluczowa Scena G\u0142\xF3wna", "Uroczysty Moment", "Punkt Prze\u0142omowy"],
          congratulations: ["Wzruszaj\u0105ce Chwile", "Rado\u015B\u0107 i Emocje", "Wsp\xF3lne \u015Awi\u0119towanie"],
          first_dance: ["Dynamiczna Scena Artystyczna", "Klimatyczny Kadr Muzyczny", "Magia Ruchu"],
          toast: ["Uroczyste Przem\xF3wienia", "Wa\u017Cne S\u0142owa i Reakcje", "Toast i Brawa"],
          party: ["Energia i Akcja", "Dynamika Wydarzenia", "Kulminacja Emocji"],
          cake: ["Wyj\u0105tkowy Moment Wieczoru", "Uroczysty Akcent", "S\u0142odki Fina\u0142"],
          outdoor: ["Malarstwo Plenerowe", "Z\u0142ota Godzina", "Szeroka Perspektywa"]
        };
        const pool = titleDictionary[cat] || ["Kluczowe Uj\u0119cie Filmowe", "Wyj\u0105tkowy Kadr Monta\u017Cowy"];
        return pool[index % pool.length];
      }
      return t;
    };
    if (!result || !result.orderedSequence || result.orderedSequence.length === 0) {
      const sortedClips = [...clips].sort((a, b) => {
        const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.name || "").localeCompare(b.name || "", void 0, { numeric: true, sensitivity: "base" });
      });
      const categoriesList = ["opening", "a_roll", "b_roll", "action", "climax", "ending"];
      const fallbackSequence = sortedClips.map((clip, idx) => {
        const catIdx = Math.min(categoriesList.length - 1, Math.floor(idx / sortedClips.length * categoriesList.length));
        const cat = categoriesList[catIdx];
        const clipDur = clip.duration || 10;
        const trimEnd = clipDur;
        const cleanTitle = sanitizeSceneTitle(clip.name, cat, idx);
        return {
          clipId: clip.id,
          targetOrder: idx + 1,
          smartTitle: cleanTitle,
          subtitleCaption: `Uj\u0119cie filmowe \u2013 ${cleanTitle}.`,
          category: cat,
          transition: idx === 0 ? "dip_black" : "dissolve",
          trimStart: 0,
          trimEnd: Number(trimEnd.toFixed(2)),
          directorReason: "U\u0142o\u017Cono precyzyjnie wed\u0142ug naturalnej chronologii z zachowaniem pe\u0142nej tre\u015Bci sceny."
        };
      });
      result = {
        storyConcept: `Kinowa kronika wideo u\u0142o\u017Cona w naturalnej chronologii z p\u0142ynnymi przej\u015Bciami i kartami scen.`,
        musicSuggestion: "Akustyczny fortepian i orkiestra symfoniczna (75-90 BPM)",
        orderedSequence: fallbackSequence
      };
    } else {
      const clipMap = new Map(clips.map((c) => [c.id, c]));
      result.orderedSequence = result.orderedSequence.map((item, idx) => {
        const origClip = clipMap.get(item.clipId);
        const totalDur = origClip ? origClip.duration : 15;
        let tStart = typeof item.trimStart === "number" && item.trimStart >= 0 ? item.trimStart : 0;
        let tEnd = typeof item.trimEnd === "number" && item.trimEnd > tStart ? item.trimEnd : totalDur;
        if (tEnd > totalDur) tEnd = totalDur;
        if (tStart >= tEnd) tStart = 0;
        const cat = item.category || "a_roll";
        const cleanTitle = sanitizeSceneTitle(item.smartTitle, cat, idx);
        const cleanSubtitle = item.subtitleCaption && !item.subtitleCaption.includes(".mp4") ? item.subtitleCaption : `Wyj\u0105tkowe uj\u0119cie filmowe (${cleanTitle}).`;
        return {
          ...item,
          smartTitle: cleanTitle,
          subtitleCaption: cleanSubtitle,
          trimStart: Number(tStart.toFixed(2)),
          trimEnd: Number(tEnd.toFixed(2)),
          transition: item.transition || (idx === 0 ? "dip_black" : "dissolve")
        };
      });
    }
    res.json(result);
  } catch (err) {
    console.warn("[Chronological Sequencing] Server fallback triggered:", err?.message || err);
    const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
    const sortedClips = [...clips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.name || "").localeCompare(b.name || "", void 0, { numeric: true, sensitivity: "base" });
    });
    const categoriesList = ["opening", "a_roll", "b_roll", "action", "climax", "ending"];
    const fallbackSequence = sortedClips.map((clip, idx) => {
      const catIdx = Math.min(categoriesList.length - 1, Math.floor(idx / Math.max(1, sortedClips.length) * categoriesList.length));
      const cat = categoriesList[catIdx];
      const clipDur = clip.duration || 10;
      return {
        clipId: clip.id,
        targetOrder: idx + 1,
        smartTitle: `Scena ${idx + 1}: ${clip.name || "Uj\u0119cie"}`,
        subtitleCaption: `Uj\u0119cie filmowe w projekcie wideo.`,
        category: cat,
        emotion: "cinematic",
        timeOfDay: idx < sortedClips.length * 0.3 ? "morning" : idx < sortedClips.length * 0.7 ? "afternoon" : "evening",
        transition: idx === 0 ? "dip_black" : "dissolve",
        trimStart: 0,
        trimEnd: clipDur,
        directorReason: "U\u0142o\u017Cono wed\u0142ug chronologii czasu nagrania."
      };
    });
    res.json({
      storyConcept: `Kinowa kronika wideo u\u0142o\u017Cona w naturalnej chronologii z p\u0142ynnymi przej\u015Bciami.`,
      musicSuggestion: "Akustyczny fortepian i orkiestra symfoniczna (75-90 BPM)",
      orderedSequence: fallbackSequence
    });
  }
});
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `Nie odnaleziono endpointu API: ${req.originalUrl}` });
});
app.use((err, req, res, next) => {
  console.error("[Global Server Error]", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Wyst\u0105pi\u0142 nieoczekiwany b\u0142\u0105d serwera",
      details: err?.message || String(err)
    });
  }
});
async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const staticPath = fs.existsSync(path.join(distPath, "index.html")) ? distPath : null;
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && staticPath) {
    console.log(`[Production] Serving static files from: ${staticPath}`);
    app.use(express.static(staticPath, { maxAge: "1h" }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    console.log("[Dev/Live] Mounting Vite SPA middlewares");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error("[Server] Vite middleware error:", viteErr);
      if (staticPath) {
        app.use(express.static(staticPath, { maxAge: "1h" }));
        app.get("*", (req, res) => {
          res.sendFile(path.join(staticPath, "index.html"));
        });
      }
    }
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KAPI-STUDIO server running on port ${PORT} (mode: ${process.env.NODE_ENV || "development"})`);
  });
}
startServer();
