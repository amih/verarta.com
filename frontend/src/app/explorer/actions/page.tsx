'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getActions } from '@/lib/api/chain';
import type { HyperionAction } from '@/lib/api/chain';

const ACTION_TYPES = [
  '', 'createart', 'addfile', 'uploadchunk', 'completefile',
  'transferart', 'deleteartwork', 'setquota', 'setadminkey', 'setaccess',
];

export default function ActionsSearchPage() {
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [total, setTotal] = useState(0);
  const [account, setAccount] = useState('');
  const [actionType, setActionType] = useState('');
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const filter = actionType ? `verarta.core:${actionType}` : undefined;
      const result = await getActions({
        account: account || undefined,
        filter,
        skip,
        limit,
      });
      setActions(result.actions);
      setTotal(result.total);
    } catch {
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [account, actionType, skip]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setSkip(0);
    fetchActions();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Actions</h1>

      {/* Filters */}
      <form onSubmit={handleFilter} className="flex flex-wrap gap-3">
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="Filter by account..."
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value); setSkip(0); }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">All actions</option>
          {ACTION_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Filter
        </button>
      </form>

      {/* Results */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Action</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Actor</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Block</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Timestamp</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
                </td>
              </tr>
            ) : actions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No actions found</td>
              </tr>
            ) : (
              actions.map((action, i) => (
                <tr key={`${action.trx_id}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-2">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {action.act.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/explorer/account/${action.act.authorization[0]?.actor}`} className="text-blue-600 hover:underline dark:text-blue-400">
                      {action.act.authorization[0]?.actor || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/explorer/block/${action.block_num}`} className="text-blue-600 hover:underline dark:text-blue-400">
                      {action.block_num}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {action.timestamp || action['@timestamp'] || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/explorer/transaction/${action.trx_id}`} className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                      {action.trx_id.slice(0, 8)}...
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Showing {skip + 1}–{Math.min(skip + limit, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              onClick={() => setSkip(skip + limit)}
              disabled={skip + limit >= total}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
