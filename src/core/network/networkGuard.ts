/**
 * Kapi-Studio - Network Guardrails & Resilient API Client
 * Provides 15s timeout, Exponential Backoff retries, and offline detection for
 * Gemini API, Firebase, and Google Drive API requests.
 */

export interface NetworkRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function fetchWithBackoffAndTimeout<T>(
  requestFn: (signal: AbortSignal) => Promise<T>,
  options: NetworkRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = 15000,
    maxRetries = 3,
    initialDelayMs = 500,
    onRetry
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Brak połączenia z siecią. Przełączono w tryb edycji offline.');
      }

      const result = await requestFn(controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (err: any) {
      clearTimeout(timeoutId);
      attempt++;

      const isAbort = err?.name === 'AbortError';
      const errorMessage = isAbort 
        ? `Przekroczono limit czasu zapytania (${timeoutMs / 1000}s).` 
        : (err?.message || 'Błąd sieciowy.');

      const error = new Error(errorMessage);

      if (attempt > maxRetries) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt, error);
      }

      // Exponential Backoff with jitter
      const jitter = Math.random() * 200;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      delay *= 2;
    }
  }
}
