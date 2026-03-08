'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getPublicArtworkDetail } from '@/lib/api/profile';
import { Loader2, ArrowLeft, FileIcon } from 'lucide-react';
import Link from 'next/link';

export default function PublicArtworkDetailPage() {
  const params = useParams();
  const username = params.username as string;
  const artworkId = Number(params.artworkId);

  const { data: artwork, isLoading, error } = useQuery({
    queryKey: ['public-artwork-detail', artworkId],
    queryFn: () => getPublicArtworkDetail(artworkId),
    enabled: !isNaN(artworkId),
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Link
          href={`/u/${username}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
        <div className="mt-8 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Artwork not found</h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            This artwork doesn&apos;t exist or is private.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/u/${username}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {artwork.owner_display_name || username.replace(/_/g, ' ')}&apos;s profile
      </Link>

      <div className="mt-6 space-y-6">
        {/* Thumbnail */}
        {artwork.thumbnail_url ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <img
              src={`${apiUrl}${artwork.thumbnail_url}`}
              alt={artwork.title}
              className="w-full object-contain"
              style={{ maxHeight: '70vh' }}
            />
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
            <FileIcon className="h-16 w-16 text-zinc-400" />
          </div>
        )}

        {/* Title & metadata */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {artwork.title}
          </h1>

          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            By{' '}
            <Link
              href={`/u/${username}`}
              className="text-zinc-700 hover:underline dark:text-zinc-300"
            >
              {artwork.owner_display_name || username.replace(/_/g, ' ')}
            </Link>
            {' '}&middot;{' '}{new Date(artwork.created_at).toLocaleDateString()}
          </p>

          {(artwork.artist_name || artwork.collection_name || artwork.era || artwork.creation_date) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {artwork.artist_name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400">Artist</span>
                  {artwork.artist_name}
                </span>
              )}
              {artwork.collection_name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  <span className="text-blue-400">Collection</span>
                  {artwork.collection_name}
                </span>
              )}
              {artwork.era && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <span className="text-amber-400">Era</span>
                  {artwork.era}
                </span>
              )}
              {artwork.creation_date && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400">Date</span>
                  {artwork.creation_date}
                </span>
              )}
            </div>
          )}

          {artwork.description_html && artwork.description_html !== '<p></p>' && (
            <div
              className="mt-4 prose prose-sm dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400"
              dangerouslySetInnerHTML={{ __html: artwork.description_html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
