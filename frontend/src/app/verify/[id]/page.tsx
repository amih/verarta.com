'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getPublicArtworkDetail } from '@/lib/api/profile';
import { Loader2, FileIcon, CheckCircle2, ExternalLink, Download } from 'lucide-react';
import Link from 'next/link';

export default function VerifyArtworkPage() {
  const params = useParams();
  const artworkId = Number(params.id);

  const { data: artwork, isLoading, error } = useQuery({
    queryKey: ['verify-artwork', artworkId],
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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
          <h1 className="text-xl font-semibold text-red-900 dark:text-red-200">
            Artwork not verified
          </h1>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            This artwork ID does not exist on verarta, or the owner has marked it private.
          </p>
        </div>
      </div>
    );
  }

  const registeredAt = new Date(artwork.created_at);
  const coaHref = `${apiUrl}/api/artworks/${artworkId}/coa`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
        <div>
          <span className="font-semibold">Verified artwork.</span>{' '}
          Registered on the Verarta blockchain — no authentication required to view this record.
        </div>
      </div>

      <div className="space-y-6">
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

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {artwork.title}
          </h1>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {artwork.artist_name && (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Artist</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{artwork.artist_name}</dd>
              </div>
            )}
            {artwork.creation_date && (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Date of creation</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{artwork.creation_date}</dd>
              </div>
            )}
            {artwork.era && (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Era</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{artwork.era}</dd>
              </div>
            )}
            {artwork.collection_name && (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Collection</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{artwork.collection_name}</dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Registered by</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {artwork.owner_username ? (
                  <Link
                    href={`/u/${artwork.owner_username}`}
                    className="hover:underline"
                  >
                    {artwork.owner_display_name || artwork.owner_username}
                  </Link>
                ) : (
                  artwork.owner_display_name || artwork.owner_account || '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Registered on</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {registeredAt.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Artwork ID</dt>
              <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                {artwork.id}
              </dd>
            </div>
            {artwork.blockchain_tx_id && (
              <div className="sm:col-span-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Blockchain transaction</dt>
                <dd className="font-mono text-xs break-all text-zinc-900 dark:text-zinc-100">
                  <Link
                    href={`/explorer/transaction/${artwork.blockchain_tx_id}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {artwork.blockchain_tx_id}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {artwork.description_html && artwork.description_html !== '<p></p>' && (
            <div
              className="mt-5 border-t border-zinc-200 pt-5 prose prose-sm dark:prose-invert max-w-none text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
              dangerouslySetInnerHTML={{ __html: artwork.description_html }}
            />
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <a
              href={coaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Download className="h-4 w-4" />
              Download Certificate of Authenticity
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Powered by{' '}
          <Link href="/" className="hover:underline">
            Verarta
          </Link>{' '}
          — tamper-proof provenance for original artwork.
        </p>
      </div>
    </div>
  );
}
