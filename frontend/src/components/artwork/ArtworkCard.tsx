'use client';

import Link from 'next/link';
import { FileIcon } from 'lucide-react';
import type { Artwork } from '@/types/artwork';
import { ArtworkThumbnail } from './ArtworkThumbnail';

interface ArtworkCardProps {
  artwork: Artwork & {
    artist_name?: string | null;
    collection_name?: string | null;
    era?: string | null;
    creation_date?: string | null;
  };
  files?: Array<{ id: string; mime_type: string }> | null;
}

export function ArtworkCard({ artwork, files }: ArtworkCardProps) {
  const imageFiles = (files ?? []).filter((f) => f.mime_type.startsWith('image/'));
  const mainFile = imageFiles[0] ?? null;
  const additionalFiles = imageFiles.slice(1, 4);

  return (
    <Link
      href={`/dashboard/artworks/${artwork.id}`}
      className="group block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
    >
      {mainFile ? (
        <ArtworkThumbnail fileId={mainFile.id} mimeType={mainFile.mime_type} />
      ) : (
        <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
          <FileIcon className="h-10 w-10 text-zinc-400" />
        </div>
      )}
      {additionalFiles.length > 0 && (
        <div className="mb-3 -mt-2 flex gap-1">
          {additionalFiles.map((f) => (
            <ArtworkThumbnail
              key={f.id}
              fileId={f.id}
              mimeType={f.mime_type}
              containerClassName="h-12 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      )}
      <h3 className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300">
        {artwork.title}
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {new Date(artwork.created_at).toLocaleDateString()}
      </p>
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
