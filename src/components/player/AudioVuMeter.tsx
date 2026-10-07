import React, { useEffect, useState } from 'react';
import { liveAudioEngine, type AudioLevels } from '../../core/audio/liveAudioEngine';
import { Volume2, VolumeX } from 'lucide-react';

interface AudioVuMeterProps {
  isPlaying: boolean;
  isMuted: boolean;
  className?: string;
}

export function AudioVuMeter({ isPlaying, isMuted, className = '' }: AudioVuMeterProps) {
  const [levels, setLevels] = useState<AudioLevels>({
    left: 0,
    right: 0,
    peak: 0,
    isClipping: false
  });

  useEffect(() => {
    let animId: number;

    const poll = () => {
      if (isPlaying && !isMuted) {
        const cur = liveAudioEngine.getAudioLevels();
        setLevels(cur);
      } else {
        setLevels({ left: 0, right: 0, peak: 0, isClipping: false });
      }
      animId = requestAnimationFrame(poll);
    };

    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isMuted]);

  const leftPct = Math.round(levels.left * 100);
  const rightPct = Math.round(levels.right * 100);

  return (
    <div className={`flex items-center gap-1.5 bg-zinc-950 px-2 py-1.5 rounded-xl border border-zinc-800 text-[10px] font-mono select-none ${className}`} title="Miernik wysterowania dźwięku (VU Meter)">
      <div className="flex items-center gap-1 text-zinc-500 font-bold">
        {isMuted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3 text-indigo-400" />}
        <span className="hidden sm:inline">VU</span>
      </div>

      {/* Stereo Dual Channel Meter */}
      <div className="flex flex-col gap-1 w-14 sm:w-20">
        {/* Left Channel */}
        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden flex border border-white/[0.04]">
          <div 
            className={`h-full transition-all duration-75 rounded-full ${
              levels.left > 0.85 
                ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500' 
                : levels.left > 0.5 
                  ? 'bg-gradient-to-r from-emerald-500 to-amber-400' 
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${leftPct}%` }}
          />
        </div>

        {/* Right Channel */}
        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden flex border border-white/[0.04]">
          <div 
            className={`h-full transition-all duration-75 rounded-full ${
              levels.right > 0.85 
                ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500' 
                : levels.right > 0.5 
                  ? 'bg-gradient-to-r from-emerald-500 to-amber-400' 
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${rightPct}%` }}
          />
        </div>
      </div>

      {/* Peak Indicator Light */}
      <span 
        className={`w-2 h-2 rounded-full transition-colors ${
          levels.isClipping 
            ? 'bg-rose-500 shadow-sm shadow-rose-500' 
            : levels.peak > 0.2 
              ? 'bg-emerald-400' 
              : 'bg-zinc-700'
        }`} 
      />
    </div>
  );
}
