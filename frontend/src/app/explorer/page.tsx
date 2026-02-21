'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getChainStats, getRecentBlocks, getActions } from '@/lib/api/chain';
import type { ChainStats, BlockSummary, HyperionAction } from '@/lib/api/chain';

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp + 'Z').getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function ExplorerOverview() {
  const router = useRouter();
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getChainStats().then((r) => setStats(r.stats)),
      getRecentBlocks(20).then((r) => setBlocks(r.blocks)),
      getActions({ limit: 10, filter: '!eosio:onblock' }).then((r) => setActions(r.actions)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;

    if (/^\d+$/.test(q)) {
      router.push(`/explorer/block/${q}`);
    } else if (/^[a-f0-9]{64}$/i.test(q)) {
      router.push(`/explorer/transaction/${q}`);
    } else if (/^[a-z1-5.]{1,12}$/.test(q)) {
      router.push(`/explorer/account/${q}`);
    } else {
      router.push(`/explorer/account/${q}`);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Block Explorer</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse on-chain data — blocks, transactions, accounts, and artworks.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by account name, block number, or transaction ID..."
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Search
        </button>
      </form>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Head Block', value: stats.head_block_num.toLocaleString() },
            { label: 'Chain ID', value: stats.chain_id.slice(0, 8) + '...' },
            { label: 'Artworks', value: stats.total_artworks.toLocaleString() },
            { label: 'Files', value: stats.total_files.toLocaleString() },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        </div>
      )}

      {!loading && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Recent Blocks */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Blocks</h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Block</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Time</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Txns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {blocks.map((block) => (
                    <tr key={block.block_num} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2">
                        <Link href={`/explorer/block/${block.block_num}`} className="font-mono text-blue-600 hover:underline dark:text-blue-400">
                          {block.block_num.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{timeAgo(block.timestamp)}</td>
                      <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">{block.tx_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Actions */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Actions</h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Action</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Actor</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {actions.map((action, i) => (
                    <tr key={`${action.trx_id}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {action.act.name}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/explorer/account/${action.act.authorization[0]?.actor}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {action.act.authorization[0]?.actor || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/explorer/transaction/${action.trx_id}`} className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                          {action.trx_id.slice(0, 8)}...
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">No recent actions</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
