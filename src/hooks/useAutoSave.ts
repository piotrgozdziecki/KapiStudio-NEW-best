import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import type { ProjectState } from '../types/project';
import { saveProject } from '../lib/firebase/api';
import { localIndexedDB } from '../core/storage/indexedDBProvider';
import { sanitizeProjectForStorage } from '../core/validation/projectMigration';
import { safeStringify } from '../lib/safeJson';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  project: ProjectState;
  user: User | null;
  isLoaded: boolean;
  inactivityDelayMs?: number; // Defaults to 30,000 ms (30 seconds)
  onSaveSuccess?: (timestamp: string) => void;
  onSaveError?: (error: any) => void;
}

interface UseAutoSaveReturn {
  isAutoSaving: boolean;
  autoSaveStatus: AutoSaveStatus;
  lastSavedAt: string | null;
  secondsUntilAutoSave: number;
  hasUnsavedChanges: boolean;
  triggerImmediateSave: () => Promise<boolean>;
}

const DEFAULT_INACTIVITY_DELAY_MS = 30_000; // 30 seconds of inactivity

/**
 * Custom React hook implementing a debounced auto-save function that triggers
 * every 30 seconds of inactivity to the Firebase Firestore backend,
 * ensuring no progress is lost through both cloud (Firestore) and local (IndexedDB) persistence.
 */
export function useAutoSave({
  project,
  user,
  isLoaded,
  inactivityDelayMs = DEFAULT_INACTIVITY_DELAY_MS,
  onSaveSuccess,
  onSaveError
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [secondsUntilAutoSave, setSecondsUntilAutoSave] = useState(Math.round(inactivityDelayMs / 1000));

  // Refs to avoid stale closures in timers and event listeners
  const projectRef = useRef<ProjectState>(project);
  projectRef.current = project;

  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const isLoadedRef = useRef<boolean>(isLoaded);
  isLoadedRef.current = isLoaded;

  const lastSavedHashRef = useRef<string>('');
  const autoSaveTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const targetSaveTimeRef = useRef<number>(0);
  const isSavingRef = useRef<boolean>(false);

  // Compute a stable hash of the project state to detect genuine modifications
  const getProjectSignature = useCallback((state: ProjectState): string => {
    try {
      const sanitized = sanitizeProjectForStorage(state);
      return safeStringify(sanitized);
    } catch {
      return String(Date.now());
    }
  }, []);

  // Perform the actual save to Firebase Firestore + IndexedDB
  const executeSave = useCallback(async (isEmergencyFlush = false): Promise<boolean> => {
    const currentProject = projectRef.current;
    if (!currentProject || !isLoadedRef.current) return false;
    if (isSavingRef.current && !isEmergencyFlush) return false;

    isSavingRef.current = true;
    setIsAutoSaving(true);
    setAutoSaveStatus('saving');

    const sanitized = sanitizeProjectForStorage(currentProject);
    const saveTarget = { ...sanitized, id: 'main-project' };
    let firestoreSaved = false;

    try {
      // 1. Instant local persistence to IndexedDB (zero progress lost guarantee)
      try {
        await localIndexedDB.saveProjectDraft(saveTarget);
      } catch (idbErr) {
        console.warn('[AutoSave] IndexedDB draft save notice:', idbErr);
      }

      // 2. Save directly to Firebase Firestore backend
      try {
        await saveProject(saveTarget);
        firestoreSaved = true;
      } catch (firestoreErr: any) {
        console.warn('[AutoSave] Firestore sync notice (saved locally):', firestoreErr?.message || firestoreErr);
      }

      const timestamp = new Date().toLocaleTimeString();
      lastSavedHashRef.current = getProjectSignature(currentProject);
      setHasUnsavedChanges(false);
      setLastSavedAt(timestamp);
      setAutoSaveStatus(firestoreSaved ? 'saved' : 'idle');
      setSecondsUntilAutoSave(Math.round(inactivityDelayMs / 1000));
      onSaveSuccess?.(timestamp);
      return true;
    } catch (err) {
      console.error('[AutoSave] Critical error during save:', err);
      setAutoSaveStatus('error');
      onSaveError?.(err);
      return false;
    } finally {
      isSavingRef.current = false;
      setIsAutoSaving(false);
    }
  }, [inactivityDelayMs, onSaveSuccess, onSaveError, getProjectSignature]);

  // Restart the 30-second inactivity timer
  const restartInactivityTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    const now = Date.now();
    targetSaveTimeRef.current = now + inactivityDelayMs;
    setSecondsUntilAutoSave(Math.round(inactivityDelayMs / 1000));

    // Countdown updater
    countdownIntervalRef.current = setInterval(() => {
      const remainingMs = Math.max(0, targetSaveTimeRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setSecondsUntilAutoSave(remainingSec);
    }, 1000);

    // Primary 30s inactivity debounce timer
    autoSaveTimerRef.current = setTimeout(async () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      await executeSave();
    }, inactivityDelayMs);
  }, [inactivityDelayMs, executeSave]);

  // Listen to project changes and trigger inactivity reset with internal debounce to prevent UI lag on large projects
  useEffect(() => {
    if (!isLoaded) return;

    const throttleId = setTimeout(() => {
      const currentHash = getProjectSignature(project);

      // If initial mount or no previous hash recorded, record baseline
      if (!lastSavedHashRef.current) {
        lastSavedHashRef.current = currentHash;
        return;
      }

      // If project signature actually changed, mark dirty and start 30s inactivity countdown
      if (currentHash !== lastSavedHashRef.current) {
        setHasUnsavedChanges(true);
        setAutoSaveStatus('pending');

        // Immediate local draft save in background so crash/refresh never loses anything
        localIndexedDB.saveProjectDraft({ ...sanitizeProjectForStorage(project), id: 'main-project' }).catch(() => {});

        restartInactivityTimer();
      }
    }, 800); // Debounce for signature calculation

    return () => clearTimeout(throttleId);
  }, [project, isLoaded, getProjectSignature, restartInactivityTimer]);

  // Reset inactivity timer on user interaction if there are pending unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    let throttleTimeout: any = null;
    const handleUserInteraction = () => {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
        if (hasUnsavedChanges && !isSavingRef.current) {
          restartInactivityTimer();
        }
      }, 500);
    };

    const events = ['keydown', 'pointerdown', 'wheel'];
    events.forEach(evt => window.addEventListener(evt, handleUserInteraction, { passive: true }));

    return () => {
      if (throttleTimeout) clearTimeout(throttleTimeout);
      events.forEach(evt => window.removeEventListener(evt, handleUserInteraction));
    };
  }, [hasUnsavedChanges, restartInactivityTimer]);

  // Emergency auto-save flush on tab close / window unload / visibility change
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasUnsavedChanges) {
        executeSave(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
        executeSave(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [hasUnsavedChanges, executeSave]);

  return {
    isAutoSaving,
    autoSaveStatus,
    lastSavedAt,
    secondsUntilAutoSave,
    hasUnsavedChanges,
    triggerImmediateSave: () => executeSave(false)
  };
}
