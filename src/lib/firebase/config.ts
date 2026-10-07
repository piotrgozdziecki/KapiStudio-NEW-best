import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import defaultAppletConfig from '../../../firebase-applet-config.json';

// Support both Vite (import.meta.env) and Next.js / Node (process.env) environment variables with fallback
const getEnvVar = (viteKey: string, nextKey: string, fallback: string = ''): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
    return String(import.meta.env[viteKey]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[nextKey]) {
    return String(process.env[nextKey]);
  }
  return fallback;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY', (defaultAppletConfig as any).apiKey || ''),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', (defaultAppletConfig as any).authDomain || ''),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', (defaultAppletConfig as any).projectId || ''),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', (defaultAppletConfig as any).storageBucket || ''),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', (defaultAppletConfig as any).messagingSenderId || ''),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID', (defaultAppletConfig as any).appId || ''),
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore safely with fallback for multi-tab/iframe Web Lock lease failures
let firestoreInstance: Firestore;
const databaseId = (defaultAppletConfig as any).firestoreDatabaseId;

function initFirestoreWithFallback(): Firestore {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  
  const optionsList = [
    // 1. Try persistentMultipleTabManager if not inside constrained iframe
    ...(!isIframe ? [{
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }] : []),
    // 2. Try persistentSingleTabManager
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({})
      })
    },
    // 3. Fallback to memoryLocalCache
    {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    }
  ];

  for (const opts of optionsList) {
    try {
      return databaseId ? initializeFirestore(app, opts, databaseId) : initializeFirestore(app, opts);
    } catch {
      // Continue to next options if already initialized or lease lock failed
    }
  }

  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

firestoreInstance = initFirestoreWithFallback();

export const db = firestoreInstance;
export const auth: Auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn('[Firebase Auth] Failed to set persistence:', err);
  });
}

export const storage: FirebaseStorage = getStorage(app);

// Online/Offline Connectivity tracker
export let isFirestoreConnected = typeof navigator !== 'undefined' ? navigator.onLine : true;
const connectionListeners: ((status: boolean) => void)[] = [];

export function onFirestoreConnectionChange(callback: (status: boolean) => void) {
  connectionListeners.push(callback);
  return () => {
    const index = connectionListeners.indexOf(callback);
    if (index !== -1) connectionListeners.splice(index, 1);
  };
}

function updateConnectionStatus(status: boolean) {
  if (isFirestoreConnected === status) return;
  isFirestoreConnected = status;
  connectionListeners.forEach(cb => cb(status));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));

  async function testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      updateConnectionStatus(true);
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      const isOffline =
        errMsg.includes('the client is offline') ||
        errMsg.includes('unavailable') ||
        error?.code === 'unavailable' ||
        error?.code === 'failed-precondition';

      if (isOffline) {
        updateConnectionStatus(false);
      }
    }
  }
  testConnection();
}
