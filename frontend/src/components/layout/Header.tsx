'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { logout } from '@/lib/api/auth';
import { LogOut, Upload } from 'lucide-react';

export function Header() {
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // still clear local state
    }
    logoutStore();
    router.push('/auth/login');
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Verarta
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard/upload"
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Link>

          {user && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {user.display_name}
            </span>
          )}

          <button
            onClick={handleLogout}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}
