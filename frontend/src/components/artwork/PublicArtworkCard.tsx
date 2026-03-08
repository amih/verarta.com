'use client';

import Link from 'next/link';
import { FileIcon } from 'lucide-react';
import type { PublicArtwork } from '@/lib/api/profile';

interface PublicArtworkCardProps {
  artwork: PublicArtwork;
  username: string;
}

export function PublicArtworkCard({ artwork, username }: PublicArtworkCardProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  return (
    <Link
      href={`/u/${username}/artwork/${artwork.id}`}
      className="group block rounded-none border border-slate-400 bg-slate-200 p-4 transition-colors hover:border-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:border-slate-400"
    >
      {artwork.thumbnail_url ? (
        <div className="mb-3 overflow-hidden rounded-md">
          <img
            src={`${apiUrl}${artwork.thumbnail_url}`}
            alt={artwork.title}
            className="h-48 w-full object-cover"
          />
        </div>
      ) : (
        <div className="mb-3 flex h-48 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
          <FileIcon className="h-10 w-10 text-zinc-400" />
        </div>
      )}
      <h3 className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300">
        {artwork.title}
      </h3>
      {artwork.description_snippet && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3">
          {artwork.description_snippet}
        </p>
      )}
      {(artwork.artist_name || artwork.collection_name || artwork.era || artwork.creation_date) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {artwork.artist_name && (
            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {artwork.artist_name}
            </span>
          )}
          {artwork.collection_name && (
            <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {artwork.collection_name}
            </span>
          )}
          {artwork.era && (
            <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {artwork.era}
            </span>
          )}
          {artwork.creation_date && (
            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
              {artwork.creation_date}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
