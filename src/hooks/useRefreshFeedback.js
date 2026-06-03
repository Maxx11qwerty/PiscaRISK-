import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Manages refresh UI state: loading → success | error (auto-clears after a few seconds).
 */
export function useRefreshFeedback(autoClearMs = 4500) {
  const [status, setStatus] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const scheduleClear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStatus(null);
      timerRef.current = null;
    }, autoClearMs);
  }, [autoClearMs]);

  const runRefresh = useCallback(async (fn) => {
    setStatus('loading');
    try {
      const result = await fn();
      setStatus('success');
      scheduleClear();
      return result;
    } catch (err) {
      setStatus('error');
      scheduleClear();
      throw err;
    }
  }, [scheduleClear]);

  const clearStatus = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus(null);
  }, []);

  return {
    status,
    runRefresh,
    isRefreshing: status === 'loading',
    clearStatus,
  };
}
