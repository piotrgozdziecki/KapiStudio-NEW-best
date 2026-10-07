import React, { useState } from 'react';
import { 
  Check, 
  RotateCw, 
  Trash2, 
  Sliders, 
  Gauge, 
  Sparkles, 
  Palette, 
  Volume2, 
  VolumeX, 
  ChevronDown,
  Scaling,
  Scissors,
  Wand2,
  Layers,
  Zap,
  Eye,
  SlidersHorizontal,
  Sun,
  Contrast,
  Smile,
  ShieldAlert
} from 'lucide-react';
import type { TimelineItem, MediaClip, ProjectState, ClipColorAdjustments, TransitionType } from '../../types/project';

interface StudioInspectorPanelProps {
  selectedItem: TimelineItem | null;
  selectedClip: MediaClip | null;
  project: ProjectState;
  onUpdateTimelineItem: (id: string, updates: Partial<TimelineItem>) => void;
  onDeleteTimelineItem: (id: string) => void;
}

export function StudioInspectorPanel({
  selectedItem,
  selectedClip,
  project,
  onUpdateTimelineItem,
  onDeleteTimelineItem
}: StudioInspectorPanelProps) {
  const [mainTab, setMainTab] = useState<'video' | 'audio' | 'speed' | 'animation' | 'adjust'>('video');

  // If no item is selected, render Project Details View
  if (!selectedItem || !selectedClip) {
    return (
      <div className="w-full h-full flex flex-col bg-[#18181b] border border-[#27272a] rounded-lg p-3.5 select-none overflow-y-auto custom-scrollbar">
        <h3 className="text-xs font-bold text-white mb-4 flex items-center justify-between border-b border-zinc-800 pb-2">
          <span>Szczegóły Projektu</span>
          <span className="text-[10px] font-mono text-cyan-400">Kapi-Studio</span>
        </h3>
        
        <div className="space-y-3 text-xs">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Nazwa:</span>
            <span className="text-zinc-200 font-mono font-medium truncate max-w-[180px]">{project.name || 'Nowy Projekt'}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Pamięć:</span>
            <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[180px]">IndexedDB + Chmura</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Proporcje:</span>
            <span className="text-zinc-200 font-mono">
              {project.sequences?.find(s => s.id === project.activeSequenceId)?.aspectRatio || '16:9'}
            </span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Rozdzielczość:</span>
            <span className="text-zinc-200 font-mono">4K UHD (3840x2160)</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Klatkowa:</span>
            <span className="text-zinc-200 font-mono">{project.settings?.targetFps || 30} FPS</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Liczba Klipów:</span>
            <span className="text-zinc-200 font-mono font-bold">{project.mediaLibrary?.length || 0}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400 pt-1">
            <span>Akceleracja GPU:</span>
            <span className="text-emerald-400 font-mono font-bold text-[11px]">WebGL2 (Aktywna)</span>
          </div>
        </div>

        <div className="mt-6 p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs space-y-1">
          <p className="font-semibold text-white">Wskazówka:</p>
          <p className="text-zinc-400 text-[11px]">Zaznacz klip na osi czasu, aby dostosować jego skalę, pozycję, obrót, głośność oraz korekcję barwną.</p>
        </div>
      </div>
    );
  }

  // Get current color adjustments or defaults
  const colorAdj: ClipColorAdjustments = selectedItem.colorAdjustments || {
    exposure: 0,
    contrast: 0,
    brightness: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpness: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0
  };

  const handleColorChange = (key: keyof ClipColorAdjustments, value: number) => {
    onUpdateTimelineItem(selectedItem.id, {
      colorAdjustments: {
        ...colorAdj,
        [key]: value
      }
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden select-none">
      {/* Top Main Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5 border-b border-[#27272a] bg-[#141416] overflow-x-auto custom-scrollbar shrink-0">
        {[
          { id: 'video', label: 'Wideo' },
          { id: 'audio', label: 'Audio' },
          { id: 'speed', label: 'Prędkość' },
          { id: 'animation', label: 'Przejścia' },
          { id: 'adjust', label: 'Kolorystyka' }
        ].map((tab) => {
          const isActive = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id as any)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? 'text-white bg-[#222226] border border-[#3f3f46]/40'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1c1c20]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Inspector Body Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar text-xs">
        {/* VIDEO TAB */}
        {mainTab === 'video' && (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-zinc-300 uppercase font-mono">Transformacja i Skala</div>
            
            {/* Scale */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Skala (Zoom):</span>
                <span className="text-cyan-400 font-mono font-bold">{Math.round((selectedItem.scale || 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={selectedItem.scale || 1.0}
                onChange={(e) => onUpdateTimelineItem(selectedItem.id, { scale: parseFloat(e.target.value) })}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Rotation */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Obrót:</span>
                <span className="text-white font-mono">{selectedItem.rotation || 0}°</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    onClick={() => onUpdateTimelineItem(selectedItem.id, { rotation: deg })}
                    className={`py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                      (selectedItem.rotation || 0) === deg
                        ? 'bg-[#00e5cc] text-black font-bold'
                        : 'bg-[#27272a] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* Fit Mode */}
            <div>
              <span className="text-[11px] text-zinc-400 block mb-1">Dopasowanie do kadru:</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'fit', label: 'Fit (Całość)' },
                  { id: 'fill', label: 'Fill (Wypełnij)' },
                  { id: 'original', label: 'Oryginał' }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => onUpdateTimelineItem(selectedItem.id, { fitMode: mode.id as any })}
                    className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      (selectedItem.fitMode || 'fill') === mode.id
                        ? 'bg-[#00e5cc] text-black font-bold'
                        : 'bg-[#27272a] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AUDIO TAB */}
        {mainTab === 'audio' && (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-zinc-300 uppercase font-mono">Dźwięk i Głośność</div>
            
            {/* Volume */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Głośność:</span>
                <span className="text-cyan-400 font-mono font-bold">{Math.round((selectedItem.volume ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={selectedItem.volume ?? 1.0}
                onChange={(e) => onUpdateTimelineItem(selectedItem.id, { volume: parseFloat(e.target.value) })}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Fade In / Fade Out */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Fade In (s):</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={selectedItem.fadeIn || 0}
                  onChange={(e) => onUpdateTimelineItem(selectedItem.id, { fadeIn: parseFloat(e.target.value) })}
                  className="w-full bg-[#27272a] border border-[#3f3f46]/50 rounded px-2 py-1 text-white font-mono text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block mb-1">Fade Out (s):</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={selectedItem.fadeOut || 0}
                  onChange={(e) => onUpdateTimelineItem(selectedItem.id, { fadeOut: parseFloat(e.target.value) })}
                  className="w-full bg-[#27272a] border border-[#3f3f46]/50 rounded px-2 py-1 text-white font-mono text-xs"
                />
              </div>
            </div>

            {/* Mute Button */}
            <button
              onClick={() => onUpdateTimelineItem(selectedItem.id, { muted: !selectedItem.muted })}
              className={`w-full py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                selectedItem.muted ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-[#27272a] text-zinc-200 hover:text-white'
              }`}
            >
              {selectedItem.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{selectedItem.muted ? 'Wyciszony (Kliknij, aby włączyć)' : 'Wycisz ten klip'}</span>
            </button>
          </div>
        )}

        {/* SPEED TAB */}
        {mainTab === 'speed' && (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-zinc-300 uppercase font-mono">Mnożnik Prędkości Odtwarzania</div>
            <div className="grid grid-cols-3 gap-2">
              {[0.25, 0.5, 1.0, 1.5, 2.0, 4.0].map((spd) => (
                <button
                  key={spd}
                  onClick={() => {
                    const newDur = (selectedItem.sourceEnd - selectedItem.sourceStart) / spd;
                    onUpdateTimelineItem(selectedItem.id, { speed: spd, duration: newDur });
                  }}
                  className={`py-2 text-xs font-mono rounded transition-colors cursor-pointer ${
                    (selectedItem.speed || 1.0) === spd
                      ? 'bg-[#00e5cc] text-black font-bold'
                      : 'bg-[#27272a] text-zinc-300 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 font-mono">
              Aktualna długość na osi czasu: {selectedItem.duration?.toFixed(2)}s
            </p>
          </div>
        )}

        {/* ANIMATION / TRANSITION TAB */}
        {mainTab === 'animation' && (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-zinc-300 uppercase font-mono">Przejście na Wejściu (Transition In)</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'cut', label: 'Brak (Cięcie)' },
                { id: 'fade', label: 'Płynne Ściemnienie (Fade)' },
                { id: 'dissolve', label: 'Przenikanie (Dissolve)' },
                { id: 'dip_black', label: 'Czerń (Dip to Black)' },
                { id: 'dip_white', label: 'Biel (Dip to White)' },
                { id: 'zoom', label: 'Dynamiczny Zoom' }
              ].map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => onUpdateTimelineItem(selectedItem.id, { transitionIn: tr.id as TransitionType })}
                  className={`p-2 rounded border text-left text-xs font-medium cursor-pointer transition-all ${
                    (selectedItem.transitionIn || 'cut') === tr.id
                      ? 'bg-[#00e5cc]/10 border-[#00e5cc] text-[#00e5cc] font-bold'
                      : 'bg-[#222226] border-[#2e2e33] text-zinc-300 hover:text-white'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* COLOR ADJUST / GRADUATION TAB */}
        {mainTab === 'adjust' && (
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-zinc-300 uppercase font-mono">Korekcja Barwna GPU WebGL</div>
            
            {/* Exposure */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Ekspozycja:</span>
                <span className="text-white font-mono">{colorAdj.exposure}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={colorAdj.exposure}
                onChange={(e) => handleColorChange('exposure', parseInt(e.target.value, 10))}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Kontrast:</span>
                <span className="text-white font-mono">{colorAdj.contrast}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={colorAdj.contrast}
                onChange={(e) => handleColorChange('contrast', parseInt(e.target.value, 10))}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Brightness */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Jasność:</span>
                <span className="text-white font-mono">{colorAdj.brightness}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={colorAdj.brightness}
                onChange={(e) => handleColorChange('brightness', parseInt(e.target.value, 10))}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Nasycenie (Saturacja):</span>
                <span className="text-white font-mono">{colorAdj.saturation}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={colorAdj.saturation}
                onChange={(e) => handleColorChange('saturation', parseInt(e.target.value, 10))}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Temperature */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Temperatura barwowa:</span>
                <span className="text-white font-mono">{colorAdj.temperature}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={colorAdj.temperature}
                onChange={(e) => handleColorChange('temperature', parseInt(e.target.value, 10))}
                className="w-full accent-[#00e5cc] cursor-pointer"
              />
            </div>

            {/* Reset Color */}
            <button
              onClick={() => onUpdateTimelineItem(selectedItem.id, {
                colorAdjustments: {
                  exposure: 0,
                  contrast: 0,
                  brightness: 0,
                  saturation: 0,
                  temperature: 0,
                  tint: 0,
                  sharpness: 0,
                  highlights: 0,
                  shadows: 0,
                  vignette: 0
                }
              })}
              className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium transition-colors cursor-pointer mt-2"
            >
              Resetuj korekcję barwną
            </button>
          </div>
        )}
      </div>

      {/* Delete Item footer */}
      <div className="p-2.5 border-t border-[#27272a] bg-[#141416] flex items-center justify-between shrink-0">
        <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[160px]">{selectedClip.name}</span>
        <button
          onClick={() => onDeleteTimelineItem(selectedItem.id)}
          className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Usuń z osi</span>
        </button>
      </div>
    </div>
  );
}

// Backwards-compatible export alias
export const CapCutInspectorPanel = StudioInspectorPanel;
