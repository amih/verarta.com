'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getBlock } from '@/lib/api/chain';
import type { BlockDetail } from '@/lib/api/chain';

export default function BlockDetailPage() {
  const params = useParams();
  const blockNum = Number(params.number);
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!blockNum || isNaN(blockNum)) {
      setError('Invalid block number');
      setLoading(false);
      return;
    }
    getBlock(blockNum)
      .then((r) => setBlock(r.block))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load block'))
      .finally(() => setLoading(false));
  }, [blockNum]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{error}</div>;
  }

  if (!block) return null;

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Block #{block.block_num.toLocaleString()}
        </h1>
        <div className="flex gap-2">
          {block.block_num > 1 && (
            <Link
              href={`/explorer/block/${block.block_num - 1}`}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Prev
            </Link>
          )}
          <Link
            href={`/explorer/block/${block.block_num + 1}`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Next
          </Link>
        </div>
      </div>

      {/* Block Info */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {[
            { label: 'Block Number', value: block.block_num.toLocaleString() },
            { label: 'Timestamp', value: block.timestamp },
            { label: 'Producer', value: block.producer },
            { label: 'Block ID', value: block.block_id, mono: true },
            { label: 'Transactions', value: block.transactions.length.toString() },
          ].map((row) => (
            <div key={row.label} className="flex px-4 py-3">
              <dt className="w-40 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">{row.label}</dt>
              <dd className={`text-sm text-zinc-900 dark:text-zinc-100 ${row.mono ? 'break-all font-mono text-xs' : ''}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Transactions */}
      {block.transactions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Transactions</h2>
          <div className="space-y-3">
            {block.transactions.map((tx) => (
              <div key={tx.id} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">TX:</span>
                  <Link href={`/explorer/transaction/${tx.id}`} className="break-all font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                    {tx.id}
                  </Link>
                </div>
                {tx.actions.length > 0 && (
                  <div className="space-y-2">
                    {tx.actions.map((act, i) => (
                      <div key={i} className="rounded border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-center gap-2 text-sm">
                          <Link href={`/explorer/account/${act.account}`} className="text-blue-600 hover:underline dark:text-blue-400">
                            {act.account}
                          </Link>
                          <span className="text-zinc-400">::</span>
                          <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{act.name}</span>
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">
                            Action data
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-zinc-100 p-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {JSON.stringify(act.data, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
