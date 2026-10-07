import { useState, useEffect } from 'react';
import { syncPendingNotesToFirestore } from '../lib/offlineSync';

export interface OnlineStatusState {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineChange: number;
}

export function useOnlineStatus(): OnlineStatusState {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  });

  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [lastOnlineChange, setLastOnlineChange] = useState<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = async () => {
      setIsOnline(true);
      setLastOnlineChange(Date.now());
      // Automatically flush any pending offline notes/sync queue to cloud
      try {
        await syncPendingNotesToFirestore();
      } catch (err) {
        console.warn('[OnlineSync] Auto-flush failed upon reconnect:', err);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setLastOnlineChange(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    wasOffline,
    lastOnlineChange
  };
}
