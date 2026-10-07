import React, { useState, useMemo } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  Trash2, 
  Loader2, 
  Star, 
  Plus, 
  Cloud, 
  AlertTriangle,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  Film,
  Clock,
  Sparkles,
  ArrowUpDown,
  Calendar,
  CheckSquare,
  Square,
  Copy,
  Volume2,
  VolumeX,
  Layers,
  ShieldAlert,
  Image as ImageIcon,
  Music,
  Play,
  SlidersHorizontal,
  X,
  LayoutGrid,
  List,
  Scissors,
  Zap,
  Truck,
  HardDrive
} from 'lucide-react';
import type { MediaClip, ClipCategory } from '../../types/project';
import { GoogleDriveModal, GoogleDriveIcon } from '../GoogleDriveModal';
import { probeVideoMetadata, probeImageMetadata } from '../../core/media/metadataProber';
import { urlRegistry } from '../../core/media/urlRegistry';
import { localIndexedDB } from '../../core/storage/indexedDBProvider';
import { ConfirmModal } from '../common/ConfirmModal';
import { proxyEngine } from '../../core/proxy/proxyEngine';
import { useStudioToast } from '../common/ToastContext';
import capybaraForkliftImg from '../../assets/capybara-forklift.jpg';

interface MediaManagerProps {
  clips: MediaClip[];
  onAddClips: (clips: MediaClip[]) => void;
  onUpdateClip: (id: string, updates: Partial<MediaClip>) => void;
  onRemoveClip: (id: string) => void;
  onAddToTimeline: (clip: MediaClip, customRange?: { start: number; end: number }) => void;
  onBatchAddToTimeline?: (clips: MediaClip[]) => void;
  onBatchRemoveClips?: (ids: string[]) => void;
  onRelinkSource?: (clipId: string, file: File) => void;
  onVerifyDurations?: () => Promise<{ checked: number; updated: number; details: { name: string; oldDuration: number; newDuration: number }[] }>;
  onClearFavorites?: () => void;
  onClearAllMedia?: () => void;
  onResetProject?: () => void;
  onEditClip?: (clip: MediaClip) => void;
  onMoveClipOrder?: (fromIndex: number, toIndex: number) => void;
  onOpenChronologicalModal?: (selectedClips?: MediaClip[]) => void;
  onQuickApplyDirectorCut?: (selectedClips?: MediaClip[]) => void;
  onNavigateToExport?: () => void;
  externalFilterTab?: string;
  onFilterTabChange?: (tab: any) => void;
}

export function MediaManager({ 
  clips = [], 
  onAddClips, 
  onUpdateClip, 
  onRemoveClip, 
  onAddToTimeline,
  onBatchAddToTimeline,
  onBatchRemoveClips,
  onRelinkSource,
  onVerifyDurations,
  onClearFavorites,
  onClearAllMedia,
  onResetProject,
  onEditClip,
  onMoveClipOrder,
  onOpenChronologicalModal,
  onQuickApplyDirectorCut,
  onNavigateToExport,
  externalFilterTab,
  onFilterTabChange
}: MediaManagerProps) {
  // Extra safety check for clips being null or undefined
  const safeClips = Array.isArray(clips) ? clips : [];
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isVerifyingDurations, setIsVerifyingDurations] = useState(false);
  const [savedExportsCount, setSavedExportsCount] = useState<number>(0);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    localIndexedDB.listExportedVideos()
      .then(list => setSavedExportsCount(list.length))
      .catch(() => {});
  }, []);

  const handleBatchMergeAndExport = () => {
    if (safeClips.length === 0) {
      toast.showWarning('Dodaj filmy do biblioteki przed scalaniem.');
      return;
    }
    const targetClips = selectedIds.size > 0 
      ? safeClips.filter(c => selectedIds.has(c.id)) 
      : (filteredClips.length > 0 ? filteredClips : safeClips);

    // Sort chronologically by recording or creation timestamp
    const sorted = [...targetClips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    if (onBatchAddToTimeline) {
      onBatchAddToTimeline(sorted);
    } else {
      sorted.forEach(clip => onAddToTimeline(clip));
    }

    toast.showSuccess(`🎬 Ułożono chronologicznie ${sorted.length} filmów na osi czasu. Przechodzę do eksportu...`);
    if (onNavigateToExport) {
      onNavigateToExport();
    }
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [proxyFilter, setProxyFilter] = useState<'all' | 'ready' | 'missing'>('all');
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'captured_newest' | 'captured_oldest' | 'quality' | 'duration_desc' | 'duration_asc' | 'name' | 'size' | 'fps' | 'resolution' | 'rating' | 'status'>('newest');
  const [missingClipIds, setMissingClipIds] = useState<string[]>([]);
  const [subclipTargetClip, setSubclipTargetClip] = useState<MediaClip | null>(null);
  const [subclipIn, setSubclipIn] = useState<number>(0);
  const [subclipOut, setSubclipOut] = useState<number>(3);
  
  // Multi-select & Grouping
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGroupedBySimilarity, setIsGroupedBySimilarity] = useState<boolean>(false);
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);
  const [isConfirmBatchDeleteOpen, setIsConfirmBatchDeleteOpen] = useState(false);
  const [previewingClip, setPreviewingClip] = useState<MediaClip | null>(null);
  const toast = useStudioToast();

  // Background proxy engine subscription & status synchronization
  React.useEffect(() => {
    const unsub = proxyEngine.subscribe((tasks) => {
      tasks.forEach(task => {
        if (task.status === 'PROXY_READY' && task.proxyUrl) {
          const clip = safeClips.find(c => c.id === task.clipId);
          if (clip && (!clip.isProxyReady || clip.proxyUrl !== task.proxyUrl)) {
            onUpdateClip(clip.id, {
              isProxyReady: true,
              proxyStatus: 'PROXY_READY',
              proxyUrl: task.proxyUrl
            });
          }
        }
      });
    });
    return unsub;
  }, [safeClips, onUpdateClip]);

  const handleGenerateProxy = (clip: MediaClip, profile: 'low_540p' | 'medium_720p' | 'high_1080p' = 'medium_720p') => {
    proxyEngine.enqueueClip(clip, profile);
    onUpdateClip(clip.id, {
      proxyStatus: 'PROXY_QUEUED',
      proxyProfile: profile
    });
    toast.showSuccess(`⚡ Dodano "${clip.name}" do kolejki generowania proxy (${profile}).`);
  };

  // Sync with externalFilterTab if provided
  React.useEffect(() => {
    if (externalFilterTab) {
      setFilterTab(externalFilterTab.toLowerCase());
    }
  }, [externalFilterTab]);

  const handleFilterTabChange = (newTab: string) => {
    setFilterTab(newTab);
    if (onFilterTabChange) {
      onFilterTabChange(newTab);
    }
  };

  const videoClips = useMemo(() => safeClips.filter(c => c.type === 'video'), [safeClips]);
  const hasSuspicious10sClips = useMemo(() => videoClips.some(c => c.duration === 10), [videoClips]);

  const handleAutoCategorizeChronologically = () => {
    if (safeClips.length === 0) return;
    
    // Sort clips chronologically by recording or creation timestamp
    const sorted = [...safeClips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    const stages: ClipCategory[] = [
      'preparations',
      'ceremony',
      'congratulations',
      'first_dance',
      'toast',
      'party',
      'guests',
      'climax',
      'ending'
    ];

    let updatedCount = 0;
    sorted.forEach((clip, index) => {
      const stageIdx = Math.min(
        stages.length - 1,
        Math.floor((index / sorted.length) * stages.length)
      );
      const targetCat = stages[stageIdx];
      onUpdateClip(clip.id, { category: targetCat });
      updatedCount++;
    });

    setVerifyMessage(`⚡ Sukces! Przypisano ${updatedCount} ujęć do etapów projektu wg osi czasu.`);
    setTimeout(() => setVerifyMessage(null), 7000);
  };

  const handleVerifyDurations = async () => {
    if (!onVerifyDurations || isVerifyingDurations) return;
    setIsVerifyingDurations(true);
    setVerifyMessage('Trwa precyzyjna analiza długości wszystkich ujęć wideo...');
    try {
      const res = await onVerifyDurations();
      if (res.updated > 0) {
        setVerifyMessage(`Zaktualizowano prawdziwy czas trwania dla ${res.updated} filmów (na ${res.checked} sprawdzonych).`);
      } else {
        setVerifyMessage(`Wszystkie filmy (${res.checked}) mają już potwierdzoną, dokładną długość.`);
      }
      setTimeout(() => setVerifyMessage(null), 8000);
    } catch (err: any) {
      setVerifyMessage(`Błąd weryfikacji: ${err.message || 'Nieznany błąd'}`);
      setTimeout(() => setVerifyMessage(null), 8000);
    } finally {
      setIsVerifyingDurations(false);
    }
  };

  const handleRefreshLibrary = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setVerifyMessage('Odświeżanie biblioteki i synchronizacja plików...');
    
    try {
      let recoveredCount = 0;
      const detectedMissingIds: string[] = [];

      for (const clip of safeClips) {
        let isReachable = true;
        
        // Check blob URLs
        if (clip.objectUrl?.startsWith('blob:')) {
          try {
            const res = await fetch(clip.objectUrl, { method: 'HEAD' });
            if (!res.ok) isReachable = false;
          } catch {
            isReachable = false;
          }

          if (!isReachable) {
            // Try to recover from IndexedDB
            const blob = await localIndexedDB.getMediaBlob(clip.id);
            if (blob) {
              const newUrl = urlRegistry.create(blob);
              onUpdateClip(clip.id, { objectUrl: newUrl, status: 'unused' });
              recoveredCount++;
            } else {
              detectedMissingIds.push(clip.id);
              onUpdateClip(clip.id, { status: 'missing' });
            }
          }
        }
      }

      setMissingClipIds(detectedMissingIds);

      if (onVerifyDurations) {
        await onVerifyDurations();
      }

      if (detectedMissingIds.length > 0) {
        setVerifyMessage(`Odświeżono! Odzyskano ${recoveredCount} plików. Wykryto ${detectedMissingIds.length} nieaktualnych/brakujących plików.`);
      } else {
        setVerifyMessage(`Biblioteka jest w 100% aktualna. Odświeżono wszystkie połączenia mediów.`);
      }
      
      setTimeout(() => {
        if (detectedMissingIds.length === 0) {
          setVerifyMessage(null);
        }
      }, 6000);
    } catch (err) {
      console.error('Refresh failed:', err);
      setVerifyMessage('Wystąpił błąd podczas odświeżania.');
      setTimeout(() => setVerifyMessage(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemoveMissingClips = () => {
    if (missingClipIds.length === 0) return;
    missingClipIds.forEach(id => onRemoveClip(id));
    setVerifyMessage(`Pomyślnie usunięto ${missingClipIds.length} nieaktualnych plików z biblioteki.`);
    setMissingClipIds([]);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleClearFavorites = () => {
    if (!onClearFavorites) {
      // Fallback if prop not provided
      safeClips.forEach(c => {
        if (c.isFavorite) onUpdateClip(c.id, { isFavorite: false });
      });
      return;
    }
    onClearFavorites();
  };

  const handleClearAllMedia = () => {
    setIsConfirmClearAllOpen(true);
  };

  const executeClearAllMedia = () => {
    setIsConfirmClearAllOpen(false);
    if (onResetProject) {
      onResetProject();
    } else if (onClearAllMedia) {
      onClearAllMedia();
    } else {
      safeClips.forEach(c => onRemoveClip(c.id));
    }
    toast.showSuccess('Pomyślnie wyczyszczono wszystkie materiały z projektu.');
  };

  // Multi-selection Handlers with Shift-range selection
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleSelectClip = (id: string, isShift = false) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isShift && lastSelectedId && filteredClips.some(c => c.id === lastSelectedId)) {
        const lastIdx = filteredClips.findIndex(c => c.id === lastSelectedId);
        const curIdx = filteredClips.findIndex(c => c.id === id);
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        for (let i = start; i <= end; i++) {
          next.add(filteredClips[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredClips.map(c => c.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const handleInvertSelection = () => {
    setSelectedIds(prev => {
      const next = new Set<string>();
      filteredClips.forEach(c => {
        if (!prev.has(c.id)) next.add(c.id);
      });
      return next;
    });
  };

  const handleBatchAddToTimeline = () => {
    const selected = filteredClips.filter(c => selectedIds.has(c.id));
    if (selected.length === 0) return;
    
    if (onBatchAddToTimeline) {
      onBatchAddToTimeline(selected);
    } else {
      selected.forEach(clip => {
        onAddToTimeline(clip);
      });
    }

    setVerifyMessage(`Dodano ${selected.length} zaznaczonych materiałów do osi czasu.`);
    setSelectedIds(new Set());
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchSetCategory = (category: ClipCategory) => {
    selectedIds.forEach(id => {
      onUpdateClip(id, { category });
    });
    setVerifyMessage(`Zaktualizowano kategorię na "${category}" dla ${selectedIds.size} materiałów.`);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchToggleFavorite = () => {
    const selected = safeClips.filter(c => selectedIds.has(c.id));
    const allFav = selected.every(c => c.isFavorite);
    selected.forEach(c => {
      onUpdateClip(c.id, { isFavorite: !allFav });
    });
    setVerifyMessage(allFav ? `Usunięto z ulubionych dla ${selected.length} ujęć.` : `Oznaczono jako ulubione ${selected.length} ujęć.`);
    setTimeout(() => setVerifyMessage(null), 5000);
  };

  const handleBatchRemove = () => {
    if (selectedIds.size === 0) return;
    setIsConfirmBatchDeleteOpen(true);
  };

  const executeBatchRemove = () => {
    setIsConfirmBatchDeleteOpen(false);
    const count = selectedIds.size;
    const ids = Array.from(selectedIds);

    if (onBatchRemoveClips) {
      onBatchRemoveClips(ids);
    } else {
      ids.forEach(id => onRemoveClip(id));
    }

    setSelectedIds(new Set());
    setLastSelectedId(null);
    toast.showSuccess(`Usunięto ${count} materiałów z biblioteki.`);
  };

  const handleAddBestMomentsToTimeline = () => {
    const bestClips = safeClips.filter(c => 
      c.type === 'video' && 
      (c.analysis?.ratingCategory === 'BEST' || (c.analysis?.qualityScore ?? 0) >= 75)
    );
    if (bestClips.length === 0) {
      toast.showWarning('Nie znaleziono jeszcze ujęć z oceną Złotych Momentów. Uruchom analizę Reżysera.');
      return;
    }

    // Sort chronologically and avoid duplicate takes
    const sorted = [...bestClips].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.createdAt).getTime();
      const timeB = new Date(b.capturedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

    let added = 0;
    sorted.forEach(clip => {
      // Exclude secondary duplicates
      if (clip.duplicateStatus && clip.duplicateStatus !== 'NONE' && !clip.bestInGroup) {
        return;
      }

      if (clip.analysis && clip.analysis.recommendedEnd > clip.analysis.recommendedStart) {
        onAddToTimeline(clip, {
          start: clip.analysis.recommendedStart,
          end: clip.analysis.recommendedEnd
        });
      } else {
        onAddToTimeline(clip);
      }
      added++;
    });

    setVerifyMessage(`★ Sukces! Dodano ${added} Złotych Momentów do osi czasu z przycięciem Smart Cut.`);
    setTimeout(() => setVerifyMessage(null), 6000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setUploadProgress(0);
    const validFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('image/') || f.type.startsWith('audio/'));
    if (validFiles.length === 0) {
      setIsProcessing(false);
      return;
    }

    let processedCount = 0;
    let failedCount = 0;
    const batchSize = 3; // 3 files processed in parallel

    for (let i = 0; i < validFiles.length; i += batchSize) {
      const chunk = validFiles.slice(i, i + batchSize);
      setProcessingStatus(`Wczytywanie i analiza: ${Math.min(i + chunk.length, validFiles.length)} z ${validFiles.length} plików...`);
      
      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          try {
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');
            const objectUrl = urlRegistry.create(file);

            if (isAudio) {
              let audioDuration = 10;
              try {
                const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                const ctx = new AudioCtx();
                const arrayBuffer = await file.arrayBuffer();
                const audioBuf = await ctx.decodeAudioData(arrayBuffer);
                audioDuration = Math.max(1, Number(audioBuf.duration.toFixed(1)));
                if (ctx && ctx.state !== 'closed') {
                  try { await ctx.close().catch(() => {}); } catch {}
                }
              } catch {
                audioDuration = await new Promise<number>((resolve) => {
                  const audio = new Audio(objectUrl);
                  audio.onloadedmetadata = () => resolve(Math.max(1, Math.round(audio.duration || 10)));
                  audio.onerror = () => resolve(10);
                  setTimeout(() => resolve(10), 3000);
                });
              }

              const clipId = `clip_audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              try {
                await localIndexedDB.saveMediaBlob(clipId, file);
              } catch (e) {
                console.warn('Could not store audio blob in IDB:', e);
              }

              const clip: MediaClip = {
                id: clipId,
                file,
                objectUrl,
                type: 'audio',
                name: file.name,
                duration: audioDuration,
                width: 0,
                height: 0,
                aspectRatio: '16:9',
                orientation: 'landscape',
                fps: 0,
                hasAudio: true,
                size: file.size,
                thumbnailUrl: undefined,
                category: 'unassigned',
                status: 'unused',
                isFavorite: false,
                tags: ['audio', 'music'],
                createdAt: new Date().toISOString(),
                capturedAt: new Date(file.lastModified).toISOString()
              };
              return clip;
            } else if (isVideo) {
              const meta = await probeVideoMetadata(file);
              const clipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              
              // Persist file in IndexedDB
              try {
                await localIndexedDB.saveMediaBlob(clipId, file);
              } catch (e) {
                console.warn('Could not store blob in IDB:', e);
              }

              const clip: MediaClip = {
                id: clipId,
                file,
                objectUrl,
                type: 'video',
                name: file.name,
                duration: meta.duration,
                width: meta.width,
                height: meta.height,
                aspectRatio: meta.aspectRatio,
                orientation: meta.orientation,
                fps: meta.fps,
                hasAudio: meta.hasAudio,
                size: file.size,
                thumbnailUrl: meta.thumbnailUrl || objectUrl,
                category: 'unassigned',
                status: 'unused',
                isFavorite: false,
                tags: [],
                createdAt: new Date().toISOString(),
                capturedAt: new Date(file.lastModified).toISOString()
              };
              return clip;
            } else {
              const meta = await probeImageMetadata(file);
              const clipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              
              try {
                await localIndexedDB.saveMediaBlob(clipId, file);
              } catch (e) {
                console.warn('Could not store blob in IDB:', e);
              }

              const clip: MediaClip = {
                id: clipId,
                file,
                objectUrl,
                type: 'image',
                name: file.name,
                duration: 5,
                width: meta.width,
                height: meta.height,
                aspectRatio: meta.aspectRatio,
                orientation: meta.orientation,
                fps: 30,
                hasAudio: false,
                size: file.size,
                thumbnailUrl: meta.thumbnailUrl || objectUrl,
                category: 'unassigned',
                status: 'unused',
                isFavorite: false,
                tags: [],
                createdAt: new Date().toISOString(),
                capturedAt: new Date(file.lastModified).toISOString()
              };
              return clip;
            }
          } catch (err: any) {
            console.error('Failed to probe file:', file.name, err);
            failedCount++;
            return null;
          }
        })
      );

      const validClipsInChunk = chunkResults.filter((c): c is MediaClip => c !== null);
      if (validClipsInChunk.length > 0) {
        onAddClips(validClipsInChunk);
        processedCount += validClipsInChunk.length;
      }

      setUploadProgress(Math.round(((i + chunk.length) / validFiles.length) * 100));
    }

    if (processedCount > 0) {
      if (failedCount > 0) {
        toast.showWarning(`Wczytano ${processedCount} materiałów (${failedCount} plików pominięto z powodu nieobsługiwanego formatu).`);
      } else {
        toast.showSuccess(`Błyskawicznie wczytano ${processedCount} materiałów do projektu!`);
      }
    } else if (failedCount > 0) {
      toast.showError(`Nie udało się wczytać plików (${failedCount} błędów formatu).`);
    }
    
    setIsProcessing(false);
    setProcessingStatus('');
    setUploadProgress(0);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    await processFiles(files);
  };
  
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      await processFiles(files);
    }
  };

  const handleRelinkInput = (clipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onRelinkSource) {
      onRelinkSource(clipId, e.target.files[0]);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDateTimeDisplay = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return null;
    }
  };

  // Filtered & Sorted Clips
  const filteredClips = useMemo(() => {
    let result = safeClips.filter(clip => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!clip.name.toLowerCase().includes(q) && !clip.category.toLowerCase().includes(q)) {
          return false;
        }
      }

      // Tab filter
      if (filterTab === 'video' && clip.type !== 'video') return false;
      if (filterTab === 'image' && clip.type !== 'image') return false;
      if (filterTab === 'audio' && clip.type !== 'audio') return false;
      if (filterTab === 'unused' && clip.status !== 'unused') return false;
      if (filterTab === 'used' && clip.status !== 'used') return false;
      if (filterTab === 'missing' && clip.status !== 'missing' && clip.objectUrl) return false;
      if (filterTab === 'favorites' && !clip.isFavorite) return false;

      // Smart & Technical Filters
      if (filterTab === 'best') {
        const isBest = clip.analysis?.ratingCategory === 'BEST' || (clip.analysis?.qualityScore ?? 0) >= 75;
        if (!isBest) return false;
      }
      if (filterTab === 'good' && clip.analysis?.ratingCategory !== 'GOOD') return false;
      if (filterTab === 'neutral' && clip.analysis?.ratingCategory !== 'NEUTRAL') return false;
      if (filterTab === 'problem') {
        const isProblem = clip.analysis?.ratingCategory === 'PROBLEM' || (clip.analysis?.issues && clip.analysis.issues.length > 0);
        if (!isProblem) return false;
      }
      if (filterTab === 'duplicates') {
        const isDuplicate = Boolean(
          (clip.analysis?.duplicateStatus && clip.analysis.duplicateStatus !== 'NONE') ||
          (clip.duplicateStatus && clip.duplicateStatus !== 'NONE') ||
          clip.similarGroupId
        );
        if (!isDuplicate) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && clip.category !== categoryFilter) return false;

      // Proxy filter
      if (proxyFilter === 'ready' && !clip.isProxyReady && clip.proxyStatus !== 'PROXY_READY') return false;
      if (proxyFilter === 'missing' && (clip.isProxyReady || clip.proxyStatus === 'PROXY_READY')) return false;

      // Rating filter
      if (ratingFilter > 0 && (clip.rating || 0) < ratingFilter) return false;

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      switch (sortOrder) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'captured_newest':
          return new Date(b.capturedAt || b.createdAt).getTime() - new Date(a.capturedAt || a.createdAt).getTime();
        case 'captured_oldest':
          return new Date(a.capturedAt || a.createdAt).getTime() - new Date(b.capturedAt || b.createdAt).getTime();
        case 'quality':
          return (b.analysis?.qualityScore ?? 50) - (a.analysis?.qualityScore ?? 50);
        case 'duration_desc':
          return b.duration - a.duration;
        case 'duration_asc':
          return a.duration - b.duration;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'fps':
          return (b.fps || 30) - (a.fps || 30);
        case 'resolution': {
          const resA = (a.width || 0) * (a.height || 0);
          const resB = (b.width || 0) * (b.height || 0);
          return resB - resA;
        }
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'status': {
          const rank = (s: any) => s === 'unused' ? 0 : (s === 'used' ? 1 : 2);
          return rank(a.status) - rank(b.status);
        }
        default:
          return 0;
      }
    });
  }, [safeClips, searchQuery, filterTab, categoryFilter, sortOrder, proxyFilter, ratingFilter]);

  const totalDuration = safeClips.reduce((acc, c) => acc + c.duration, 0);

  // Grouping by similarity helper
  const groupedClips = useMemo(() => {
    if (!isGroupedBySimilarity) {
      return [{ groupId: 'all', title: '', clips: filteredClips, isCluster: false }];
    }
    const map = new Map<string, MediaClip[]>();
    filteredClips.forEach(c => {
      const gId = c.similarGroupId || `solo_${c.id}`;
      if (!map.has(gId)) map.set(gId, []);
      map.get(gId)!.push(c);
    });

    const groups: { groupId: string; title: string; clips: MediaClip[]; isCluster: boolean }[] = [];
    map.forEach((grpClips, gId) => {
      const isCluster = grpClips.length > 1;
      groups.push({
        groupId: gId,
        title: isCluster ? `Seria ujęć / Duble (${grpClips.length} ujęć)` : '',
        clips: grpClips,
        isCluster
      });
    });

    return groups.sort((a, b) => (b.isCluster ? 1 : 0) - (a.isCluster ? 1 : 0));
  }, [filteredClips, isGroupedBySimilarity]);

  return (
    <div className="flex flex-col space-y-4 pb-6 w-full max-w-full">
      
      {/* Capybara Forklift Operator - Glassmorphism Corner Card Component */}
      <div className="w-full glass-panel rounded-2xl p-4 sm:p-5 border border-amber-500/35 bg-gradient-to-r from-amber-950/40 via-zinc-900/90 to-indigo-950/40 shadow-2xl relative overflow-hidden backdrop-blur-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          {/* Capybara Avatar with Lucide icons frame */}
          <div className="relative group shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-2xl shadow-amber-500/25 transform transition-transform group-hover:scale-105">
              <img 
                src={capybaraForkliftImg} 
                alt="Kapibara na wózku widłowym - Operator Kapi-Studio" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg border border-amber-300">
              <Truck className="w-3.5 h-3.5" />
            </div>
            <div className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center gap-1 border border-indigo-400">
              <Sparkles className="w-2.5 h-2.5" />
              <span>KAPI</span>
            </div>
          </div>

          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-white font-heading tracking-tight flex items-center gap-1.5">
                <span>Operator Kapi • Logistyka 4K</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono font-extrabold text-amber-300 uppercase tracking-wider shadow-sm">
                Wózek Widłowy Active ⚡
              </span>
            </div>
            <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
              Oficjalna maskotka studia dba o bezpieczny rozładunek Twoich ujęć 4K, krystaliczne wczytywanie klatek i 0% wycieków VRAM.
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-3 text-[11px] font-mono text-zinc-400 pt-0.5">
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <HardDrive className="w-3.5 h-3.5" /> Magazyn Mediów
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-indigo-300">
                <Zap className="w-3.5 h-3.5" /> Zero-Leak GPU
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldAlert className="w-3.5 h-3.5" /> 100% Bezpieczeństwa
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Załaduj Pliki 4K</span>
          </button>
        </div>
      </div>

      {/* Import Stage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0 w-full">
        
        {/* Local Disk Upload Card */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`md:col-span-2 relative glass-panel rounded-2xl p-6 flex flex-col items-center justify-center transition-all group overflow-hidden border ${
            isDragging 
              ? 'border-indigo-500 bg-indigo-950/20 shadow-xl shadow-indigo-500/10' 
              : 'border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/10 transition-all" />
          
          <div className="text-center space-y-3 relative z-10">
            <div className="relative inline-block mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform text-indigo-400">
                {isProcessing ? (
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                ) : (
                  <UploadCloud className="w-6 h-6 text-indigo-400" />
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm sm:text-base text-white font-heading">
                {isProcessing ? processingStatus : 'Wgraj pliki wideo, audio i zdjęcia'}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Przeciągnij i upuść lub kliknij, aby dodać materiały ze swojego urządzenia
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
                <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10.5px] font-mono text-indigo-300">4K UHD / 1080p</span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10.5px] font-mono text-zinc-400">MP4 • MOV • WEBM</span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10.5px] font-mono text-zinc-400">JPG • PNG • MP3</span>
              </div>
            </div>

            {isProcessing && (
              <div className="w-64 h-2 bg-zinc-900 rounded-full mx-auto overflow-hidden mt-3 border border-zinc-800 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              accept="video/*,image/*,audio/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
              title="Wybierz pliki z dysku komputera lub pamięci telefonu"
            />
          </div>
        </div>

        {/* Google Drive Import Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-between text-center relative group overflow-hidden border border-zinc-800">
          <div className="space-y-3 relative z-10 w-full flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <GoogleDriveIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Dysk Google Cloud</h3>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs mx-auto">
                Bezpośredni streaming plików 4K bez obciążania pamięci RAM
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDriveModalOpen(true)}
            className="w-full mt-4 btn-primary px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20"
          >
            <Cloud className="w-4 h-4" />
            <span>Otwórz Dysk Google</span>
          </button>
        </div>
      </div>

      {/* Modal for Google Drive */}
      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onImportClips={onAddClips}
        existingClips={clips}
      />

      {/* Saved Exported Videos on Site Notice */}
      {savedExportsCount > 0 && onNavigateToExport && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#171A21] via-[#101217] to-[#171A21] border border-[#2D3748] shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white font-cinematic">
                  Zapisane Filmy na Stronie ({savedExportsCount})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                  Pamięć IndexedDB
                </span>
              </div>
              <p className="text-[11px] text-[#8E99A8] mt-0.5">
                Twoje wcześniej wyrenderowane filmy są bezpiecznie zapisane w pamięci strony i gotowe do odtworzenia lub pobrania.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToExport}
            className="px-4 py-2 bg-[#202736] hover:bg-cyan-600 hover:text-white text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 min-h-[38px]"
          >
            <span>Przejdź do Zapisanych Filmów</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* AI Smart Chronological Sequencing Banner */}
      {clips.length >= 2 && onOpenChronologicalModal && (
        <div className="relative rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-indigo-950/40 via-zinc-900/90 to-purple-950/40 border border-indigo-500/30 shadow-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-md text-indigo-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm sm:text-base text-white">
                    Inteligentne Scalanie Chronologiczne & Podpisy
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-semibold text-indigo-300 font-mono">
                    {clips.length} ujęć
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 max-w-xl leading-relaxed">
                  Automatyczne ułożenie ujęć według osi czasu z inteligentnymi przejściami i kartami scen
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {onQuickApplyDirectorCut && (
                <button
                  onClick={() => onQuickApplyDirectorCut()}
                  className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20 whitespace-nowrap"
                  title="Szybkie scalenie z domyślną chronologią i kartami wstępu"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span>Scal & Podpisz (1-Klik)</span>
                </button>
              )}
              <button
                onClick={() => onOpenChronologicalModal?.()}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                title="Dostosuj kolejność ujęć, tytuły i styl kart"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Dostosuj...</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3.5 glass-panel p-3.5 sm:p-4 rounded-2xl border border-zinc-800 shrink-0 shadow-xl backdrop-blur-xl">
        
        {/* Row 1: Search + Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          {/* Search */}
          <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Szukaj ujęcia lub tagu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-100 focus:outline-none transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-[11px] overflow-x-auto touch-pan-x custom-scrollbar max-w-full">
            <button
              onClick={() => handleFilterTabChange('all')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'all' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}
            >
              Wszystkie ({clips.length})
            </button>
            <button
              onClick={() => handleFilterTabChange('video')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'video' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}
            >
              <Film className="w-3 h-3" />
              <span>Wideo ({clips.filter(c => c.type === 'video').length})</span>
            </button>
            <button
              onClick={() => handleFilterTabChange('image')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'image' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Zdjęcia ({clips.filter(c => c.type === 'image').length})</span>
            </button>
            <button
              onClick={() => handleFilterTabChange('audio')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium flex items-center gap-1 cursor-pointer ${filterTab === 'audio' ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}`}
            >
              <Music className="w-3 h-3" />
              <span>Audio ({clips.filter(c => c.type === 'audio').length})</span>
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-1" />
            <button
              onClick={() => handleFilterTabChange('best')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-semibold flex items-center gap-1 cursor-pointer ${filterTab === 'best' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'text-emerald-400 hover:bg-emerald-950/30'}`}
              title="Pokaż ujęcia ocenione jako Najlepsze"
            >
              ★ Najlepsze
            </button>
            <button
              onClick={() => handleFilterTabChange('duplicates')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all font-semibold flex items-center gap-1 cursor-pointer ${filterTab === 'duplicates' ? 'bg-amber-600 text-white shadow-md' : 'text-amber-400 hover:bg-amber-950/30'}`}
              title="Pokaż serie ujęć i wykryte duble"
            >
              <Copy className="w-3 h-3" />
              <span>Duplikaty</span>
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-1" />
            <button
              onClick={() => handleFilterTabChange('unused')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'unused' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}
            >
              Nieużyte
            </button>
            <button
              onClick={() => handleFilterTabChange('used')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'used' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}
            >
              Na osi
            </button>
            <button
              onClick={() => handleFilterTabChange('favorites')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium cursor-pointer ${filterTab === 'favorites' ? 'bg-indigo-600 text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}
            >
              ★ Ulubione
            </button>
          </div>
        </div>

        {/* Row 2: View Switcher, Category, Proxy, Sort, and Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher: Grid, List, Compact */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl text-xs shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
                title="Widok Siatka (standardowy)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
                title="Widok Lista (profesjonalny stół montażowy)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'compact' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
                title="Widok Kompaktowy (dla 50-100+ ujęć)"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Proxy Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={proxyFilter}
                onChange={(e) => setProxyFilter(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
              >
                <option value="all">Wszystkie stany proxy</option>
                <option value="ready">⚡ Tylko gotowe Proxy</option>
                <option value="missing">Brak pliku Proxy</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Wszystkie kategorie / akty</option>
                <option value="opening">I. Wstęp / Prolog</option>
                <option value="a_roll">II. Główny Wątek / A-Roll</option>
                <option value="b_roll">III. Przebitki / B-Roll</option>
                <option value="interview">IV. Wywiady / Dialogi</option>
                <option value="action">V. Dynamiczna Akcja</option>
                <option value="scenery">VI. Krajobraz / Dron</option>
                <option value="climax">VII. Kulminacja</option>
                <option value="ending">VIII. Finał i Epilog</option>
                <option value="preparations">Kulisy / Przygotowania</option>
                <option value="ceremony">Ceremonia / Gala</option>
                <option value="party">Celebracja / Event</option>
                <option value="outdoor">Plener</option>
                <option value="unassigned">Nieprzypisane</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="newest">Od najnowszych (dodanie)</option>
                <option value="oldest">Od najstarszych (dodanie)</option>
                <option value="captured_newest">Od najnowszych (nagranie)</option>
                <option value="captured_oldest">Od najstarszych (nagranie)</option>
                <option value="quality">Najwyższa jakość (ocena techniczna)</option>
                <option value="duration_desc">Długość (od najdłuższych)</option>
                <option value="duration_asc">Długość (od najkrótszych)</option>
                <option value="resolution">Rozdzielczość (od 4K / UHD)</option>
                <option value="fps">Klatkaż (FPS)</option>
                <option value="rating">Ocena (gwiazdki 1-5)</option>
                <option value="status">Status użycia (nieużyte najpierw)</option>
                <option value="name">Nazwa (A-Z)</option>
                <option value="size">Rozmiar pliku</option>
              </select>
            </div>

            {/* Grouping Toggle */}
            <button
              onClick={() => setIsGroupedBySimilarity(!isGroupedBySimilarity)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isGroupedBySimilarity
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
              }`}
              title="Grupuj ujęcia w serie i klastry podobieństwa (widok serii i dubli)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Grupuj serie</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {clips.length > 0 && (
              <button
                onClick={handleBatchMergeAndExport}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap shrink-0"
                title="Układa ujęcia chronologicznie i przechodzi bezpośrednio do finalizacji i eksportu filmu"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Scal i Eksportuj Film</span>
              </button>
            )}

            {onOpenChronologicalModal && clips.length > 0 && (
              <button
                onClick={() => onOpenChronologicalModal?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 hover:border-indigo-400 transition-all cursor-pointer text-xs font-semibold whitespace-nowrap shrink-0"
                title="Automatyczne scalanie chronologiczne i podpisywanie scen"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Scal i Podpisz</span>
              </button>
            )}

            {filteredClips.length > 0 && (
              <button
                onClick={handleSelectAllFiltered}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-all cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
                title="Zaznacza wszystkie widoczne ujęcia"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Zaznacz wszystkie ({filteredClips.length})</span>
              </button>
            )}

            {clips.some(c => (c.analysis?.ratingCategory === 'BEST' || (c.analysis?.qualityScore ?? 0) >= 75)) && (
              <button
                onClick={handleAddBestMomentsToTimeline}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 transition-all cursor-pointer text-xs font-semibold whitespace-nowrap shrink-0"
                title="Dodaje wszystkie najlepsze ujęcia bezpośrednio na oś czasu"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>★ Dodaj Złote Momenty</span>
              </button>
            )}

            {clips.length > 0 && (
              <button
                onClick={handleAutoCategorizeChronologically}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
                title="Automatycznie analizuje daty i godziny nagrań, przypisując ujęcia do kolejnych aktów filmu"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Auto-akty</span>
              </button>
            )}

            <button
              onClick={handleRefreshLibrary}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
              title="Sprawdza dostępność plików i odświeża połączenia"
            >
              {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <RotateCw className="w-3.5 h-3.5 text-zinc-400" />}
              <span>Odśwież</span>
            </button>

            {clips.length > 0 && (
              <button
                onClick={handleClearFavorites}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition-all cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
                title="Usuwa oznaczenie gwiazdką ze wszystkich materiałów"
              >
                <Star className="w-3.5 h-3.5" />
                <span>Wyczyść gwiazdki</span>
              </button>
            )}

            {clips.length > 0 && (
              <button
                onClick={handleClearAllMedia}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-900/40 bg-rose-950/30 text-rose-300 hover:bg-rose-950/60 hover:border-rose-500/50 transition-all cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
                title="Usuwa WSZYSTKIE materiały i czyści bibliotekę"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Wyczyść bibliotekę</span>
              </button>
            )}

            {onVerifyDurations && videoClips.length > 0 && (
              <button
                onClick={handleVerifyDurations}
                disabled={isVerifyingDurations}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  hasSuspicious10sClips
                    ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
                title="Bada pliki źródłowe i przywraca rzeczywisty czas trwania dla wszystkich filmów"
              >
                {isVerifyingDurations ? (
                  <Loader2 className={`w-3.5 h-3.5 animate-spin ${hasSuspicious10sClips ? 'text-black' : 'text-indigo-400'}`} />
                ) : (
                  <Clock className={`w-3.5 h-3.5 ${hasSuspicious10sClips ? 'text-black' : 'text-indigo-400'}`} />
                )}
                <span>
                  {isVerifyingDurations ? 'Badanie filmów...' : (hasSuspicious10sClips ? '⚡ Zbadaj czasy filmów' : 'Weryfikuj długości')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch Actions Bar for Multi-selection */}
      {selectedIds.size > 0 && (
        <div className="bg-zinc-900 border border-indigo-500/60 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xl shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs text-white flex-wrap">
            <span className="font-semibold text-indigo-300 bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-500/40 flex items-center gap-1.5 shadow-inner">
              <span>{selectedIds.size} zaznaczonych</span>
              <span className="text-zinc-400 text-[10px] font-mono">
                ({formatDuration(clips.filter(c => selectedIds.has(c.id)).reduce((acc, c) => acc + (c.duration || 0), 0))})
              </span>
            </span>
            <button 
              onClick={handleSelectAllFiltered}
              className="text-[11px] text-zinc-400 hover:text-white underline ml-1 cursor-pointer font-medium"
            >
              Zaznacz widoczne ({filteredClips.length})
            </button>
            <button 
              onClick={handleInvertSelection}
              className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer font-medium"
            >
              Odwróć
            </button>
            <button 
              onClick={handleClearSelection}
              className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer font-medium"
            >
              Odznacz wszystko
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onOpenChronologicalModal && (
              <button
                onClick={() => {
                  const selected = clips.filter(c => selectedIds.has(c.id));
                  onOpenChronologicalModal(selected.length > 0 ? selected : filteredClips);
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all hover:scale-[1.02] active:scale-95"
                title="Otwórz Reżysera dla zaznaczonych materiałów"
              >
                <Sparkles className="w-4 h-4 fill-white" />
                <span>Reżyser ({selectedIds.size})</span>
              </button>
            )}

            <button
              onClick={handleBatchMergeAndExport}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all hover:scale-[1.02] active:scale-95"
              title="Scal zaznaczone ujęcia i przejdź bezpośrednio do okna eksportu"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Scal i Eksportuj ({selectedIds.size})</span>
            </button>

            <button
              onClick={handleBatchAddToTimeline}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
              title="Dodaj wszystkie zaznaczone ujęcia do montażu"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Dodaj do osi ({selectedIds.size})</span>
            </button>

            <select
              onChange={(e) => {
                if (e.target.value !== 'none') {
                  handleBatchSetCategory(e.target.value as any);
                  e.target.value = 'none';
                }
              }}
              defaultValue="none"
              className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 cursor-pointer hover:border-zinc-500 focus:outline-none"
            >
              <option value="none" disabled>Zmień kategorię...</option>
              <option value="opening">I. Wstęp / Prolog</option>
              <option value="a_roll">II. Główny Wątek / A-Roll</option>
              <option value="b_roll">III. Przebitki / B-Roll</option>
              <option value="interview">IV. Wywiady / Dialogi</option>
              <option value="action">V. Dynamiczna Akcja</option>
              <option value="scenery">VI. Krajobraz / Dron</option>
              <option value="climax">VII. Kulminacja</option>
              <option value="ending">VIII. Finał i Epilog</option>
              <option value="preparations">Kulisy / Przygotowania</option>
              <option value="ceremony">Ceremonia / Gala</option>
              <option value="party">Celebracja / Event</option>
              <option value="outdoor">Plener</option>
              <option value="unassigned">Nieprzypisane</option>
            </select>

            <button
              onClick={handleBatchToggleFavorite}
              className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 text-xs font-medium px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>Ulubione</span>
            </button>

            <button
              onClick={handleBatchRemove}
              className="bg-rose-950/50 hover:bg-rose-950/80 text-rose-300 border border-rose-800/60 text-xs font-medium px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Usuń</span>
            </button>
          </div>
        </div>
      )}

      {/* Verification Status Banner */}
      {verifyMessage && (
        <div className="bg-zinc-900 border border-indigo-500/40 text-zinc-200 px-4 py-2.5 rounded-2xl text-xs flex items-center justify-between shadow-lg shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{verifyMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            {missingClipIds.length > 0 && (
              <button
                onClick={handleRemoveMissingClips}
                className="bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-medium px-2.5 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow"
                title="Usuwa z biblioteki wszystkie pliki, których źródła zostały utracone"
              >
                <Trash2 className="w-3 h-3" />
                Usuń nieaktualne ({missingClipIds.length})
              </button>
            )}
            <button 
              onClick={() => { setVerifyMessage(null); setMissingClipIds([]); }}
              className="text-xs text-zinc-400 hover:text-white ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Suspicious 10s Alert Banner */}
      {hasSuspicious10sClips && !verifyMessage && !isVerifyingDurations && (
        <div className="bg-amber-950/30 border border-amber-500/40 text-amber-200 px-4 py-3 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              Wykryto filmy o domyślnym czasie <strong>10 sekund</strong> (z Dysku Google lub przed pełną analizą). Kliknij poniżej, aby odczytać ich rzeczywistą długość.
            </span>
          </div>
          {onVerifyDurations && (
            <button 
              onClick={handleVerifyDurations}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs px-3.5 py-1.5 rounded-xl shrink-0 cursor-pointer transition-transform hover:scale-105 shadow-md flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Napraw czasy filmów</span>
            </button>
          )}
        </div>
      )}

      {/* Media Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {filteredClips.length === 0 ? (
          <div className="min-h-[300px] border border-dashed border-zinc-800/80 rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-zinc-950/60 relative overflow-hidden">
            {clips.length === 0 ? (
              <div className="flex flex-col items-center max-w-md space-y-4">
                <div className="relative group">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-2 border-indigo-500/40 shadow-2xl shadow-indigo-500/20 transform transition-transform group-hover:scale-105">
                    <img 
                      src={capybaraForkliftImg} 
                      alt="Kapibara na wózku widłowym - Operator Kapi-Studio" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-extrabold text-[10px] uppercase tracking-wider shadow-md">
                    Operator Kapi
                  </span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-base sm:text-lg tracking-tight">
                    Gotowy do załadunku ujęć 4K!
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Kapibara na wózku widłowym czeka na Twoje filmy i zdjęcia. Przeciągnij pliki z komputera lub połącz Dysk Google powyżej.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Wybierz pliki z dysku</span>
                  </button>
                  <button
                    onClick={() => setIsDriveModalOpen(true)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <GoogleDriveIcon className="w-3.5 h-3.5" />
                    <span>Dysk Google</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2 text-zinc-500">
                <Film className="w-10 h-10 opacity-40 mb-1" />
                <p className="text-xs text-zinc-400 font-medium">
                  Brak ujęć spełniających wybrane kryteria lub filtry.
                </p>
                <button
                  onClick={() => { setSearchQuery(''); setCategoryFilter('all'); setProxyFilter('all'); setFilterTab('all'); }}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer pt-1"
                >
                  Wyczyść wszystkie filtry
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            {groupedClips.map((group) => (
              <div 
                key={group.groupId} 
                className={group.isCluster && isGroupedBySimilarity ? "p-4 bg-zinc-900/60 border border-indigo-500/30 rounded-2xl space-y-3" : ""}
              >
                {group.isCluster && isGroupedBySimilarity && (
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-300">{group.title}</span>
                      <span className="text-[10px] text-zinc-400">• Wybierz najlepsze ujęcie do montażu</span>
                    </div>
                  </div>
                )}

                {viewMode === 'list' ? (
                  <div className="overflow-x-auto bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl custom-scrollbar">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-zinc-950/90 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                        <tr>
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3 w-28">Podgląd</th>
                          <th className="p-3">Nazwa / Kategoria</th>
                          <th className="p-3 w-24">Czas</th>
                          <th className="p-3 w-28">Format</th>
                          <th className="p-3 w-20">FPS</th>
                          <th className="p-3 w-24">Rozmiar</th>
                          <th className="p-3 w-36">Proxy</th>
                          <th className="p-3 w-36">Status</th>
                          <th className="p-3 w-32">Ocena</th>
                          <th className="p-3 w-28 text-right pr-4">Akcje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {group.clips.map((clip, clipIndex) => {
                          const isMissing = clip.status === 'missing' || (!clip.objectUrl && !clip.file && !clip.driveFileId);
                          const isSelected = selectedIds.has(clip.id);
                          const usageNum = clip.usageCount || (clip.status === 'used' ? 1 : 0);
                          const resolutionLabel = clip.width && clip.height ? (
                            Math.max(clip.width, clip.height) >= 3800 ? '4K UHD' :
                            Math.max(clip.width, clip.height) >= 2500 ? '2.7K' :
                            Math.max(clip.width, clip.height) >= 1900 ? '1080p FHD' :
                            Math.max(clip.width, clip.height) >= 1200 ? '720p HD' :
                            `${clip.width}×${clip.height}`
                          ) : '1080p';

                          return (
                            <tr 
                              key={clip.id}
                              className={`hover:bg-zinc-800/40 transition-colors ${
                                isSelected ? 'bg-indigo-950/30' : isMissing ? 'bg-rose-950/20' : ''
                              }`}
                            >
                              <td className="p-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectClip(clip.id, e.shiftKey);
                                  }}
                                  className="cursor-pointer text-zinc-400 hover:text-white"
                                >
                                  {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="p-2.5">
                                <div 
                                  onClick={() => setPreviewingClip(clip)}
                                  className="w-20 h-12 bg-black rounded-lg overflow-hidden relative cursor-pointer group/thumb border border-zinc-800 shrink-0"
                                >
                                  {clip.thumbnailUrl ? (
                                    <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                      <FileVideo className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                                    <Play className="w-3.5 h-3.5 fill-white text-white" />
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-white truncate max-w-xs">{clip.name}</span>
                                  <span className="text-[10px] text-zinc-500 font-sans mt-0.5">{clip.category}</span>
                                </div>
                              </td>
                              <td className="p-3 font-semibold text-zinc-200">
                                {formatDuration(clip.duration)}
                              </td>
                              <td className="p-3 text-indigo-400 font-semibold">
                                {resolutionLabel}
                              </td>
                              <td className="p-3 text-zinc-300">
                                {clip.fps || 30} FPS
                              </td>
                              <td className="p-3 text-zinc-400">
                                {formatSize(clip.size)}
                              </td>
                              <td className="p-3">
                                {clip.type === 'video' ? (
                                  clip.isProxyReady || clip.proxyStatus === 'PROXY_READY' ? (
                                    <span className="px-2 py-0.5 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold">
                                      ⚡ PROXY READY
                                    </span>
                                  ) : clip.proxyStatus === 'PROXY_GENERATING' ? (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-semibold flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> PROXY TRWA
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleGenerateProxy(clip, 'medium_720p')}
                                      className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-cyan-950/80 text-zinc-300 hover:text-cyan-300 border border-zinc-700 hover:border-cyan-500/40 text-[10px] cursor-pointer transition flex items-center gap-1"
                                    >
                                      <Zap className="w-2.5 h-2.5" /> + Generuj
                                    </button>
                                  )
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                {isMissing ? (
                                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> BRAK PLIKU
                                  </span>
                                ) : usageNum === 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-semibold">
                                    UNUSED
                                  </span>
                                ) : usageNum === 1 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold">
                                    USED (1x)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[10px] font-semibold">
                                    USED MULTIPLE ({usageNum}x)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      onClick={() => onUpdateClip(clip.id, { rating: clip.rating === star ? 0 : star })}
                                      className="p-0.5 cursor-pointer hover:scale-115 transition-transform"
                                    >
                                      <Star className={`w-3 h-3 ${star <= (clip.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="p-3 text-right pr-4">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => onAddToTimeline(clip)}
                                    className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition"
                                    title="Dodaj do osi czasu"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  {clip.analysis && clip.analysis.recommendedEnd > clip.analysis.recommendedStart && (
                                    <button
                                      onClick={() => onAddToTimeline(clip, { 
                                        start: clip.analysis!.recommendedStart, 
                                        end: clip.analysis!.recommendedEnd 
                                      })}
                                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition text-[10px]"
                                      title="Smart Cut"
                                    >
                                      ✂️
                                    </button>
                                  )}
                                  <button
                                    onClick={() => onUpdateClip(clip.id, { isFavorite: !clip.isFavorite })}
                                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer transition"
                                    title="Ulubione"
                                  >
                                    <Star className={`w-3.5 h-3.5 ${clip.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                                  </button>
                                  <button
                                    onClick={() => onRemoveClip(clip.id)}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 cursor-pointer transition"
                                    title="Usuń"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : viewMode === 'compact' ? (
                  <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {group.clips.map((clip, clipIndex) => {
                      const isMissing = clip.status === 'missing' || (!clip.objectUrl && !clip.file && !clip.driveFileId);
                      const isSelected = selectedIds.has(clip.id);
                      const usageNum = clip.usageCount || (clip.status === 'used' ? 1 : 0);

                      return (
                        <div
                          key={clip.id}
                          onClick={() => toggleSelectClip(clip.id, false)}
                          className={`bg-zinc-900 border rounded-xl overflow-hidden group relative flex flex-col transition-all cursor-pointer shadow hover:scale-[1.02] ${
                            isSelected
                              ? 'border-indigo-500 ring-2 ring-indigo-500/50'
                              : isMissing
                              ? 'border-rose-500/60'
                              : 'border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center">
                            {clip.thumbnailUrl ? (
                              <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <FileVideo className="w-4 h-4 text-white/30" />
                            )}
                            <div className="absolute top-1 left-1 flex items-center gap-1">
                              {clip.isProxyReady && (
                                <span className="px-1 py-0.2 rounded bg-cyan-950/90 text-cyan-300 text-[8px] font-mono font-bold">
                                  ⚡P
                                </span>
                              )}
                            </div>
                            <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8.5px] font-mono text-white">
                              {formatDuration(clip.duration)}
                            </div>
                            <div className="absolute bottom-1 left-1">
                              <span className={`w-2 h-2 rounded-full inline-block ${
                                isMissing ? 'bg-rose-500' : usageNum > 0 ? 'bg-emerald-400' : 'bg-zinc-500'
                              }`} />
                            </div>
                          </div>
                          <div className="p-1.5 flex items-center justify-between gap-1 text-[10px] font-mono">
                            <span className="truncate text-zinc-200">{clip.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddToTimeline(clip);
                              }}
                              className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
                              title="Dodaj do osi"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {group.clips.map((clip, clipIndex) => {
                    const isMissing = clip.status === 'missing' || (!clip.objectUrl && !clip.file && !clip.driveFileId);
                    const isVertical = clip.orientation === 'portrait';
                    const isSelected = selectedIds.has(clip.id);
                    const mimeLabel = clip.mimeType || (clip.type === 'video' ? 'video/mp4' : 'image/jpeg');
                    const usageNum = clip.usageCount || (clip.status === 'used' ? 1 : 0);
                    const resolutionLabel = clip.width && clip.height ? (
                      Math.max(clip.width, clip.height) >= 3800 ? '4K UHD' :
                      Math.max(clip.width, clip.height) >= 2500 ? '2.7K' :
                      Math.max(clip.width, clip.height) >= 1900 ? '1080p FHD' :
                      Math.max(clip.width, clip.height) >= 1200 ? '720p HD' :
                      `${clip.width}×${clip.height}`
                    ) : '1080p';

                    const bitrateLabel = clip.bitrate && clip.bitrate > 0 ? (
                      clip.bitrate >= 1_000_000 ? `${(clip.bitrate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(clip.bitrate / 1000)} kbps`
                    ) : null;

                    return (
                      <div 
                        key={clip.id} 
                        draggable={Boolean(onMoveClipOrder)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(clipIndex));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                          if (!isNaN(fromIdx) && fromIdx !== clipIndex && onMoveClipOrder) {
                            onMoveClipOrder(fromIdx, clipIndex);
                          }
                        }}
                        className={`bg-zinc-900/90 border rounded-2xl overflow-hidden group relative flex flex-col transition-all hover:scale-[1.01] duration-200 cursor-grab active:cursor-grabbing shadow-lg ${
                          isSelected
                            ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-indigo-500/20'
                            : isMissing 
                            ? 'border-rose-500/60 bg-rose-950/20' 
                            : clip.status === 'used'
                            ? 'border-emerald-500/40 shadow-emerald-950/20'
                            : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {/* Thumbnail Container with Click to Preview */}
                        <div 
                          onClick={() => setPreviewingClip(clip)}
                          className="relative aspect-video bg-black overflow-hidden flex items-center justify-center cursor-pointer group/thumb"
                          title="Kliknij, aby otworzyć podgląd wideo"
                        >
                          {clip.thumbnailUrl ? (
                            <img 
                              src={clip.thumbnailUrl} 
                              alt={clip.name} 
                              className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105" 
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {clip.type === 'image' ? (
                                <ImageIcon className="w-6 h-6 text-white/20" />
                              ) : clip.type === 'audio' ? (
                                <Music className="w-6 h-6 text-white/20" />
                              ) : (
                                <FileVideo className="w-6 h-6 text-white/20" />
                              )}
                            </div>
                          )}
                          
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-80" />
                          
                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40">
                            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 transform scale-90 group-hover/thumb:scale-100 transition-transform">
                              <Play className="w-5 h-5 fill-white ml-0.5" />
                            </div>
                          </div>
                          
                          {/* Selection Checkbox & Clip Number */}
                          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectClip(clip.id, e.shiftKey);
                              }}
                              className={`p-1 rounded-lg backdrop-blur-md transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                                  : 'bg-black/60 text-white hover:bg-black/90 border border-white/10'
                              }`}
                              title={isSelected ? "Odznacz ujęcie" : "Zaznacz ujęcie"}
                            >
                              {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 opacity-70" />}
                            </button>
                            <span className="px-1.5 py-0.5 rounded-md bg-black/80 border border-white/10 text-[10px] font-mono font-semibold text-white">
                              #{clipIndex + 1}
                            </span>
                          </div>

                          {/* Action buttons on hover */}
                          <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
                            <button 
                              onClick={() => onAddToTimeline(clip)}
                              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md cursor-pointer transition-transform hover:scale-105 shadow-indigo-600/30"
                              title="Dodaj pełne ujęcie do osi czasu"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            {clip.analysis && clip.analysis.recommendedEnd > clip.analysis.recommendedStart && (
                              <button
                                onClick={() => onAddToTimeline(clip, { 
                                  start: clip.analysis!.recommendedStart, 
                                  end: clip.analysis!.recommendedEnd 
                                })}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md cursor-pointer transition-transform hover:scale-105 text-[10px] font-semibold flex items-center justify-center"
                                title={`Smart Cut: Dodaj fragment (${clip.analysis.recommendedStart.toFixed(1)}s - ${clip.analysis.recommendedEnd.toFixed(1)}s)`}
                              >
                                ✂️
                              </button>
                            )}
                            <button 
                              onClick={() => onUpdateClip(clip.id, { isFavorite: !clip.isFavorite })}
                              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white backdrop-blur-sm cursor-pointer transition-colors border border-white/10"
                              title="Oznacz jako ulubione"
                            >
                              <Star className={`w-4 h-4 ${clip.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                            </button>
                          </div>

                          {/* Orientation & Quality Badges */}
                          <div className="absolute top-9 left-2 flex flex-col gap-1 items-start z-10">
                            <div className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm bg-black/70 text-white border border-white/10">
                              {isVertical ? '9:16 PION' : '16:9 POZIOM'}
                            </div>

                            {clip.bestInGroup && (
                              <div className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500 text-black flex items-center gap-0.5 shadow">
                                <Star className="w-2.5 h-2.5 fill-black" />
                                <span>NAJLEPSZE</span>
                              </div>
                            )}

                            {!clip.bestInGroup && clip.duplicateStatus && clip.duplicateStatus !== 'NONE' && (
                              <div className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-950/90 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                                <Copy className="w-2.5 h-2.5" />
                                <span>DUBEL</span>
                              </div>
                            )}

                            {clip.analysis && (
                              <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-md shadow border ${
                                clip.analysis.ratingCategory === 'BEST' ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50' :
                                clip.analysis.ratingCategory === 'GOOD' ? 'bg-blue-950/90 text-blue-300 border-blue-500/50' :
                                clip.analysis.ratingCategory === 'PROBLEM' ? 'bg-rose-950/90 text-rose-300 border-rose-500/50' :
                                'bg-zinc-900/90 text-zinc-300 border-zinc-700/50'
                              }`} title={`Jakość: ${clip.analysis.qualityScore}%, Stabilność: ${clip.analysis.stabilityScore}%`}>
                                {clip.analysis.ratingCategory} {clip.analysis.qualityScore}%
                              </div>
                            )}

                            {clip.isProxyReady && (
                              <div className="text-[8px] font-mono font-semibold px-1 py-0.5 rounded-md bg-cyan-950/90 text-cyan-300 border border-cyan-500/40">
                                ⚡ PROXY
                              </div>
                            )}
                          </div>

                          {/* Duration Badge */}
                          <div className={`absolute bottom-2 right-2 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg backdrop-blur-md shadow-md ${
                            clip.type === 'video' && clip.duration === 10
                              ? 'bg-amber-950/90 text-amber-300 border border-amber-500/50'
                              : 'bg-black/85 text-zinc-100 border border-white/10'
                          }`} title={clip.type === 'video' && clip.duration === 10 ? 'Domyślna długość 10s - weryfikuj' : undefined}>
                            {formatDuration(clip.duration)}
                            {clip.type === 'video' && clip.duration === 10 && ' ⚠️'}
                          </div>

                          {/* Status Badge */}
                          <div className="absolute bottom-2 left-2 text-[9.5px] font-mono font-medium bg-black/85 border border-white/10 px-2 py-0.5 rounded-lg backdrop-blur-md shadow-md">
                            {isMissing ? (
                              <span className="text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> BRAK PLIKU
                              </span>
                            ) : usageNum === 0 ? (
                              <span className="text-zinc-400 flex items-center gap-1 font-semibold">
                                UNUSED
                              </span>
                            ) : usageNum === 1 ? (
                              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> USED (1x)
                              </span>
                            ) : (
                              <span className="text-cyan-400 flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> USED MULTIPLE TIMES ({usageNum}x)
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Info & Metadata Area */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 bg-zinc-900/90">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-zinc-100 truncate group-hover:text-indigo-400 transition-colors" title={clip.name}>
                                {clip.name}
                              </p>
                              {/* Rating Stars 1-5 */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateClip(clip.id, { rating: clip.rating === star ? 0 : star });
                                    }}
                                    className="p-0.5 cursor-pointer hover:scale-115 transition-transform"
                                    title={`Oceń: ${star}/5`}
                                  >
                                    <Star className={`w-2.5 h-2.5 ${star <= (clip.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Technical Metadata Strip */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-zinc-400 font-mono">
                              <span className="text-indigo-400 font-semibold">{resolutionLabel}</span>
                              <span>·</span>
                              <span>{formatSize(clip.size)}</span>
                              {bitrateLabel && (
                                <>
                                  <span>·</span>
                                  <span>{bitrateLabel}</span>
                                </>
                              )}
                              <span>·</span>
                              <span className="truncate max-w-[70px]" title={mimeLabel}>{mimeLabel.split('/')[1] || mimeLabel}</span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 font-mono">
                              <span>{clip.fps || 30} FPS</span>
                              <span>·</span>
                              <span className={clip.hasAudio ? "text-emerald-400/90" : "text-zinc-500"}>
                                {clip.hasAudio ? "Audio: Stereo" : "Audio: Brak"}
                              </span>
                              <span>·</span>
                              <span title="Liczba użyć na osi czasu">
                                {usageNum === 0 ? 'UNUSED' : usageNum === 1 ? 'USED 1x' : `USED ${usageNum}x`}
                              </span>
                            </div>

                            {/* Quick Proxy Button if Video and No Proxy */}
                            {clip.type === 'video' && !clip.isProxyReady && clip.proxyStatus !== 'PROXY_READY' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateProxy(clip, 'medium_720p');
                                }}
                                disabled={clip.proxyStatus === 'PROXY_GENERATING' || clip.proxyStatus === 'PROXY_QUEUED'}
                                className="mt-2 w-full py-1 px-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                                title="Wygeneruj lekkie proxy 720p dla płynnego podglądu"
                              >
                                {clip.proxyStatus === 'PROXY_GENERATING' ? (
                                  <>
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    <span>Tworzenie proxy w tle...</span>
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-2.5 h-2.5 text-cyan-400" />
                                    <span>+ Utwórz Proxy (720p)</span>
                                  </>
                                )}
                              </button>
                            )}

                            {formatDateTimeDisplay(clip.capturedAt || clip.createdAt) && (
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-500 font-mono">
                                <Calendar className="w-3 h-3 text-zinc-400 shrink-0" />
                                <span title={clip.capturedAt ? `Data nagrania: ${formatDateTimeDisplay(clip.capturedAt)}` : `Data dodania: ${formatDateTimeDisplay(clip.createdAt)}`}>
                                  {formatDateTimeDisplay(clip.capturedAt || clip.createdAt)}
                                </span>
                              </div>
                            )}

                            {/* Issue Tags */}
                            {clip.analysis && clip.analysis.issues.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {clip.analysis.issues.map((iss, i) => (
                                  <span key={i} className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-500/30 truncate max-w-full">
                                    {iss}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Missing Relink Trigger */}
                          {isMissing && (
                            <div className="relative mt-1">
                              <label className="w-full bg-rose-950/60 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-[10px] font-mono font-semibold px-2 py-1.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <RotateCw className="w-3 h-3" />
                                Połącz z plikiem z dysku
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="video/*,image/*,audio/*"
                                  onChange={(e) => handleRelinkInput(clip.id, e)}
                                />
                              </label>
                            </div>
                          )}
                          
                          {/* Actions Bar */}
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-800 gap-1.5">
                            <button
                              onClick={() => {
                                onAddToTimeline(clip);
                                if (onEditClip) onEditClip(clip);
                              }}
                              className="px-2.5 py-1 bg-zinc-800 hover:bg-indigo-600 text-zinc-200 hover:text-white font-semibold text-[10px] rounded-lg transition-all uppercase flex items-center gap-1 cursor-pointer font-mono"
                              title="Edytuj i przytnij ujęcie na osi montażu"
                            >
                              EDYTUJ
                            </button>

                            <div className="flex items-center gap-1">
                              {onMoveClipOrder && (
                                <>
                                  <button
                                    onClick={() => onMoveClipOrder(clipIndex, Math.max(0, clipIndex - 1))}
                                    disabled={clipIndex === 0}
                                    className="px-1.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 rounded-lg text-[10px] font-mono cursor-pointer"
                                    title="Przesuń ujęcie wcześniej"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={() => onMoveClipOrder(clipIndex, Math.min(clips.length - 1, clipIndex + 1))}
                                    disabled={clipIndex >= clips.length - 1}
                                    className="px-1.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 rounded-lg text-[10px] font-mono cursor-pointer"
                                    title="Przesuń ujęcie później"
                                  >
                                    ▼
                                  </button>
                                </>
                              )}

                              <button 
                                onClick={() => onRemoveClip(clip.id)}
                                className="text-zinc-500 hover:text-rose-400 transition-colors p-1 cursor-pointer ml-1"
                                title="Usuń materiał z biblioteki"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear All Media Confirmation */}
      <ConfirmModal
        isOpen={isConfirmClearAllOpen}
        title="Wyczyścić całą bibliotekę mediów?"
        message="Czy na pewno chcesz usunąć WSZYSTKIE stare materiały i wyczyścić bibliotekę projektu? Pliki zostaną usunięte z lokalnej pamięci podręcznej i chmury, przygotowując czysty stół montażowy."
        confirmText="Usuń wszystkie pliki"
        cancelText="Anuluj"
        type="danger"
        onConfirm={executeClearAllMedia}
        onCancel={() => setIsConfirmClearAllOpen(false)}
      />

      {/* Batch Remove Selected Clips Confirmation */}
      <ConfirmModal
        isOpen={isConfirmBatchDeleteOpen}
        title={`Usunąć ${selectedIds.size} zaznaczonych materiałów?`}
        message="Wybrane materiały zostaną bezpowrotnie usunięte z biblioteki bieżącego projektu."
        confirmText={`Usuń (${selectedIds.size})`}
        cancelText="Anuluj"
        type="danger"
        onConfirm={executeBatchRemove}
        onCancel={() => setIsConfirmBatchDeleteOpen(false)}
      />

      {/* Media Quick Preview Modal */}
      {previewingClip && (
        <div 
          onClick={() => setPreviewingClip(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl max-w-3xl w-full flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="truncate mr-4">
                <h3 className="text-sm font-semibold text-white truncate">{previewingClip.name}</h3>
                <p className="text-xs text-zinc-400 font-mono">
                  {previewingClip.width}×{previewingClip.height} · {previewingClip.duration.toFixed(1)}s · {previewingClip.fps || 30} FPS · {formatSize(previewingClip.size)}
                </p>
              </div>
              <button
                onClick={() => setPreviewingClip(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src={previewingClip.objectUrl || (previewingClip.file ? URL.createObjectURL(previewingClip.file) : '')}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="p-4 bg-zinc-900 flex items-center justify-between border-t border-zinc-800">
              <span className="text-xs font-mono text-zinc-400">
                {previewingClip.hasAudio ? 'Dźwięk: Stereo' : 'Dźwięk: Brak ścieżki'}
              </span>
              <button
                onClick={() => {
                  onAddToTimeline(previewingClip);
                  setPreviewingClip(null);
                  if (onEditClip) onEditClip(previewingClip);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-600/30"
              >
                Edytuj na osi montażu
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
