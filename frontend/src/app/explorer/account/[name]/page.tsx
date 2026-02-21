'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAccount, queryTable, getActions } from '@/lib/api/chain';
import type { HyperionAction } from '@/lib/api/chain';

export default function AccountDetailPage() {
  const params = useParams();
  const accountName = params.name as string;
  const [account, setAccount] = useState<any>(null);
  const [artworks, setArtworks] = useState<any[]>([]);
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountName) return;
    Promise.all([
      getAccount(accountName)
        .then((r) => setAccount(r.account))
        .catch((err) => setError(err.response?.data?.error || 'Account not found')),
      queryTable({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artworks',
        index_position: 2,
        key_type: 'name',
        lower_bound: accountName,
        upper_bound: accountName,
        limit: 100,
      })
        .then((r) => setArtworks(r.rows))
        .catch(() => {}),
      getActions({ account: accountName, limit: 20 })
        .then((r) => setActions(r.actions))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [accountName]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (error && !account) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Account: {accountName}
      </h1>

      {/* Account Info */}
      {account && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <div className="flex px-4 py-3">
              <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">Name</dt>
              <dd className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{String(account.account_name)}</dd>
            </div>
            <div className="flex px-4 py-3">
              <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">RAM</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100">
                {Number(account.ram_usage).toLocaleString()} / {Number(account.ram_quota).toLocaleString()} bytes
              </dd>
            </div>
            <div className="flex px-4 py-3">
              <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">CPU</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100">
                {Number(account.cpu_limit?.used || 0).toLocaleString()} / {Number(account.cpu_limit?.max || 0).toLocaleString()} us
              </dd>
            </div>
            <div className="flex px-4 py-3">
              <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">NET</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100">
                {Number(account.net_limit?.used || 0).toLocaleString()} / {Number(account.net_limit?.max || 0).toLocaleString()} bytes
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Permissions */}
      {account?.permissions && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Permissions</h2>
          <div className="space-y-2">
            {(account.permissions as any[]).map((perm: any) => (
              <div key={String(perm.perm_name)} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs font-medium dark:bg-zinc-800">
                    {String(perm.perm_name)}
                  </span>
                  {String(perm.parent) && (
                    <span className="text-xs text-zinc-400">parent: {String(perm.parent)}</span>
                  )}
                  <span className="text-xs text-zinc-400">threshold: {Number(perm.required_auth?.threshold)}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {(perm.required_auth?.keys || []).map((k: any) => (
                    <div key={String(k.key)} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">key:</span>
                      <span className="break-all font-mono text-zinc-700 dark:text-zinc-300">{String(k.key)}</span>
                      <span className="text-zinc-400">weight: {Number(k.weight)}</span>
                    </div>
                  ))}
                  {(perm.required_auth?.accounts || []).map((a: any) => (
                    <div key={`${a.permission?.actor}@${a.permission?.permission}`} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">account:</span>
                      <Link href={`/explorer/account/${a.permission?.actor}`} className="font-mono text-blue-600 hover:underline dark:text-blue-400">
                        {String(a.permission?.actor)}@{String(a.permission?.permission)}
                      </Link>
                      <span className="text-zinc-400">weight: {Number(a.weight)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artworks */}
      {artworks.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Artworks ({artworks.length})</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">ID</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Title (encrypted)</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Files</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {artworks.map((art: any) => (
                  <tr key={art.artwork_id || art.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-2">
                      <Link href={`/explorer/artwork/${art.artwork_id || art.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {art.artwork_id || art.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {typeof art.title === 'string' && art.title.length > 30
                        ? art.title.slice(0, 30) + '...'
                        : art.title || '—'}
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{art.file_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Actions */}
      {actions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Actions</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Action</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Contract</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Block</th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {actions.map((action, i) => (
                  <tr key={`${action.trx_id}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-2">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                        {action.act.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{action.act.account}</td>
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
