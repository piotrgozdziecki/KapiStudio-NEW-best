import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Loader2, 
  Check, 
  RefreshCw, 
  Search, 
  Video, 
  Image as ImageIcon, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2,
  HardDrive,
  Filter,
  Upload,
  FolderOpen,
  Link2,
  Sparkles,
  Cloud
} from 'lucide-react';
import { useAuth } from '../lib/firebase/AuthContext';
import { probeVideoMetadata } from '../core/media/metadataProber';
import type { MediaClip } from '../types/project';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportClips: (clips: MediaClip[]) => void;
  existingClips: MediaClip[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  createdTime?: string;
  webViewLink?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
  imageMediaMetadata?: {
    width?: number;
    height?: number;
  };
}

export function GoogleDriveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA" />
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.9 10.2 7.85 13.6z" fill="#EA4335" />
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.4-4.55 1.2L43.65 25z" fill="#00832D" />
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.4 4.55-1.2L59.8 53z" fill="#2684FC" />
      <path d="M73.4 26.5l-12.7-22C59.35 3.1 57.8 2 56.05 1.2L42.3 25l17.5 30.3h27.5c0-1.55-.4-3.1-1.2-4.5l-12.7-24.3z" fill="#FFBA00" />
    </svg>
  );
}

export function GoogleDriveModal({ isOpen, onClose, onImportClips, existingClips }: GoogleDriveModalProps) {
  const { user, accessToken, login, clearDriveAccess } = useAuth();
  const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'url'>('local');
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('all');
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [customVideoName, setCustomVideoName] = useState('');
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const existingFileIds = new Set(existingClips.filter(c => c.driveFileId).map(c => c.driveFileId));

  const fetchDriveFiles = async (tokenToUse?: string) => {
    const token = tokenToUse || accessToken;
    if (!token) {
      setNeedsDriveAuth(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const q = "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/json')";
      
      // Try direct API fetch first
      try {
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,createdTime,webViewLink,videoMediaMetadata,imageMediaMetadata)&orderBy=modifiedTime desc&pageSize=100`;
        const directRes = await fetch(driveUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (directRes.ok) {
          const data = await directRes.json();
          setFiles(data.files || []);
          setNeedsDriveAuth(false);
          return;
        } else if (directRes.status === 401 || directRes.status === 403) {
          setNeedsDriveAuth(true);
        }
      } catch {
        // Direct fetch failed (e.g. CORS or network), proceed to proxy
      }

      // Try server proxy
      const res = await fetch(`/api/drive/list?accessToken=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.requiresAuth || data.error === 'INSUFFICIENT_SCOPE') {
          setNeedsDriveAuth(true);
          setFiles([]);
          return;
        }
        setFiles(data.files || []);
        setNeedsDriveAuth(false);
      } else {
        if (res.status === 401 || res.status === 403) {
          setNeedsDriveAuth(true);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Nie udało się pobrać listy plików z Dysku Google.');
        }
      }
    } catch (err: any) {
      console.warn('[GoogleDriveModal] Drive list notice:', err?.message || err);
      setNeedsDriveAuth(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken && activeTab === 'cloud') {
      fetchDriveFiles();
    }
  }, [isOpen, accessToken, activeTab]);

  if (!isOpen) return null;

  const handleLogin = async (withDriveScopes: boolean = false) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const token = await login(withDriveScopes);
      if (token) {
        await fetchDriveFiles(token);
      }
    } catch (err: any) {
      console.warn('[GoogleDriveModal] Login notice:', err?.message || err);
      setError(err?.message || 'Nie udało się zalogować przez Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setLoading(true);
    try {
      const newClips: MediaClip[] = [];

      for (const file of selectedFiles) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
        if (!isVideo && !isImage) continue;

        const objectUrl = URL.createObjectURL(file);
        let duration = isVideo ? 10 : 5;
        let width = 1920;
        let height = 1080;
        let fps = 30;

        if (isVideo) {
          try {
            const probed = await probeVideoMetadata(objectUrl, file.size);
            if (probed && probed.duration) {
              duration = probed.duration;
              width = probed.width || 1920;
              height = probed.height || 1080;
              fps = probed.fps || 30;
            }
          } catch (probeErr) {
            console.warn('Probe error on local file:', probeErr);
          }
        }

        const isVertical = height > width;
        const isSquare = Math.abs(width - height) < 10;
        const orientation = isVertical ? 'portrait' : isSquare ? 'square' : 'landscape';
        const aspectRatio = isVertical ? '9:16' : isSquare ? '1:1' : '16:9';

        newClips.push({
          id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: isVideo ? 'video' : 'image',
          objectUrl,
          duration,
          width,
          height,
          fps,
          aspectRatio,
          orientation,
          size: file.size,
          category: 'unassigned',
          status: 'READY',
          isFavorite: false,
          tags: ['Dysk Lokalny / Google Drive'],
          createdAt: new Date().toISOString()
        });
      }

      if (newClips.length > 0) {
        onImportClips(newClips);
        onClose();
      }
    } catch (err) {
      console.error('Local file import error:', err);
      setError('Wystąpił błąd podczas wczytywania plików.');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!customVideoUrl.trim()) return;
    setLoading(true);
    try {
      const url = customVideoUrl.trim();
      const name = customVideoName.trim() || `Wideo_${new Date().toLocaleTimeString()}`;
      let duration = 15;
      let width = 1920;
      let height = 1080;

      try {
        const probed = await probeVideoMetadata(url, 0);
        if (probed && probed.duration) {
          duration = probed.duration;
          width = probed.width || 1920;
          height = probed.height || 1080;
        }
      } catch (e) {
        console.warn('Probe URL error:', e);
      }

      const clip: MediaClip = {
        id: `url_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        type: 'video',
        objectUrl: url,
        duration,
        width,
        height,
        aspectRatio: width >= height ? '16:9' : '9:16',
        orientation: width >= height ? 'landscape' : 'portrait',
        size: 0,
        category: 'unassigned',
        status: 'READY',
        isFavorite: false,
        tags: ['Stream URL'],
        createdAt: new Date().toISOString()
      };

      onImportClips([clip]);
      setCustomVideoUrl('');
      setCustomVideoName('');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Nie udało się zaimportować wideo z podanego adresu URL.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedFileIds(next);
  };

  const filteredFiles = files.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'video') return f.mimeType.startsWith('video/');
    if (filterType === 'image') return f.mimeType.startsWith('image/');
    return true;
  });

  const selectAll = () => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
    }
  };

  const handleConfirmImport = () => {
    const selected = files.filter(f => selectedFileIds.has(f.id));
    if (selected.length === 0) return;

    const token = accessToken || '';
    if (token && typeof window !== 'undefined') {
      sessionStorage.setItem('gdrive_access_token', token);
    }
    const newClips: MediaClip[] = selected.map(file => {
      const isVideo = file.mimeType.startsWith('video/');
      const streamUrl = `/api/drive/stream/${file.id}?accessToken=${encodeURIComponent(token)}`;
      
      let duration = isVideo ? 10 : 5;
      let width = 1920;
      let height = 1080;

      if (isVideo && file.videoMediaMetadata) {
        if (file.videoMediaMetadata.durationMillis) {
          const ms = parseInt(file.videoMediaMetadata.durationMillis, 10);
          if (!isNaN(ms) && ms > 0) {
            duration = Math.max(1, Math.round((ms / 1000) * 10) / 10);
          }
        }
        if (file.videoMediaMetadata.width && file.videoMediaMetadata.height) {
          width = file.videoMediaMetadata.width;
          height = file.videoMediaMetadata.height;
        }
      } else if (!isVideo && file.imageMediaMetadata) {
        if (file.imageMediaMetadata.width && file.imageMediaMetadata.height) {
          width = file.imageMediaMetadata.width;
          height = file.imageMediaMetadata.height;
        }
      }

      const isVertical = height > width;
      const isSquare = Math.abs(width - height) < 10;
      const orientation = isVertical ? 'portrait' : isSquare ? 'square' : 'landscape';
      const aspectRatio = isVertical ? '9:16' : isSquare ? '1:1' : '16:9';

      return {
        id: `gdrive_${file.id}`,
        name: file.name,
        type: isVideo ? 'video' : 'image',
        objectUrl: streamUrl,
        driveFileId: file.id,
        duration,
        width,
        height,
        aspectRatio,
        orientation,
        size: file.size ? parseInt(file.size, 10) : 0,
        thumbnailUrl: file.thumbnailLink,
        category: 'unassigned',
        status: 'READY',
        isFavorite: false,
        tags: ['Google Drive'],
        createdAt: file.createdTime || new Date().toISOString()
      };
    });

    onImportClips(newClips);
    setSelectedFileIds(new Set());
    onClose();
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '—';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '—';
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(0)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDurationSec = (durationMillis?: string) => {
    if (!durationMillis) return null;
    const ms = parseInt(durationMillis, 10);
    if (isNaN(ms) || ms <= 0) return null;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fadeIn">
      <div className="bg-[#0e121a] border border-white/[0.08] rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header with Luxury Styling */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500/20 via-sky-500/15 to-emerald-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <GoogleDriveIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Import Materiałów & Dysk Google
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  WebCodecs 4K
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Bezpośrednie wczytywanie nagrań wideo i zdjęć z folderu Google Drive lub chmury
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 bg-zinc-950/40 border-b border-white/[0.06]">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'local'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Folder Google Drive / Pliki (Szybki Import)</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'cloud'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Chmura Google & Konto</span>
          </button>

          <button
            onClick={() => setActiveTab('url')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'url'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Link URL / Strumień</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          
          {/* TAB 1: Szybki import lokalny z folderu Google Drive / Dysku */}
          {activeTab === 'local' && (
            <div className="space-y-5">
              <div 
                onClick={() => localFileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-indigo-950/15 hover:bg-indigo-950/25 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4 cursor-pointer transition-all shadow-xl group"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-8 h-8 text-indigo-400 animate-bounce" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h3 className="text-white font-bold text-base">
                    Kliknij lub przeciągnij pliki z folderu Dysku Google
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Obsługa 4K, 60 FPS, formaty MP4, MOV, WebM, MKV oraz JPG/PNG. Pliki są natychmiastowo dekodowane przez silnik sprzętowy WebCodecs GPU.
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-lg shadow-indigo-600/30">
                    Wybierz pliki z dysku
                  </span>
                </div>
              </div>

              <input
                ref={localFileInputRef}
                type="file"
                multiple
                accept="video/*,image/*"
                onChange={handleLocalFiles}
                className="hidden"
              />

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-300 leading-relaxed">
                  <strong>Wskazówka profesjonalisty:</strong> Jeśli korzystasz z aplikacji <em>Dysk Google dla komputerów (Google Drive for Desktop)</em>, Twoje pliki znajdują się w folderze dysku wirtualnego (np. G:\ lub ~/Google Drive) – możesz je przeciągnąć bezpośrednio do okna edytora z zerowym czasem oczekiwania!
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Chmura Google & Logowanie */}
          {activeTab === 'cloud' && (
            <div>
              {!user ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-xl">
                    <GoogleDriveIcon className="w-9 h-9" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Połącz z kontem Google</h3>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      Zaloguj się jednym kliknięciem przez Google, aby aktywować bezpieczną synchronizację projektów w chmurze Firestore.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2 text-left">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={() => handleLogin(false)}
                    disabled={isLoggingIn}
                    className="btn-primary px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2.5 cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <GoogleDriveIcon className="w-4 h-4" />
                    )}
                    <span>Zaloguj przez Google</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Search & Filter Toolbar */}
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Wyszukaj plik na Dysku..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center bg-zinc-900/80 border border-zinc-800 rounded-xl p-0.5 text-xs">
                        <button
                          onClick={() => setFilterType('all')}
                          className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            filterType === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Wszystkie
                        </button>
                        <button
                          onClick={() => setFilterType('video')}
                          className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            filterType === 'video' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Wideo
                        </button>
                        <button
                          onClick={() => setFilterType('image')}
                          className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            filterType === 'image' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Zdjęcia
                        </button>
                      </div>

                      <button
                        onClick={() => fetchDriveFiles()}
                        disabled={loading}
                        className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        title="Odśwież listę plików z Dysku"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* File List */}
                  {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                      <p className="text-xs text-zinc-400 font-mono">Pobieranie plików z chmury...</p>
                    </div>
                  ) : needsDriveAuth && files.length === 0 ? (
                    <div className="py-8 px-6 text-center border border-indigo-500/30 bg-gradient-to-b from-indigo-950/30 to-zinc-900/60 rounded-2xl space-y-4 max-w-lg mx-auto shadow-xl">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto">
                        <GoogleDriveIcon className="w-7 h-7" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-white font-bold text-sm">Autoryzacja odczytu Dysku Google</h3>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          Twoja sesja Google jest aktywna ({user.email}). Aby przeglądać listę plików wideo i zdjęć bezpośrednio z chmury Dysku Google, aktywuj uprawnienia do odczytu lub wybierz pliki bezpośrednio z komputera / zsynchronizowanego folderu Drive.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                        <button
                          onClick={() => handleLogin(true)}
                          disabled={isLoggingIn}
                          className="btn-primary w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                        >
                          {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                          <span>Autoryzuj dostęp do Dysku</span>
                        </button>

                        <button
                          onClick={() => setActiveTab('local')}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2"
                        >
                          <FolderOpen className="w-4 h-4 text-indigo-400" />
                          <span>Wybierz pliki lokalnie</span>
                        </button>
                      </div>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-zinc-800 rounded-2xl p-8 space-y-3">
                      <HardDrive className="w-8 h-8 mx-auto text-zinc-600" />
                      <p className="text-xs font-medium text-zinc-300">Zalogowano pomyślnie jako {user.displayName || user.email}!</p>
                      <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                        Użyj zakładki <strong>Folder Google Drive / Pliki</strong>, aby wczytać wideo w pełnej jakości 4K bez ograniczeń transferu.
                      </p>
                      <button
                        onClick={() => setActiveTab('local')}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg mt-2"
                      >
                        Przejdź do wyboru plików
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {filteredFiles.map((file) => {
                        const isSelected = selectedFileIds.has(file.id);
                        const isAlreadyImported = existingFileIds.has(file.id);
                        const isVideo = file.mimeType.startsWith('video/');
                        const durationStr = isVideo ? formatDurationSec(file.videoMediaMetadata?.durationMillis) : null;
                        const resStr = isVideo && file.videoMediaMetadata?.width 
                          ? `${file.videoMediaMetadata.width}×${file.videoMediaMetadata.height}`
                          : null;

                        return (
                          <div
                            key={file.id}
                            onClick={() => toggleSelect(file.id)}
                            className={`group p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 relative select-none ${
                              isSelected
                                ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-500/10'
                                : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700/60 shrink-0 overflow-hidden relative flex items-center justify-center">
                                {file.thumbnailLink ? (
                                  <img
                                    src={file.thumbnailLink}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : isVideo ? (
                                  <Video className="w-5 h-5 text-indigo-400" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-emerald-400" />
                                )}

                                {isVideo && (
                                  <div className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[9px] font-mono text-white">
                                    {durationStr || 'WIDEO'}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-medium text-white truncate" title={file.name}>
                                  {file.name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[10.5px] text-zinc-400 mt-1 font-mono">
                                  <span>{formatFileSize(file.size)}</span>
                                  {resStr && (
                                    <>
                                      <span>•</span>
                                      <span className="text-indigo-300">{resStr}</span>
                                    </>
                                  )}
                                </div>
                                {isAlreadyImported && (
                                  <span className="inline-block mt-1 text-[9.5px] text-emerald-400 font-medium">
                                    ✓ Już w projekcie
                                  </span>
                                )}
                              </div>

                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'border-zinc-700 bg-zinc-900'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Import z linku URL */}
          {activeTab === 'url' && (
            <div className="max-w-xl mx-auto py-6 space-y-4">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center mx-auto">
                  <Link2 className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-sm font-bold text-white">Importuj wideo z adresu URL</h3>
                <p className="text-xs text-zinc-400">
                  Wklej bezpośredni link do pliku wideo (MP4, WebM, MOV) lub strumienia
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 block mb-1">Adres URL Wideo (wymagany):</label>
                  <input
                    type="url"
                    placeholder="https://example.com/video.mp4"
                    value={customVideoUrl}
                    onChange={(e) => setCustomVideoUrl(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-zinc-400 block mb-1">Nazwa klipu (opcjonalnie):</label>
                  <input
                    type="text"
                    placeholder="np. Nagranie z drona 4K"
                    value={customVideoName}
                    onChange={(e) => setCustomVideoName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleUrlImport}
                  disabled={!customVideoUrl.trim() || loading}
                  className="w-full btn-primary py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 mt-2 shadow-lg"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Sparkles className="w-4 h-4" />}
                  <span>Dodaj wideo do biblioteki</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        {activeTab === 'cloud' && user && files.length > 0 && (
          <div className="p-4 border-t border-white/[0.08] bg-zinc-900/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer font-medium"
              >
                {selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0 ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </button>
              <span className="text-zinc-600">•</span>
              <span className="text-xs text-zinc-400 font-mono">
                Wybrano: <strong className="text-indigo-400">{selectedFileIds.size}</strong> z {filteredFiles.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Anuluj
              </button>

              <button
                onClick={handleConfirmImport}
                disabled={selectedFileIds.size === 0}
                className="btn-primary px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20"
              >
                Importuj do Projektu ({selectedFileIds.size})
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
