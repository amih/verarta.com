'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { queryTable, getActions } from '@/lib/api/chain';
import type { HyperionAction } from '@/lib/api/chain';

export default function ArtworkOnChainPage() {
  const params = useParams();
  const artworkId = Number(params.id);
  const [artwork, setArtwork] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isNaN(artworkId)) {
      setError('Invalid artwork ID');
      setLoading(false);
      return;
    }

    Promise.all([
      // Get artwork row
      queryTable({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artworks',
        lower_bound: String(artworkId),
        upper_bound: String(artworkId),
        limit: 1,
      }).then((r) => {
        if (r.rows.length > 0) setArtwork(r.rows[0]);
        else setError('Artwork not found');
      }),
      // Get files for this artwork
      queryTable({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        index_position: 2,
        key_type: 'i64',
        lower_bound: String(artworkId),
        upper_bound: String(artworkId),
        limit: 100,
      })
        .then((r) => setFiles(r.rows))
        .catch(() => {}),
      // Get actions mentioning this artwork
      getActions({ filter: 'verarta.core:createart', limit: 100 })
        .then((r) => {
          const filtered = r.actions.filter(
            (a: HyperionAction) => Number(a.act.data.artwork_id) === artworkId
          );
          setActions(filtered);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [artworkId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (error && !artwork) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{error}</div>;
  }

  if (!artwork) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Artwork #{artworkId}
      </h1>

      {/* Artwork Info */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {Object.entries(artwork).map(([key, value]) => {
            const isOwner = key === 'owner' && typeof value === 'string' && /^[a-z1-5.]{1,12}$/.test(value);
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            const isLong = typeof strValue === 'string' && strValue.length > 80;
            return (
              <div key={key} className="flex px-4 py-3">
                <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">{key}</dt>
                <dd className={`text-sm text-zinc-900 dark:text-zinc-100 ${isLong ? 'break-all font-mono text-xs' : ''}`}>
                  {isOwner ? (
                    <Link href={`/explorer/account/${value}`} className="text-blue-600 hover:underline dark:text-blue-400">
                      {String(value)}
                    </Link>
                  ) : isLong ? (
                    <span title={strValue}>{strValue.slice(0, 80)}...</span>
                  ) : (
                    String(strValue)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Files */}
      {files.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Files ({files.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">File ID</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">MIME Type</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Size</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Complete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {files.map((file: any) => (
                  <tr key={file.file_id || file.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-2 font-mono text-zinc-700 dark:text-zinc-300">{file.file_id || file.id}</td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{file.mime_type || '—'}</td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${
                        file.upload_complete
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      }`}>
                        {file.upload_complete ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action History */}
      {actions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Action History</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Action</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Block</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {actions.map((action, i) => (
                  <tr key={`${action.trx_id}-${i}`}>
                    <td className="px-4 py-2">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                        {action.act.name}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/explorer/block/${action.block_num}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {action.block_num}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/explorer/transaction/${action.trx_id}`} className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                        {action.trx_id.slice(0, 8)}...
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
