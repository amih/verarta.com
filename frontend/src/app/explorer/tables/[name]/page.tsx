'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { queryTable } from '@/lib/api/chain';

function truncateValue(value: unknown): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str && str.length > 60) return str.slice(0, 60) + '...';
  return str ?? '—';
}

function isAccountName(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z1-5.]{1,12}$/.test(value);
}

export default function TableDetailPage() {
  const params = useParams();
  const tableName = params.name as string;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [nextKey, setNextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 50;

  const fetchRows = useCallback(async (lowerBound?: string) => {
    setLoading(true);
    try {
      const result = await queryTable({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: tableName,
        lower_bound: lowerBound,
        limit,
      });
      if (lowerBound) {
        setRows((prev) => [...prev, ...result.rows]);
      } else {
        setRows(result.rows);
      }
      setMore(result.more);
      setNextKey(result.next_key ? String(result.next_key) : null);
      if (result.rows.length > 0 && columns.length === 0) {
        setColumns(Object.keys(result.rows[0]));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load table');
    } finally {
      setLoading(false);
    }
  }, [tableName, columns.length]);

  useEffect(() => {
    fetchRows();
  }, [tableName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/explorer/tables" className="text-sm text-blue-600 hover:underline dark:text-blue-400">Tables</Link>
        <span className="text-zinc-400">/</span>
        <h1 className="font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-100">{tableName}</h1>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                {columns.map((col) => {
                  const val = row[col];
                  const isArtworkId = (col === 'artwork_id' || col === 'id') && typeof val === 'number';
                  const isOwner = (col === 'owner' || col === 'account') && isAccountName(val);
                  return (
                    <td key={col} className="whitespace-nowrap px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {isArtworkId ? (
                        <Link href={`/explorer/artwork/${val}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {String(val)}
                        </Link>
                      ) : isOwner ? (
                        <Link href={`/explorer/account/${val}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {String(val)}
                        </Link>
                      ) : (
                        <span title={typeof val === 'string' && val.length > 60 ? val : undefined}>
                          {truncateValue(val)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={columns.length || 1} className="px-4 py-8 text-center">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-zinc-400">No rows</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {more && nextKey && !loading && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchRows(nextKey)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
