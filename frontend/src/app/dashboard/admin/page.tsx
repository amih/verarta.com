'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { fetchUsers, toggleUserAdmin, type AdminUser } from '@/lib/api/admin';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

const PROTECTED_USER_ID = 1;

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    if (user && !user.is_admin) {
      router.push('/dashboard');
      return;
    }

    fetchUsers()
      .then(setUsers)
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false));
  }, [user, router]);

  async function handleToggle(userId: number) {
    setToggling(userId);
    try {
      const updated = await toggleUserAdmin(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, is_admin: updated.is_admin } : u))
      );
    } catch {
      // error handled by axios interceptor
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">User Management</h1>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Email</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Display Name</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Blockchain Account</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Admin</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Last Login</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{u.email}</td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{u.display_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {u.blockchain_account}
                </td>
                <td className="px-4 py-3">
                  {u.is_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(u.id)}
                    disabled={u.id === PROTECTED_USER_ID || toggling === u.id}
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={
                      u.id === PROTECTED_USER_ID
                        ? undefined
                        : u.is_admin
                          ? { color: '#b91c1c' }
                          : { color: '#15803d' }
                    }
                    title={u.id === PROTECTED_USER_ID ? 'Protected admin — cannot be modified' : undefined}
                  >
                    {toggling === u.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : u.is_admin ? (
                      <>
                        <ShieldOff className="h-3 w-3" /> Revoke
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3" /> Grant
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
