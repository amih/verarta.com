'use client';

import Link from 'next/link';
import { FileIcon } from 'lucide-react';
import type { Artwork } from '@/types/artwork';

export function ArtworkCard({ artwork }: { artwork: Artwork }) {
  return (
    <Link
      href={`/dashboard/artworks/${artwork.id}`}
      className="group block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
    >
      <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
        <FileIcon className="h-10 w-10 text-zinc-400" />
      </div>
      <h3 className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300">
        {artwork.title}
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {new Date(artwork.created_at).toLocaleDateString()}
      </p>
    </Link>
  );
}
