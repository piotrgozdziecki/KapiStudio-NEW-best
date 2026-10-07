import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from './config';
import { handleFirestoreError, OperationType } from './errors';
import type { ProjectState, MediaClip } from '../../types/project';
import { sanitizeProjectForStorage, migrateProjectToLatest } from '../../core/validation/projectMigration';
import { safeClone } from '../safeJson';

// Helper function to safely serialize state to clean plain object
const serializeState = (state: ProjectState) => {
  const clean = sanitizeProjectForStorage(state);
  return safeClone(clean);
};

export interface FirestoreUserData {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  lastActiveAt: string;
  updatedAt: string;
}

export interface FirestoreAssetData {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  duration: number;
  width: number;
  height: number;
  size: number;
  mimeType?: string;
  driveFileId?: string;
  category?: string;
  isFavorite?: boolean;
  tags?: string[];
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensures user document exists in 'users' collection
 */
export async function syncUserProfile(user: any): Promise<void> {
  if (!user?.uid) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const userData: FirestoreUserData = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userRef, userData, { merge: true });
  } catch (err) {
    console.warn('[Firestore] Note on syncing user profile:', err);
  }
}

/**
 * Saves project to Firestore in structured collections:
 * 1. 'users/{userId}' - Profile tracking
 * 2. 'users/{userId}/projects/{projectId}' & 'projects/{projectId}' - Full project document
 * 3. 'users/{userId}/projects/{projectId}/assets' & 'assets' - Discrete asset records
 */
export async function saveProject(project: ProjectState): Promise<void> {
  let user = auth.currentUser;
  if (!user) {
    try {
      const { signInAnonymously } = await import('firebase/auth');
      const cred = await signInAnonymously(auth);
      user = cred.user;
    } catch {
      // Anonymous auth not enabled or failed
    }
  }

  if (!user) {
    throw new Error('Musisz być zalogowany, aby zapisać projekt w chmurze Firestore.');
  }

  const userId = user.uid;
  const projectId = project.id || 'main-project';
  const userProjectPath = `users/${userId}/projects/${projectId}`;
  const rootProjectPath = `projects/${projectId}`;
  const now = new Date().toISOString();

  try {
    // 1. Sync User profile
    await syncUserProfile(user);

    // 2. Prepare serialized project payload
    const projectData = {
      id: projectId,
      title: project.title || project.name || 'Nowy Projekt Montażowy',
      userId,
      state: serializeState(project),
      totalClips: project.mediaLibrary?.length || 0,
      timelineItemsCount: (project.timelineItems || (project as any).timeline)?.length || 0,
      updatedAt: now,
      createdAt: (project as any).createdAt || now
    };

    // Save in user's subcollection
    await setDoc(doc(db, userProjectPath), projectData, { merge: true });

    // Also mirror to root 'projects' collection for global lookup and index
    try {
      await setDoc(doc(db, rootProjectPath), projectData, { merge: true });
    } catch (rootErr) {
      console.warn('[Firestore] Root projects mirror notice:', rootErr);
    }

    // 3. Sync media library items to 'assets' collection
    if (Array.isArray(project.mediaLibrary) && project.mediaLibrary.length > 0) {
      // Sync up to 25 primary assets in background batch
      const assetBatch = writeBatch(db);
      const topAssets = project.mediaLibrary.slice(0, 25);
      
      for (const clip of topAssets) {
        if (!clip.id) continue;
        const assetRef = doc(db, `users/${userId}/projects/${projectId}/assets`, clip.id);
        const assetData: FirestoreAssetData = {
          id: clip.id,
          projectId,
          userId,
          name: clip.name || 'Ujęcie wideo',
          type: clip.type || 'video',
          duration: clip.duration || 0,
          width: clip.width || 1920,
          height: clip.height || 1080,
          size: clip.size || 0,
          mimeType: clip.mimeType || 'video/mp4',
          driveFileId: clip.driveFileId,
          category: clip.category || 'unassigned',
          isFavorite: Boolean(clip.isFavorite),
          tags: clip.tags || [],
          thumbnailUrl: clip.thumbnailUrl?.startsWith('data:') ? undefined : clip.thumbnailUrl,
          createdAt: clip.createdAt || now,
          updatedAt: now
        };
        assetBatch.set(assetRef, assetData, { merge: true });
      }

      await assetBatch.commit().catch(err => {
        console.warn('[Firestore] Asset batch commit notice:', err);
      });
    }

  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.WRITE, userProjectPath);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można zapisać projektu w chmurze (${userProjectPath}):`, errMsg);
      throw error;
    }
  }
}

/**
 * Loads project from Firestore
 */
export async function loadProject(projectId: string = 'main-project'): Promise<ProjectState | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const userProjectPath = `users/${user.uid}/projects/${projectId}`;
  try {
    const docSnap = await getDoc(doc(db, userProjectPath));
    if (docSnap.exists()) {
      return migrateProjectToLatest(docSnap.data().state);
    }

    // Fallback: check root projects collection
    const rootSnap = await getDoc(doc(db, 'projects', projectId));
    if (rootSnap.exists() && rootSnap.data().state) {
      return migrateProjectToLatest(rootSnap.data().state);
    }

    return null;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.GET, userProjectPath);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można pobrać projektu z chmury (${userProjectPath}):`, errMsg);
      return null;
    }
  }
}

/**
 * Lists all projects for the authenticated user
 */
export async function listUserProjects(): Promise<Array<{ id: string; title: string; updatedAt: string; totalClips: number }>> {
  const user = auth.currentUser;
  if (!user) return [];

  try {
    const projectsCol = collection(db, `users/${user.uid}/projects`);
    const q = query(projectsCol, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'Projekt bez tytułu',
        updatedAt: data.updatedAt || new Date().toISOString(),
        totalClips: data.totalClips || 0
      };
    });
  } catch (err) {
    console.warn('[Firestore] Failed to list user projects:', err);
    return [];
  }
}

/**
 * Deletes project from Firestore
 */
export async function deleteProjectFromCloud(projectId: string = 'main-project'): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const path = `users/${user.uid}/projects/${projectId}`;
  try {
    await deleteDoc(doc(db, path));
    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch {}
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isPermissionError = error?.code === 'permission-denied' || errMsg.toLowerCase().includes('insufficient permissions');
    if (isPermissionError) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      console.warn(`[Firestore Offline/Network] Nie można usunąć projektu z chmury (${path}):`, errMsg);
    }
  }
}

/**
 * Saves a single asset document
 */
export async function saveAssetToFirestore(projectId: string, clip: MediaClip): Promise<void> {
  const user = auth.currentUser;
  if (!user || !clip.id) return;

  const assetRef = doc(db, `users/${user.uid}/projects/${projectId}/assets`, clip.id);
  const rootAssetRef = doc(db, 'assets', clip.id);
  const now = new Date().toISOString();

  const assetData: FirestoreAssetData = {
    id: clip.id,
    projectId,
    userId: user.uid,
    name: clip.name,
    type: clip.type,
    duration: clip.duration,
    width: clip.width,
    height: clip.height,
    size: clip.size,
    mimeType: clip.mimeType,
    driveFileId: clip.driveFileId,
    category: clip.category,
    isFavorite: clip.isFavorite,
    tags: clip.tags,
    createdAt: clip.createdAt || now,
    updatedAt: now
  };

  try {
    await setDoc(assetRef, assetData, { merge: true });
    await setDoc(rootAssetRef, assetData, { merge: true }).catch(() => {});
  } catch (err) {
    console.warn('[Firestore] Asset save notice:', err);
  }
}

export async function saveStoryToFirestore(userId: string, story: any): Promise<void> {
  const path = `users/${userId}/stories/${story.id}`;
  try {
    const data = {
      ...story,
      userId,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, path), data, { merge: true });
  } catch (error: any) {
    console.warn(`[Firestore Offline] Nie można zapisać scenariusza:`, error?.message || error);
  }
}
