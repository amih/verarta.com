'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

const VERSION_KEY = 'verarta-app-version';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function useVersionCheck() {
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (!version || cancelled) return;
        const stored = localStorage.getItem(VERSION_KEY);
        if (stored && stored !== version) {
          localStorage.setItem(VERSION_KEY, version);
          window.location.reload();
          return;
        }
        localStorage.setItem(VERSION_KEY, version);
      } catch {}
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  useVersionCheck();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
