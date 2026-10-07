import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthProvider } from './lib/firebase/AuthContext';
import { registerSW } from 'virtual:pwa-register';
import { patchGlobalJsonStringify } from './lib/safeJson';
import './index.css';

// Apply global JSON circular reference protection
patchGlobalJsonStringify();

// Silence benign Vite websocket connection notices in container iframe preview
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const text = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
    if (text.includes('[vite]') && (text.includes('websocket') || text.includes('failed to connect') || text.includes('WebSocket'))) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Automatically register service worker and handle updates
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] Nowa wersja aplikacji dostępna.');
      },
      onOfflineReady() {
        console.log('[PWA] Aplikacja jest gotowa do pracy w trybie offline.');
      },
    });
  } catch (err) {
    console.warn('Nie udało się zarejestrować Service Workera:', err);
  }
}

// Global safe-guard against cross-origin script error masking, circular error serialization, and unhandled network/abort errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg === 'Script error.' || 
      !event.filename || 
      msg.includes('circular structure') || 
      msg.includes('Aborted due to close') ||
      msg.includes('close()') ||
      (event.target && (event.target as any).tagName === 'VIDEO')
    ) {
      console.warn('[System Safe-Guard] Zignorowano zewnętrzny wyjątek / błąd elementu multimedialnego:', msg || 'Media/Script Error');
      event.preventDefault?.();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || '');
    const isAbort = 
      reason?.name === 'AbortError' || 
      msg.includes('Aborted due to close') || 
      msg.includes('close()') ||
      msg.toLowerCase().includes('aborted');

    if (
      isAbort ||
      msg.includes('Script error') || 
      msg.includes('the client is offline') || 
      msg.includes('unavailable') || 
      msg.includes('Failed to fetch') ||
      msg.includes('circular structure')
    ) {
      console.warn('[System Safe-Guard] Przechwycono nieszkodliwy asynchroniczny błąd / przerwanie:', msg || 'AbortError');
      event.preventDefault?.();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
