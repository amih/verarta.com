'use client';

import { useQuery } from '@tanstack/react-query';
import { queryTable } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';

interface QuotaRow {
  user: string;
  tier: number;
  daily_file_count: number;
  daily_byte_count: number;
  weekly_file_count: number;
  weekly_byte_count: number;
  daily_file_limit: number;
  daily_byte_limit: number;
  weekly_file_limit: number;
  weekly_byte_limit: number;
  last_daily_reset: number;
  last_weekly_reset: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function ProgressBar({ used, total, label }: { used: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${
            percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-zinc-600 dark:bg-zinc-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function QuotaDisplay() {
  const user = useAuthStore((s) => s.user);

  const { data: quota } = useQuery({
    queryKey: ['quota', user?.blockchain_account],
    queryFn: async () => {
      if (!user) return null;
      const result = await queryTable<QuotaRow>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'usagequotas',
        lower_bound: user.blockchain_account,
        upper_bound: user.blockchain_account,
        limit: 1,
      });
      return result.rows[0] || null;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!quota) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading quota...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Usage Quota</h3>
      <div className="space-y-3">
        <ProgressBar
          used={quota.daily_file_count}
          total={quota.daily_file_limit}
          label={`Daily files: ${quota.daily_file_count}/${quota.daily_file_limit}`}
        />
        <ProgressBar
          used={quota.daily_byte_count}
          total={quota.daily_byte_limit}
          label={`Daily size: ${formatBytes(quota.daily_byte_count)}/${formatBytes(quota.daily_byte_limit)}`}
        />
        <ProgressBar
          used={quota.weekly_file_count}
          total={quota.weekly_file_limit}
          label={`Weekly files: ${quota.weekly_file_count}/${quota.weekly_file_limit}`}
        />
        <ProgressBar
          used={quota.weekly_byte_count}
          total={quota.weekly_byte_limit}
          label={`Weekly size: ${formatBytes(quota.weekly_byte_count)}/${formatBytes(quota.weekly_byte_limit)}`}
        />
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Tier: {quota.tier === 0 ? 'Free' : 'Premium'}
      </p>
    </div>
  );
}
