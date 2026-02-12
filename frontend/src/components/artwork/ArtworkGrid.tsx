'use client';

import { useQuery } from '@tanstack/react-query';
import { listArtworks } from '@/lib/api/artworks';
import { ArtworkCard } from './ArtworkCard';
import { Loader2 } from 'lucide-react';

export function ArtworkGrid() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['artworks'],
    queryFn: listArtworks,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
        Failed to load artworks.
      </div>
    );
  }

  if (!data?.artworks.length) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No artworks yet. Upload your first one!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.artworks.map((artwork) => (
        <ArtworkCard key={artwork.id} artwork={artwork} />
      ))}
    </div>
  );
}
