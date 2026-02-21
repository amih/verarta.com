'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PublicHeader } from '@/components/layout/PublicHeader';

const subNav = [
  { href: '/explorer', label: 'Overview' },
  { href: '/explorer/actions', label: 'Actions' },
  { href: '/explorer/tables', label: 'Tables' },
];

export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4">
          {subNav.map((item) => {
            const isActive = item.href === '/explorer'
              ? pathname === '/explorer'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </div>
  );
}
