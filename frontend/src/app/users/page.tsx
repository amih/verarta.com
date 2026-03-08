'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPublicUsers } from '@/lib/api/profile';
import { Loader2 } from 'lucide-react';

export default function UsersPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const { data: users, isLoading } = useQuery({
    queryKey: ['public-users'],
    queryFn: getPublicUsers,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Artists & Collectors
      </h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : users && users.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Link
              key={user.username}
              href={`/u/${encodeURIComponent(user.username.replace(/ /g, '_'))}`}
              className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                {user.profile_image_url ? (
                  <img
                    src={`${apiUrl}${user.profile_image_url}`}
                    alt={user.display_name || user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg font-medium text-zinc-500 dark:text-zinc-400">
                    {(user.display_name || user.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {user.display_name || user.username}
                </p>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  @{user.username.replace(/ /g, '_')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">No public profiles yet</p>
        </div>
      )}
    </div>
  );
}
