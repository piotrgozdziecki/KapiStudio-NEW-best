import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingIn: boolean;
  accessToken: string | null;
  hasDriveAccess: boolean;
  login: (withDriveScopes?: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  clearDriveAccess: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLoggingIn: false,
  accessToken: null,
  hasDriveAccess: false,
  login: async () => null,
  logout: async () => {},
  clearDriveAccess: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
  });

  const activeLoginPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('gdrive_access_token');
        }
      }
    });
    return unsubscribe;
  }, []);

  const login = async (withDriveScopes: boolean = false): Promise<string | null> => {
    // If a login popup is already active, return the existing in-flight promise to prevent auth/cancelled-popup-request
    if (activeLoginPromiseRef.current) {
      return activeLoginPromiseRef.current;
    }

    setIsLoggingIn(true);

    const loginPromise = (async () => {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account'
        });

        // Always perform standard high-reliability Firebase Google Auth
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken || null;

        if (token) {
          setAccessToken(token);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('gdrive_access_token', token);
            localStorage.setItem('gdrive_access_token', token);
          }
        }

        const userName = result.user.displayName || result.user.email || 'Użytkownik';
        if (typeof window !== 'undefined' && (window as any).showStudioToast) {
          (window as any).showStudioToast(`Zalogowano pomyślnie jako ${userName}! Synchronizacja w chmurze Firestore jest aktywna.`, 'success');
        }

        return token;
      } catch (err: any) {
        const code = err?.code || '';
        const msg = err?.message || String(err);
        const isCancelled =
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/user-cancelled';

        if (isCancelled) {
          console.info('[Auth] Logowanie zostało anulowane przez użytkownika.');
          return null;
        }

        if (code === 'auth/popup-blocked') {
          console.warn('[Auth] Okno logowania zablokowane przez przeglądarkę.');
          if (typeof window !== 'undefined' && (window as any).showStudioToast) {
            (window as any).showStudioToast('Przeglądarka zablokowała okno logowania Google. Zezwól na wyskakujące okna (pop-up) i spróbuj ponownie.', 'warning');
          }
          return null;
        }

        console.error('[Auth] Błąd logowania Google:', err?.message || err);
        if (typeof window !== 'undefined' && (window as any).showStudioToast) {
          (window as any).showStudioToast(`Błąd logowania Google: ${err?.message || 'Spróbuj ponownie'}`, 'error');
        }
        return null;
      } finally {
        activeLoginPromiseRef.current = null;
        setIsLoggingIn(false);
      }
    })();

    activeLoginPromiseRef.current = loginPromise;
    return loginPromise;
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('gdrive_access_token');
        if ((window as any).showStudioToast) {
          (window as any).showStudioToast('Wylogowano z konta Google.', 'info');
        }
      }
    } catch (err) {
      console.warn('[Auth] Błąd podczas wylogowywania:', err);
    }
  };

  const clearDriveAccess = () => {
    setAccessToken(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('gdrive_access_token');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isLoggingIn,
      accessToken, 
      hasDriveAccess: !!accessToken,
      login, 
      logout,
      clearDriveAccess
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
