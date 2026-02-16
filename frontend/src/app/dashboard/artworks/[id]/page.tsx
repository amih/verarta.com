'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getArtwork } from '@/lib/api/artworks';
import { FileViewer } from '@/components/artwork/FileViewer';
import { FileIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ArtworkDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { data, isLoading, error } = useQuery({
    queryKey: ['artwork', id],
    queryFn: () => getArtwork(id),
    enabled: !isNaN(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          &larr; Back to dashboard
        </Link>
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          Artwork not found.
        </div>
      </div>
    );
  }

  const { artwork } = data;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
        &larr; Back to dashboard
      </Link>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{artwork.title}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Owner: {artwork.owner} &middot; Created: {new Date(artwork.created_at).toLocaleString()}
        </p>
      </div>

      {artwork.files.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Files</h2>
          <div className="space-y-3">
            {artwork.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <FileIcon className="h-5 w-5 text-zinc-400" />
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {file.filename}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {file.mime_type} &middot; {(file.file_size / 1024 / 1024).toFixed(2)} MB
                      {!file.upload_complete && (
                        <span className="ml-2 text-amber-600">
                          ({file.uploaded_chunks}/{file.total_chunks} chunks)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {file.upload_complete && (
                  <FileViewer
                    fileId={file.id}
                    filename={file.filename}
                    mimeType={file.mime_type}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
