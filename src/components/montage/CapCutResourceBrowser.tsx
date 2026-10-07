import React, { useState } from 'react';
import { 
  Film, 
  Music, 
  Type, 
  Palette, 
  SlidersHorizontal,
  Search,
  Plus,
  Mic,
  Activity,
  Check,
  Zap,
  Volume2
} from 'lucide-react';
import type { ProjectState, MediaClip } from '../../types/project';
import { BEAUTY_PRESETS, type BeautyPreset } from './MontageView';

export const STUDIO_FILTERS_LIST = [
  { id: 'hollywood_warm', name: 'Hollywood Warm', preset: 'hollywood_warm' as BeautyPreset, gradient: 'bg-gradient-to-br from-amber-600 via-orange-500 to-indigo-900' },
  { id: 'teal_orange', name: 'Teal & Orange', preset: 'teal_orange' as BeautyPreset, gradient: 'bg-gradient-to-br from-cyan-600 via-teal-700 to-amber-600' },
  { id: 'beauty_glow', name: 'Beauty Glow', preset: 'beauty_glow' as BeautyPreset, gradient: 'bg-gradient-to-br from-pink-500 via-rose-400 to-amber-300' },
  { id: 'vibrant_pop', name: 'Vibrant Pop', preset: 'vibrant_pop' as BeautyPreset, gradient: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-400' },
  { id: 'glamour_soft', name: 'Glamour Soft', preset: 'glamour_soft' as BeautyPreset, gradient: 'bg-gradient-to-br from-orange-400 via-amber-300 to-rose-400' },
  { id: 'vintage_35mm', name: 'Vintage 35mm', preset: 'vintage_35mm' as BeautyPreset, gradient: 'bg-gradient-to-br from-amber-800 via-yellow-700 to-zinc-900' },
  { id: 'nordic_frost', name: 'Nordic Frost', preset: 'nordic_frost' as BeautyPreset, gradient: 'bg-gradient-to-br from-sky-700 via-cyan-600 to-slate-900' },
  { id: 'moody_noir', name: 'Moody Noir (B&W)', preset: 'moody_noir' as BeautyPreset, gradient: 'bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-900' }
];

interface StudioResourceBrowserProps {
  project: ProjectState;
  activePreset: BeautyPreset;
  onSelectFilter: (preset: BeautyPreset) => void;
  onAddMediaClick?: () => void;
  onOpenVoiceRecorder?: () => void;
  onOpenBeatSync?: () => void;
  onOpenAutoCaptions?: () => void;
  onAddClipToTimeline?: (clip: MediaClip) => void;
}

export function StudioResourceBrowser({
  project,
  activePreset,
  onSelectFilter,
  onAddMediaClick,
  onOpenVoiceRecorder,
  onOpenBeatSync,
  onOpenAutoCaptions,
  onAddClipToTimeline
}: StudioResourceBrowserProps) {
  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'text' | 'filters'>('filters');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const tabs = [
    { id: 'filters', label: 'Filtry 4K', icon: Palette },
    { id: 'media', label: 'Media', icon: Film },
    { id: 'audio', label: 'Audio & Dyktafon', icon: Music },
    { id: 'text', label: 'Napisy & Tytuły', icon: Type }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden select-none">
      {/* Top Horizontal Tabs */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 border-b border-[#27272a] bg-[#141416] overflow-x-auto custom-scrollbar shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                isActive
                  ? 'text-[#00e5cc] bg-[#222226] font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1c20]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-2.5 overflow-y-auto custom-scrollbar bg-[#18181b]">
        {/* Filters View */}
        {activeTab === 'filters' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Szukaj filtrów WebGL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#27272a] border border-[#3f3f46]/40 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00e5cc]"
                />
              </div>
            </div>

            <div className="text-[11px] font-semibold text-zinc-300">Filtry i Stylizacje WebGL2</div>

            {/* Grid of Real Filter Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                onClick={() => onSelectFilter('none')}
                className={`group relative rounded-lg overflow-hidden border transition-all cursor-pointer bg-[#222226] p-2 flex flex-col items-center justify-center text-center ${
                  activePreset === 'none'
                    ? 'border-[#00e5cc] shadow-[0_0_10px_rgba(0,229,204,0.3)]'
                    : 'border-[#2e2e33] hover:border-zinc-500'
                }`}
              >
                <span className="text-xl mb-1">⭕</span>
                <span className={`text-xs font-medium block truncate ${activePreset === 'none' ? 'text-[#00e5cc] font-bold' : 'text-zinc-300'}`}>
                  Brak (Oryginał)
                </span>
              </div>

              {STUDIO_FILTERS_LIST.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((filter) => {
                const isActive = activePreset === filter.preset;
                return (
                  <div
                    key={filter.id}
                    onClick={() => onSelectFilter(filter.preset)}
                    className={`group relative rounded-lg overflow-hidden border transition-all cursor-pointer bg-[#222226] ${
                      isActive
                        ? 'border-[#00e5cc] shadow-[0_0_10px_rgba(0,229,204,0.3)]'
                        : 'border-[#2e2e33] hover:border-zinc-500'
                    }`}
                  >
                    <div className={`aspect-video w-full relative overflow-hidden ${filter.gradient} flex items-center justify-center p-2`}>
                      <div className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white">
                        <Palette className="w-3.5 h-3.5 text-[#00e5cc]" />
                      </div>
                      <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/75 border border-white/20 flex items-center justify-center text-white">
                        {isActive && <Check className="w-2.5 h-2.5 text-[#00e5cc]" />}
                      </div>
                    </div>
                    <div className="p-1 text-center bg-[#222226]">
                      <span className={`text-[10.5px] font-medium block truncate ${isActive ? 'text-[#00e5cc] font-bold' : 'text-zinc-300'}`}>
                        {filter.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Media View */}
        {activeTab === 'media' && (
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-white">Biblioteka Klipów Projektu</span>
              <button
                onClick={onAddMediaClick}
                className="px-2.5 py-1 bg-[#00e5cc] hover:bg-[#14f3db] text-black font-bold text-xs rounded flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Dodaj plik</span>
              </button>
            </div>

            {project.mediaLibrary.length === 0 ? (
              <div 
                onClick={onAddMediaClick}
                className="flex-1 border-2 border-dashed border-[#2f2f35] hover:border-[#00e5cc] rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-[#00e5cc]/10 text-[#00e5cc] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-white mb-1">Importuj Media</span>
                <span className="text-[10px] text-zinc-500">Przeciągnij lub kliknij, aby wgrać pliki wideo, audio lub zdjęcia</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {project.mediaLibrary.map(clip => (
                  <div 
                    key={clip.id} 
                    className="group relative rounded-lg overflow-hidden border border-[#2e2e33] hover:border-[#00e5cc] bg-[#222226] cursor-pointer transition-all"
                    onClick={() => onAddClipToTimeline?.(clip)}
                  >
                    <div className="aspect-video w-full bg-black relative">
                      {clip.thumbnailUrl ? (
                        <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Film className="w-6 h-6" />
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono text-white px-1 rounded">
                        {clip.duration.toFixed(1)}s
                      </span>
                      <button 
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#00e5cc] text-black font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        title="Dodaj na oś czasu"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                      </button>
                    </div>
                    <div className="p-1.5">
                      <span className="text-[10px] text-zinc-300 font-medium block truncate">{clip.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[#222226] border border-[#2e2e33] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Nagraj Lektora</div>
                <div className="text-[10px] text-zinc-400">Nagrywanie mikrofonowe z podglądem poziomu sygnału VU</div>
              </div>
              <button
                onClick={() => onOpenVoiceRecorder?.()}
                className="px-3 py-1.5 bg-[#00e5cc] hover:bg-[#14f3db] text-black font-bold text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Nagraj</span>
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[#222226] border border-[#2e2e33] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Beat-Sync ⚡</div>
                <div className="text-[10px] text-zinc-400">Wykrywanie tempa (BPM) i automatyczna synchronizacja cięć</div>
              </div>
              <button
                onClick={() => onOpenBeatSync?.()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Beat-Sync</span>
              </button>
            </div>
          </div>
        )}

        {/* Text Tab */}
        {activeTab === 'text' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[#222226] border border-[#2e2e33] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Automatyczne Napisy & Transkrypcja</div>
                <div className="text-[10px] text-zinc-400">Transkrypcja mowy, eksport SRT i napisy kinowe</div>
              </div>
              <button
                onClick={() => onOpenAutoCaptions?.()}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Generuj</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Backwards-compatible export alias
export const CapCutResourceBrowser = StudioResourceBrowser;
