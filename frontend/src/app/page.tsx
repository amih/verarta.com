'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PublicHeader } from '@/components/layout/PublicHeader';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />
      <div className="flex flex-col items-center justify-center px-4" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Verarta
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            Secure art registry powered by blockchain.
            Upload, encrypt, and protect your creative work.
          </p>
          <div className="mt-8">
            <Link
              href="/auth/login"
              className="inline-block rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
