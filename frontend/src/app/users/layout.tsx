'use client';

import { PublicHeader } from '@/components/layout/PublicHeader';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />
      <main>{children}</main>
    </div>
  );
}
