'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccounts } from '@/lib/api/chain';
import type { AccountInfo } from '@/lib/api/chain';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAccounts()
      .then((r) => setAccounts(r.accounts))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load accounts'))
      .finally(() => setLoading(false));
  }, []);

  const showEmail = accounts.length > 0 && accounts[0].email !== undefined;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Accounts</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {accounts.length} registered {accounts.length === 1 ? 'user' : 'users'}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Blockchain Account</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Display Name</th>
              {showEmail && (
                <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Email</th>
              )}
              <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {accounts.map((account) => (
              <tr key={account.blockchain_account} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="px-4 py-2">
                  <Link
                    href={`/explorer/account/${account.blockchain_account}`}
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {account.blockchain_account}
                  </Link>
                </td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">{account.display_name}</td>
                {showEmail && (
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{account.email}</td>
                )}
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                  {new Date(account.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
