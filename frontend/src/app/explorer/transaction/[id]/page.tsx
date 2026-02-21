'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTransaction } from '@/lib/api/chain';

function truncateBase64(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return value.slice(0, 40) + '...[' + value.length + ' chars]';
  }
  if (Array.isArray(value)) return value.map(truncateBase64);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, truncateBase64(v)])
    );
  }
  return value;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const txId = params.id as string;
  const [tx, setTx] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!txId) return;
    getTransaction(txId)
      .then((r) => setTx(r.transaction))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load transaction'))
      .finally(() => setLoading(false));
  }, [txId]);

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

  if (!tx) return null;

  const actions: any[] = tx.actions || [];
  const blockNum = tx.actions?.[0]?.block_num || tx.block_num;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Transaction</h1>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <div className="flex px-4 py-3">
            <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">TX ID</dt>
            <dd className="break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">{txId}</dd>
          </div>
          {blockNum && (
            <div className="flex px-4 py-3">
              <dt className="w-32 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">Block</dt>
              <dd>
                <Link href={`/explorer/block/${blockNum}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  {Number(blockNum).toLocaleString()}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Actions ({actions.length})</h2>
        <div className="space-y-3">
          {actions.map((action: any, i: number) => (
            <div key={i} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm">
                <Link href={`/explorer/account/${action.act.account}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  {action.act.account}
                </Link>
                <span className="text-zinc-400">::</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{action.act.name}</span>
                <span className="ml-auto text-xs text-zinc-400">
                  {(action.act.authorization || []).map((a: any) => `${a.actor}@${a.permission}`).join(', ')}
                </span>
              </div>
              <div className="mt-3">
                <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  {JSON.stringify(truncateBase64(action.act.data), null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
