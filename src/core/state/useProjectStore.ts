/**
 * Kapi-Studio - Zustand Immutable Project & Timeline Store
 * Separates high-frequency playback position (currentTimeMicroseconds) from structural
 * state (tracks, timelineItems, mediaLibrary, settings) to guarantee 60/120 FPS NLE performance.
 * Includes a 50-step structural Undo/Redo history stack and 500ms debounced Firestore persistence.
 */

import { create } from 'zustand';
import type { ProjectState, TimelineItem, MediaClip, AudioTrackItem, TextLayer, ProjectSettings } from '../../types/project';
import { db } from '../../lib/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

const MAX_HISTORY_STEPS = 50;
const FIRESTORE_DEBOUNCE_MS = 500;

export interface HighFrequencyState {
  currentTimeMicroseconds: number;
  isPlaying: boolean;
  hoverTimeMicroseconds: number | null;
}

export interface StructuralState {
  project: ProjectState;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ProjectStoreActions {
  // High-frequency updates (Direct rAF updates without React re-render of heavy components)
  setPlaybackTimeMicroseconds: (ptsMicroseconds: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setHoverTimeMicroseconds: (ptsMicroseconds: number | null) => void;

  // Structural State updates (Pushes history snapshot)
  setProject: (newProject: ProjectState, pushHistory?: boolean) => void;
  updateTimelineItems: (items: TimelineItem[]) => void;
  addMediaClip: (clip: MediaClip) => void;
  removeMediaClip: (id: string) => void;
  updateAudioTracks: (tracks: AudioTrackItem[]) => void;
  updateTextLayers: (layers: TextLayer[]) => void;
  updateSettings: (settings: Partial<ProjectSettings>) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
}

export type ProjectStore = HighFrequencyState & StructuralState & ProjectStoreActions;

// Helper to strip non-structural parameters from project snapshot for history
function createStructuralSnapshot(project: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(project));
}

let saveTimeoutId: any = null;

async function syncToFirestoreDebounced(project: ProjectState, setSaving: (s: boolean) => void) {
  if (!project.id || project.id === 'default') return;

  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  setSaving(true);

  saveTimeoutId = setTimeout(async () => {
    try {
      const docRef = doc(db, 'projects', project.id);
      await setDoc(docRef, {
        ...project,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('[Firestore Sync] Debounced background save warning:', err);
    } finally {
      setSaving(false);
    }
  }, FIRESTORE_DEBOUNCE_MS);
}

const historyUndoStack: ProjectState[] = [];
const historyRedoStack: ProjectState[] = [];

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // High-frequency initial state
  currentTimeMicroseconds: 0,
  isPlaying: false,
  hoverTimeMicroseconds: null,

  // Structural initial state
  project: {
    id: 'default',
    name: 'NOWY PROJEKT 4K',
    projectSchemaVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mediaLibrary: [],
    timelineItems: [],
    tracks: [],
    audioTracks: [],
    textLayers: [],
    markers: [],
    chapters: [],
    versions: [],
    settings: {
      resolution: '1080p',
      targetResolution: '1080p',
      fps: 30,
      targetFps: 30,
      aspectRatio: '16:9',
      fitMode: 'fit',
      colorGrade: 'golden_hour',
      audioBalance: {
        musicVolume: 0.85,
        clipVolume: 1.0
      }
    }
  },
  isSaving: false,
  canUndo: false,
  canRedo: false,

  // High-frequency actions
  setPlaybackTimeMicroseconds: (ptsMicroseconds) => set({ currentTimeMicroseconds: ptsMicroseconds }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setHoverTimeMicroseconds: (ptsMicroseconds) => set({ hoverTimeMicroseconds: ptsMicroseconds }),

  // Structural actions with optimistic updates and 500ms debounced Firestore write
  setProject: (newProject, pushHistory = true) => {
    const currentProject = get().project;

    if (pushHistory && currentProject) {
      historyUndoStack.push(createStructuralSnapshot(currentProject));
      if (historyUndoStack.length > MAX_HISTORY_STEPS) {
        historyUndoStack.shift();
      }
      historyRedoStack.length = 0; // Clear redo stack on new action
    }

    set({
      project: newProject,
      canUndo: historyUndoStack.length > 0,
      canRedo: historyRedoStack.length > 0
    });

    syncToFirestoreDebounced(newProject, (saving) => set({ isSaving: saving }));
  },

  updateTimelineItems: (items) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      timelineItems: items,
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  addMediaClip: (clip) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      mediaLibrary: [...(current.mediaLibrary || []), clip],
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  removeMediaClip: (id) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      mediaLibrary: (current.mediaLibrary || []).filter(c => c.id !== id),
      timelineItems: (current.timelineItems || []).filter(i => i.clipId !== id),
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  updateAudioTracks: (tracks) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      audioTracks: tracks,
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  updateTextLayers: (layers) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      textLayers: layers,
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  updateSettings: (partialSettings) => {
    const current = get().project;
    const updated: ProjectState = {
      ...current,
      settings: { ...current.settings, ...partialSettings },
      updatedAt: new Date().toISOString()
    };
    get().setProject(updated, true);
  },

  // Undo
  undo: () => {
    if (historyUndoStack.length === 0) return;
    const currentProject = get().project;
    historyRedoStack.push(createStructuralSnapshot(currentProject));

    const previousSnapshot = historyUndoStack.pop()!;
    set({
      project: previousSnapshot,
      canUndo: historyUndoStack.length > 0,
      canRedo: historyRedoStack.length > 0
    });

    syncToFirestoreDebounced(previousSnapshot, (saving) => set({ isSaving: saving }));
  },

  // Redo
  redo: () => {
    if (historyRedoStack.length === 0) return;
    const currentProject = get().project;
    historyUndoStack.push(createStructuralSnapshot(currentProject));

    const nextSnapshot = historyRedoStack.pop()!;
    set({
      project: nextSnapshot,
      canUndo: historyUndoStack.length > 0,
      canRedo: historyRedoStack.length > 0
    });

    syncToFirestoreDebounced(nextSnapshot, (saving) => set({ isSaving: saving }));
  }
}));
