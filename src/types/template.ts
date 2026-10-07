import type { LookPreset, ColorGradingPreset, FitMode, TitleCard, TextLayer } from './project';

export interface TemplateChapter {
  chapterKey: string;
  name: string;
  targetDurationSec: number;
  description: string;
}

export interface TemplateStructure {
  pacing?: 'cinematic' | 'dynamic' | 'emotional';
  colorGrade?: LookPreset | ColorGradingPreset | string;
  resolution?: string;
  fps?: number;
  fitMode?: FitMode;
  introCard?: TitleCard;
  outroCard?: TitleCard;
  chapters?: TemplateChapter[];
  sampleTextLayers?: TextLayer[];
  suggestedMusicPreset?: string;
  applySmartTrim?: boolean;
  applyTransitions?: boolean;
}

export interface ProjectTemplate {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: 'cinematic_trailer' | 'commercial_promo' | 'travel_vlog' | 'music_video' | 'documentary' | 'event_showcase' | 'cinematic_master' | 'action_thriller' | 'social_reel' | 'creative_portfolio' | 'wedding_highlights' | 'photo_mix' | 'custom';
  icon: string;
  isPrebuilt: boolean;
  structure: TemplateStructure;
  createdAt: string;
  updatedAt: string;
}
