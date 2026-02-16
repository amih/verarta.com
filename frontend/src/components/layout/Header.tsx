'use client';

import Image from 'next/image';
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
        <Link href="/dashboard">
          <Image
            src="/logo/logo-dark.svg"
            alt="Verarta"
            width={140}
            height={30}
            className="block dark:hidden"
            priority
          />
          <Image
            src="/logo/logo-light.svg"
            alt="Verarta"
            width={140}
            height={30}
            className="hidden dark:block"
            priority
          />
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
            <span className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  {user.display_name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                </span>
              )}
              {user.display_name}
              <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                ({user.blockchain_account})
              </span>
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
