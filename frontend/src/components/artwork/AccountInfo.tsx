'use client';

import { useQuery } from '@tanstack/react-query';
import { getAccount } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';
import { Loader2, Wallet, Cpu, HardDrive, Wifi } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUs(us: number): string {
  if (us < 1000) return `${us} µs`;
  if (us < 1000000) return `${(us / 1000).toFixed(1)} ms`;
  return `${(us / 1000000).toFixed(2)} s`;
}

function ResourceBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color =
    pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AccountInfo() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, error } = useQuery({
    queryKey: ['chain-account', user?.blockchain_account],
    queryFn: () => getAccount(user!.blockchain_account),
    enabled: !!user?.blockchain_account,
    refetchInterval: 30000,
  });

  if (!user) return null;

  const account = data?.account;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <Wallet className="h-4 w-4" />
        Blockchain Account
      </h3>

      <div className="mb-3">
        <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {user.blockchain_account}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading resources...
        </div>
      )}

      {error && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Account not yet created on-chain
        </p>
      )}

      {account && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <HardDrive className="h-3 w-3" />
            <span>RAM: {formatBytes(account.ram_usage)} / {formatBytes(account.ram_quota)}</span>
          </div>
          <ResourceBar
            used={account.ram_usage}
            max={account.ram_quota}
            label="RAM"
          />

          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Cpu className="h-3 w-3" />
            <span>
              CPU: {formatUs(account.cpu_limit.used)} / {formatUs(account.cpu_limit.max)}
            </span>
          </div>
          <ResourceBar
            used={account.cpu_limit.used}
            max={account.cpu_limit.max}
            label="CPU"
          />

          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Wifi className="h-3 w-3" />
            <span>
              NET: {formatBytes(account.net_limit.used)} / {formatBytes(account.net_limit.max)}
            </span>
          </div>
          <ResourceBar
            used={account.net_limit.used}
            max={account.net_limit.max}
            label="NET"
          />
        </div>
      )}
    </div>
  );
}
