import { useCallback, useEffect, useState } from 'react';

export interface LoadState<T> {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
}

/** Runs `load` on mount and whenever it changes. Ignores results that arrive after unmount or a newer call. */
export function useLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    load().then((d) => {
      if (!current) return;
      setData(d);
      setError('');
      setLoading(false);
    }).catch((e: unknown) => {
      if (!current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLoading(false);
    });
    return () => { current = false; };
  }, [load, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
