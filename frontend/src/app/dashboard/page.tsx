'use client';

import Link from 'next/link';
import { ArtworkGrid } from '@/components/artwork/ArtworkGrid';
import { QuotaDisplay } from '@/components/artwork/QuotaDisplay';
import { Upload } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <Link
          href="/dashboard/upload"
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Your Artworks</h2>
          <ArtworkGrid />
        </div>
        <div>
          <QuotaDisplay />
        </div>
      </div>
    </div>
  );
}
