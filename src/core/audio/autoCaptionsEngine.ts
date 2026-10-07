/**
 * CineForge Studio - AI Auto-Captions & Dynamic Subtitle Engine
 * Generates synchronized subtitle tracks using Web Speech API, AI Transcription, and SRT/VTT parsing.
 */

import type { TextLayer, SubtitleStyle, TextAnimation } from '../../types/project';

export interface CaptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface SubtitlePresetConfig {
  id: SubtitleStyle;
  name: string;
  description: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '300' | '600' | '800';
  color: string;
  backgroundColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  animation: TextAnimation;
  position: { x: number; y: number };
}

export const SUBTITLE_PRESETS: SubtitlePresetConfig[] = [
  {
    id: 'classic',
    name: 'Klasyczny Kinowy',
    description: 'Czysta, czytelna czcionka z subtelnym cieniem w dolnej części kadru.',
    fontSize: 30,
    fontFamily: '"Cinzel", "Playfair Display", "Times New Roman", serif',
    fontWeight: 'bold',
    color: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2,
    animation: 'fade',
    position: { x: 0.5, y: 0.88 }
  },
  {
    id: 'karaoke_glow',
    name: 'Viral Karaoke Glow (CapCut Style)',
    description: 'Dynamiczne żółte rozświetlenie i zaokrąglona ciemna pigułka w tle.',
    fontSize: 36,
    fontFamily: '"Plus Jakarta Sans", "Montserrat", "Inter", sans-serif',
    fontWeight: '800',
    color: '#FDE047',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    outlineColor: '#000000',
    outlineWidth: 3,
    animation: 'scale',
    position: { x: 0.5, y: 0.82 }
  },
  {
    id: 'modern_minimal',
    name: 'Modern Minimal',
    description: 'Elegancka, nowoczesna typografia bez zbędnych ramek.',
    fontSize: 28,
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    color: '#FFFFFF',
    outlineColor: 'rgba(0,0,0,0.8)',
    outlineWidth: 1.5,
    animation: 'fade',
    position: { x: 0.5, y: 0.86 }
  },
  {
    id: 'boxed_retro',
    name: 'Boxed Retro / Studio Slate',
    description: 'Kontrastowy czarny prostokąt z wyrazistym białym tekstem.',
    fontSize: 32,
    fontFamily: '"JetBrains Mono", "Roboto Mono", monospace',
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: 'rgba(10, 10, 15, 0.92)',
    animation: 'typewriter',
    position: { x: 0.5, y: 0.85 }
  },
  {
    id: 'neon_cyber',
    name: 'Cyber Neon Glow',
    description: 'Intensywny turkusowo-złoty neon do dynamicznych vlogów i rolek.',
    fontSize: 34,
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontWeight: '800',
    color: '#38BDF8',
    outlineColor: '#0369A1',
    outlineWidth: 2,
    animation: 'bounce',
    position: { x: 0.5, y: 0.82 }
  },
  {
    id: 'elegant',
    name: 'Złoty Elegancki (Master Film)',
    description: 'Ciepłe złociste litery z klasycznym akcentem szampańskim.',
    fontSize: 30,
    fontFamily: '"Cinzel", "Playfair Display", Georgia, serif',
    fontWeight: 'bold',
    color: '#E5A93B',
    outlineColor: '#000000',
    outlineWidth: 2,
    animation: 'fade',
    position: { x: 0.5, y: 0.87 }
  }
];

/**
 * Converts CaptionSegments into CineForge project TextLayers ready for Timeline & Exporter
 */
export function convertCaptionsToTextLayers(
  captions: CaptionSegment[],
  presetId: SubtitleStyle = 'karaoke_glow'
): TextLayer[] {
  const preset = SUBTITLE_PRESETS.find(p => p.id === presetId) || SUBTITLE_PRESETS[0];

  return captions.map((cap, index) => {
    const duration = Math.max(0.5, cap.endTime - cap.startTime);
    return {
      id: `caption_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
      text: cap.text,
      type: 'caption',
      style: preset.id,
      timelineStart: Number(cap.startTime.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      position: { ...preset.position },
      fontSize: preset.fontSize,
      fontFamily: preset.fontFamily,
      fontWeight: preset.fontWeight,
      color: preset.color,
      backgroundColor: preset.backgroundColor,
      outlineColor: preset.outlineColor,
      outlineWidth: preset.outlineWidth,
      animation: preset.animation,
      shadow: true,
      opacity: 1.0,
      subtitleSpeaker: cap.speaker,
      wordsTiming: cap.words
    };
  });
}

/**
 * Parses standard SRT (SubRip) format text into structured CaptionSegments
 */
export function parseSRT(srtContent: string): CaptionSegment[] {
  const clean = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = clean.split('\n\n');
  const results: CaptionSegment[] = [];

  const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split('\n');
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIdx = 1;
    }

    const match = lines[timeLineIdx]?.match(timeRegex);
    if (!match) continue;

    const startSec = 
      parseInt(match[1], 10) * 3600 +
      parseInt(match[2], 10) * 60 +
      parseInt(match[3], 10) +
      parseInt(match[4], 10) / 1000;

    const endSec = 
      parseInt(match[5], 10) * 3600 +
      parseInt(match[6], 10) * 60 +
      parseInt(match[7], 10) +
      parseInt(match[8], 10) / 1000;

    const textLines = lines.slice(timeLineIdx + 1).join('\n').trim();
    if (textLines) {
      results.push({
        id: `srt_${i}_${Math.round(startSec * 1000)}`,
        text: textLines,
        startTime: Number(startSec.toFixed(3)),
        endTime: Number(endSec.toFixed(3))
      });
    }
  }

  return results;
}

/**
 * Formats seconds into SRT timestamp string 00:00:00,000
 */
function formatSrtTime(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Exports current TextLayers/Captions to standard SRT file string
 */
export function exportToSRT(textLayers: TextLayer[]): string {
  const captions = textLayers
    .filter(t => t.type === 'caption' || t.type === 'subtitle')
    .sort((a, b) => a.timelineStart - b.timelineStart);

  return captions.map((c, idx) => {
    const num = idx + 1;
    const start = formatSrtTime(c.timelineStart);
    const end = formatSrtTime(c.timelineStart + c.duration);
    return `${num}\n${start} --> ${end}\n${c.text}\n`;
  }).join('\n');
}

/**
 * Speech Recognition Helper for live audio transcription in browser
 */
export class SpeechTranscriptionEngine {
  private recognition: any = null;
  private isListening: boolean = false;

  constructor(private lang: string = 'pl-PL') {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechClass) {
      this.recognition = new SpeechClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = lang;
    }
  }

  public isSupported(): boolean {
    return Boolean(this.recognition);
  }

  public setLanguage(lang: string): void {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public startTranscription(
    onResult: (captions: CaptionSegment[], isFinalChunk: boolean) => void,
    onError?: (err: any) => void
  ): void {
    if (!this.recognition || this.isListening) return;

    const segments: CaptionSegment[] = [];
    let sessionStartTime = Date.now();

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript.trim();
        const isFinal = res.isFinal;
        const nowSec = (Date.now() - sessionStartTime) / 1000;

        if (transcript) {
          const seg: CaptionSegment = {
            id: `speech_${i}_${Date.now()}`,
            text: transcript,
            startTime: Math.max(0, nowSec - (transcript.length * 0.08)),
            endTime: Math.max(1, nowSec + 0.4),
            confidence: res[0].confidence || 0.9
          };
          onResult([seg], isFinal);
        }
      }
    };

    this.recognition.onerror = (e: any) => {
      console.warn('[SpeechTranscriptionEngine] Recognition error:', e);
      onError?.(e);
    };

    try {
      this.isListening = true;
      sessionStartTime = Date.now();
      this.recognition.start();
    } catch (e) {
      console.error('[SpeechTranscriptionEngine] Could not start speech recognition:', e);
    }
  }

  public stopTranscription(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }
}
