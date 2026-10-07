import React, { useState, useEffect, useRef } from 'react';
import { 
  Type, 
  Sparkles, 
  Mic, 
  MicOff, 
  FileText, 
  Download, 
  Upload, 
  CheckCircle2, 
  X, 
  Plus, 
  Trash2, 
  Sliders, 
  Play, 
  Pause,
  Layers,
  Wand2,
  Volume2
} from 'lucide-react';
import type { ProjectState, TextLayer, SubtitleStyle } from '../../types/project';
import { 
  CaptionSegment, 
  SUBTITLE_PRESETS, 
  convertCaptionsToTextLayers, 
  parseSRT, 
  exportToSRT, 
  SpeechTranscriptionEngine 
} from '../../core/audio/autoCaptionsEngine';
import { useStudioToast } from '../common/ToastContext';

interface AutoCaptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyTextLayers: (textLayers: TextLayer[]) => void;
}

export function AutoCaptionsModal({
  isOpen,
  onClose,
  project,
  onApplyTextLayers
}: AutoCaptionsModalProps) {
  const toast = useStudioToast();

  const [activeTab, setActiveTab] = useState<'ai_speech' | 'srt_import' | 'manual'>('ai_speech');
  const [selectedStyle, setSelectedStyle] = useState<SubtitleStyle>('karaoke_glow');
  const [language, setLanguage] = useState<string>('pl-PL');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [captionsList, setCaptionsList] = useState<CaptionSegment[]>(() => {
    // Pre-populate with existing caption text layers if any
    const existing = (project.textLayers || []).filter(t => t.type === 'caption' || t.type === 'subtitle');
    return existing.map(t => ({
      id: t.id,
      text: t.text,
      startTime: t.timelineStart,
      endTime: t.timelineStart + t.duration,
      speaker: t.subtitleSpeaker
    }));
  });

  const [rawSrtText, setRawSrtText] = useState<string>('');
  const speechEngineRef = useRef<SpeechTranscriptionEngine | null>(null);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      speechEngineRef.current = new SpeechTranscriptionEngine(language);
    }
    return () => {
      speechEngineRef.current?.stopTranscription();
    };
  }, [isOpen, language]);

  if (!isOpen) return null;

  const handleToggleMic = () => {
    if (!speechEngineRef.current?.isSupported()) {
      toast.showWarning('Transkrypcja mowy w przeglądarce wymaga wsparcia SpeechRecognition (Chrome, Edge, Safari).');
      return;
    }

    if (isListening) {
      speechEngineRef.current.stopTranscription();
      setIsListening(false);
      toast.showInfo('Zatrzymano nagrywanie transkrypcji.');
    } else {
      speechEngineRef.current.setLanguage(language);
      speechEngineRef.current.startTranscription(
        (newCaps, isFinal) => {
          setCaptionsList(prev => {
            const updated = [...prev];
            newCaps.forEach(nc => {
              const existingIdx = updated.findIndex(u => Math.abs(u.startTime - nc.startTime) < 1.0);
              if (existingIdx >= 0) {
                updated[existingIdx] = nc;
              } else {
                updated.push(nc);
              }
            });
            return updated.sort((a, b) => a.startTime - b.startTime);
          });
        },
        (err) => {
          setIsListening(false);
          toast.showError(err?.message || 'Brak uprawnień do mikrofonu lub błąd rozpoznawania.');
        }
      );
      setIsListening(true);
      toast.showSuccess('Rozpoczęto nasłuchiwanie mowy (mów wyraźnie do mikrofonu)...');
    }
  };

  const handleParseSrtInput = () => {
    if (!rawSrtText.trim()) {
      toast.showWarning('Wklej treść pliku SRT lub VTT.');
      return;
    }
    try {
      const parsed = parseSRT(rawSrtText);
      if (parsed.length === 0) {
        toast.showWarning('Nie wykryto poprawnych segmentów napisów w formacie SRT.');
        return;
      }
      setCaptionsList(parsed);
      toast.showSuccess(`Pomyślnie zaimportowano ${parsed.length} segmentów napisów!`);
      setActiveTab('manual');
    } catch (e: any) {
      toast.showError('Błąd parsowania SRT: ' + e?.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setRawSrtText(text);
        const parsed = parseSRT(text);
        if (parsed.length > 0) {
          setCaptionsList(parsed);
          toast.showSuccess(`Załadowano plik ${file.name} z ${parsed.length} napisami!`);
          setActiveTab('manual');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleAddCaptionRow = () => {
    const lastCap = captionsList[captionsList.length - 1];
    const start = lastCap ? lastCap.endTime + 0.5 : 0;
    const end = start + 3.0;

    setCaptionsList(prev => [
      ...prev,
      {
        id: `cap_custom_${Date.now()}`,
        text: 'Nowa kwestia / transkrypcja dialogu',
        startTime: Number(start.toFixed(1)),
        endTime: Number(end.toFixed(1))
      }
    ]);
  };

  const handleUpdateCaption = (id: string, updates: Partial<CaptionSegment>) => {
    setCaptionsList(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleRemoveCaption = (id: string) => {
    setCaptionsList(prev => prev.filter(c => c.id !== id));
  };

  const handleExportSRTFile = () => {
    if (captionsList.length === 0) {
      toast.showWarning('Brak napisów do wyeksportowania.');
      return;
    }
    const layers = convertCaptionsToTextLayers(captionsList, selectedStyle);
    const srtData = exportToSRT(layers);
    const blob = new Blob([srtData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'kapi_studio'}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.showSuccess('Pobrano plik .SRT!');
  };

  const handleApplyToProject = () => {
    if (captionsList.length === 0) {
      toast.showWarning('Brak napisów do zastosowania.');
      return;
    }

    const generatedLayers = convertCaptionsToTextLayers(captionsList, selectedStyle);
    // Keep non-caption text layers (like main title, intros, watermarks) and replace captions
    const otherLayers = (project.textLayers || []).filter(t => t.type !== 'caption' && t.type !== 'subtitle');
    const finalLayers = [...otherLayers, ...generatedLayers];

    onApplyTextLayers(finalLayers);
    toast.showSuccess(`Pomyślnie zintegrowano ${generatedLayers.length} napisów z osią czasu!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#121216] border border-zinc-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.85)] flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00e5cc]/10 border border-[#00e5cc]/30 flex items-center justify-center text-[#00e5cc] shadow-inner">
              <Type className="w-5 h-5 text-[#00e5cc]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide font-sans flex items-center gap-2">
                AUTOMATYCZNE NAPISY & TRANSKRYPCJA
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#00e5cc]/15 border border-[#00e5cc]/30 text-[#00e5cc]">
                  CAPCUT AI
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Generuj automatyczne napisy ze ścieżki dźwiękowej, animowane karaoke oraz importuj pliki SRT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/60 px-5 gap-4">
          <button
            onClick={() => setActiveTab('ai_speech')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'ai_speech'
                ? 'border-[#00e5cc] text-white font-bold'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4 text-[#00e5cc]" />
            <span>Transkrypcja na Żywo (Mowa)</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'border-[#00e5cc] text-white font-bold'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 text-[#00e5cc]" />
            <span>Lista Kwestii ({captionsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('srt_import')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'srt_import'
                ? 'border-[#00e5cc] text-white font-bold'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4 text-[#00e5cc]" />
            <span>Import / Eksport SRT</span>
          </button>
        </div>

        {/* Body Area */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          
          {/* Subtitle Style Presets Bar (Always Accessible) */}
          <div>
            <label className="text-xs font-semibold text-[#00e5cc] uppercase tracking-wider block mb-2.5 font-mono">
              Wybierz Szablon Wizualny Napisów
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SUBTITLE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedStyle(preset.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedStyle === preset.id
                      ? 'bg-indigo-950/40 border-[#00e5cc] text-white shadow-lg'
                      : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">{preset.name}</span>
                    <span className="text-[10px] text-zinc-400 mt-1 block leading-tight">{preset.description}</span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase text-[#00e5cc]">{preset.animation}</span>
                    {selectedStyle === preset.id && <CheckCircle2 className="w-3.5 h-3.5 text-[#00e5cc]" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: AI SPEECH RECOGNITION */}
          {activeTab === 'ai_speech' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#18181F] border border-[#2A2A36] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    isListening ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/40' : 'bg-white/5 text-[#AAA]'
                  }`}>
                    {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {isListening ? 'Nasłuchiwanie aktywne...' : 'Automatyczne dyktowanie / rozpoznawanie dialogów'}
                    </span>
                    <p className="text-[11px] text-[#888] mt-0.5">
                      Kliknij przycisk i mów do mikrofonu lub odtwórz ścieżkę dźwiękową
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="bg-[#222] border border-[#333] text-white text-xs rounded-xl px-3 py-2 cursor-pointer outline-none"
                  >
                    <option value="pl-PL">Polski (PL)</option>
                    <option value="en-US">English (US)</option>
                    <option value="de-DE">Deutsch (DE)</option>
                    <option value="es-ES">Español (ES)</option>
                    <option value="fr-FR">Français (FR)</option>
                    <option value="uk-UA">Українська (UA)</option>
                  </select>

                  <button
                    onClick={handleToggleMic}
                    className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                      isListening
                        ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                        : 'bg-[#00e5cc] hover:bg-[#14f3db] text-black font-extrabold hover:scale-[1.02]'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-black" />}
                    <span>{isListening ? 'Zatrzymaj' : 'Start Dyktowania'}</span>
                  </button>
                </div>
              </div>

              {/* Real-time Results Preview */}
              {captionsList.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span>Przechwycone kwestie:</span>
                    <span className="font-mono text-[#00e5cc]">{captionsList.length} segmentów</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5">
                    {captionsList.map(c => (
                      <div key={c.id} className="p-2 rounded-xl bg-zinc-950 text-xs flex items-center justify-between border border-zinc-800">
                        <span className="text-white truncate flex-1">{c.text}</span>
                        <span className="text-[10px] font-mono text-[#00e5cc] ml-2 shrink-0">
                          {c.startTime.toFixed(1)}s - {c.endTime.toFixed(1)}s
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL CAPTION EDITOR */}
          {activeTab === 'manual' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Edycja poszczególnych linii dialogowych</span>
                <button
                  onClick={handleAddCaptionRow}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium border border-zinc-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#00e5cc]" />
                  <span>Dodaj kwestię</span>
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                {captionsList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Brak dodanych kwestii. Użyj dyktowania na żywo, zaimportuj plik SRT lub kliknij "Dodaj kwestię".
                  </div>
                ) : (
                  captionsList.map((cap, idx) => (
                    <div key={cap.id} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-zinc-500 w-6">{idx + 1}.</span>
                      <input
                        type="text"
                        value={cap.text}
                        onChange={(e) => handleUpdateCaption(cap.id, { text: e.target.value })}
                        placeholder="Treść wypowiedzi..."
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-[#00e5cc]"
                      />
                      <div className="flex items-center gap-1 shrink-0 text-xs font-mono">
                        <input
                          type="number"
                          step="0.1"
                          value={cap.startTime}
                          onChange={(e) => handleUpdateCaption(cap.id, { startTime: parseFloat(e.target.value) || 0 })}
                          className="w-14 bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1 text-center text-white outline-none"
                          title="Czas początkowy (sekundy)"
                        />
                        <span className="text-zinc-600">-</span>
                        <input
                          type="number"
                          step="0.1"
                          value={cap.endTime}
                          onChange={(e) => handleUpdateCaption(cap.id, { endTime: parseFloat(e.target.value) || 1 })}
                          className="w-14 bg-zinc-950 border border-zinc-800 rounded-lg px-1.5 py-1 text-center text-white outline-none"
                          title="Czas końcowy (sekundy)"
                        />
                        <span className="text-[10px] text-zinc-500">s</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCaption(cap.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SRT IMPORT / EXPORT */}
          {activeTab === 'srt_import' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Import pliku .SRT / .VTT</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Wgraj plik z dysku lub wklej zawartość tekstową poniżej</p>
                  </div>
                  <label className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-zinc-700 flex items-center gap-2 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#00e5cc]" />
                    <span>Wybierz plik SRT</span>
                    <input type="file" accept=".srt,.vtt,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                <textarea
                  value={rawSrtText}
                  onChange={(e) => setRawSrtText(e.target.value)}
                  placeholder={`1\n00:00:01,000 --> 00:00:04,500\nWitajcie w nowym odcinku!\n\n2\n00:00:05,000 --> 00:00:09,000\nDzisiaj pokażę Wam niesamowity montaż.`}
                  className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl p-3 font-mono text-xs text-white outline-none focus:border-[#00e5cc] custom-scrollbar"
                />

                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleParseSrtInput}
                    className="px-4 py-2 rounded-xl bg-[#00e5cc] hover:bg-[#14f3db] text-black font-bold text-xs cursor-pointer"
                  >
                    Przetwórz i Załaduj
                  </button>
                </div>
              </div>

              {/* Export Button */}
              {captionsList.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Eksportuj do pliku .SRT</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Pobierz napisy zsynchronizowane z czasem osi montażu</p>
                  </div>
                  <button
                    onClick={handleExportSRTFile}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#00e5cc]" />
                    <span>Pobierz .SRT</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Zamknij
          </button>
          
          <button
            onClick={handleApplyToProject}
            disabled={captionsList.length === 0}
            className="px-6 py-2.5 rounded-2xl bg-[#00e5cc] hover:bg-[#14f3db] text-black font-extrabold text-xs flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 shadow-lg shadow-cyan-950/40"
          >
            <CheckCircle2 className="w-4 h-4 text-black" />
            <span>Zastosuj Napisy ({captionsList.length}) do Filmu</span>
          </button>
        </div>

      </div>
    </div>
  );
}
