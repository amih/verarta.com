'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getPublicProfile, getPublicArtworks } from '@/lib/api/profile';
import { PublicArtworkCard } from '@/components/artwork/PublicArtworkCard';
import { useState } from 'react';
import { Loader2, Share2, Check } from 'lucide-react';

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [copied, setCopied] = useState(false);

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => getPublicProfile(username),
    enabled: !!username,
  });

  const { data: artworks, isLoading: artworksLoading } = useQuery({
    queryKey: ['public-artworks', username],
    queryFn: () => getPublicArtworks(username),
    enabled: !!username,
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">User not found</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          The profile you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
    );
  }

  const displayUsername = profile.username || username.replace(/_/g, ' ');

  return (
    <div>
      {/* Cover Image */}
      <div className="h-48 bg-zinc-200 dark:bg-zinc-800 sm:h-64">
        {profile.cover_image_url && (
          <img
            src={`${apiUrl}${profile.cover_image_url}`}
            alt="Cover"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Profile Info */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-16 mb-6 flex items-end gap-4">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-white bg-zinc-200 dark:border-zinc-950 dark:bg-zinc-700">
            {profile.profile_image_url ? (
              <img
                src={`${apiUrl}${profile.profile_image_url}`}
                alt={displayUsername}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl font-medium text-zinc-500">
                {(profile.display_name || displayUsername).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {profile.display_name || displayUsername}
              </h1>
              <button
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.share) {
                    navigator.share({ title: `${profile.display_name || displayUsername}'s Collection`, url });
                  } else {
                    navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title="Share"
              >
                {copied ? <Check className="h-5 w-5 text-green-500" /> : <Share2 className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">@{displayUsername.replace(/ /g, '_')}</p>
          </div>
        </div>

        {profile.bio && (
          <p className="mb-8 max-w-2xl text-zinc-600 dark:text-zinc-400">{profile.bio}</p>
        )}

        {/* Artworks Grid */}
        <div className="pb-12">
          <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">Public Artworks</h2>
          {artworksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : artworks && artworks.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artworks.map((artwork) => (
                <PublicArtworkCard key={artwork.id} artwork={artwork} username={username} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-zinc-500 dark:text-zinc-400">No public artworks yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
