'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { logout } from '@/lib/api/auth';
import { getAccount, queryTable } from '@/lib/api/chain';
import { Menu, X, LogOut, Upload, ShieldCheck, Home, Info, FileText, LayoutDashboard, Loader2, Download } from 'lucide-react';
import { InstallButton } from './InstallPrompt';

interface QuotaRow {
  account: string;
  tier: number;
  daily_files_used: number;
  daily_size_used: number;
  weekly_files_used: number;
  weekly_size_used: number;
  daily_file_limit: number;
  daily_size_limit: number;
  weekly_file_limit: number;
  weekly_size_limit: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function MiniBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
      <div
        className={`h-full rounded-full ${
          pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout: logoutStore } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const { data: accountData } = useQuery({
    queryKey: ['chain-account', user?.blockchain_account],
    queryFn: () => getAccount(user!.blockchain_account),
    enabled: !!user?.blockchain_account && userOpen,
    refetchInterval: 30000,
  });

  const { data: quota } = useQuery({
    queryKey: ['quota', user?.blockchain_account],
    queryFn: async () => {
      if (!user) return null;
      const result = await queryTable<QuotaRow>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'usagequotas',
        lower_bound: user.blockchain_account,
        upper_bound: user.blockchain_account,
        limit: 1,
      });
      return result.rows[0] || null;
    },
    enabled: !!user && userOpen,
    refetchInterval: 30000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setUserOpen(false);
  }, [pathname]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // still clear local state
    }
    logoutStore();
    router.push('/auth/login');
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/upload', label: 'Upload Artwork', icon: Upload },
    ...(user?.is_admin ? [{ href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck }] : []),
    { href: '/about', label: 'About', icon: Info },
    { href: '/disclaimer', label: 'Disclaimer', icon: FileText },
    { href: '/', label: 'Home', icon: Home },
  ];

  const account = accountData?.account;

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Left: hamburger menu */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={navRef}>
            <button
              onClick={() => setNavOpen(!navOpen)}
              className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Navigation menu"
            >
              {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {navOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                          : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
                <InstallButton />
              </div>
            )}
          </div>

          <Link href="/dashboard">
            <Image
              src="/logo/logo-dark.svg"
              alt="Verarta"
              width={120}
              height={26}
              className="block dark:hidden"
              priority
            />
            <Image
              src="/logo/logo-light.svg"
              alt="Verarta"
              width={120}
              height={26}
              className="hidden dark:block"
              priority
            />
          </Link>
        </div>

        {/* Right: user menu */}
        {user && (
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen(!userOpen)}
              className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="User menu"
            >
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
            </button>

            {userOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {/* User details */}
                <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {user.display_name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {user.display_name}
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Blockchain account */}
                <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Blockchain Account
                  </p>
                  <p className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {user.blockchain_account}
                  </p>
                  {account && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>RAM</span>
                        <span>{formatBytes(account.ram_usage)} / {formatBytes(account.ram_quota)}</span>
                      </div>
                      <MiniBar used={account.ram_usage} total={account.ram_quota} />
                    </div>
                  )}
                </div>

                {/* Usage quota */}
                <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Usage Quota
                  </p>
                  {quota ? (
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Daily files</span>
                          <span>{quota.daily_files_used} / {quota.daily_file_limit}</span>
                        </div>
                        <MiniBar used={quota.daily_files_used} total={quota.daily_file_limit} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Daily size</span>
                          <span>{formatBytes(quota.daily_size_used)} / {formatBytes(quota.daily_size_limit)}</span>
                        </div>
                        <MiniBar used={quota.daily_size_used} total={quota.daily_size_limit} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Weekly files</span>
                          <span>{quota.weekly_files_used} / {quota.weekly_file_limit}</span>
                        </div>
                        <MiniBar used={quota.weekly_files_used} total={quota.weekly_file_limit} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Weekly size</span>
                          <span>{formatBytes(quota.weekly_size_used)} / {formatBytes(quota.weekly_size_limit)}</span>
                        </div>
                        <MiniBar used={quota.weekly_size_used} total={quota.weekly_size_limit} />
                      </div>
                      <p className="text-xs text-zinc-400">
                        Tier: {quota.tier === 0 ? 'Free' : 'Premium'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      No usage data yet
                    </p>
                  )}
                </div>

                {/* Logout */}
                <div className="px-1 py-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
