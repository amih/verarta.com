'use client';

import Link from 'next/link';

const TABLES = [
  { name: 'artworks', description: 'All registered artworks with owner and metadata' },
  { name: 'artfiles', description: 'Files attached to artworks (images, videos, documents)' },
  { name: 'usagequotas', description: 'Per-account upload quotas and usage' },
  { name: 'adminkeys', description: 'Admin signing keys for administrative operations' },
  { name: 'adminaccess', description: 'Admin access grants and permissions' },
];

export default function TablesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Contract Tables</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Browse tables from the <span className="font-mono">verarta.core</span> smart contract.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {TABLES.map((table) => (
          <Link
            key={table.name}
            href={`/explorer/tables/${table.name}`}
            className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <h3 className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{table.name}</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{table.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
