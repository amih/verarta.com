'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listArtworks } from '@/lib/api/artworks';
import { fetchArtists } from '@/lib/api/artists';
import { fetchCollections } from '@/lib/api/collections';
import { ArtworkCard } from './ArtworkCard';
import { Loader2, Search, X } from 'lucide-react';

export function ArtworkGrid() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [artistId, setArtistId] = useState<number | ''>('');
  const [collectionId, setCollectionId] = useState<number | ''>('');
  const [era, setEra] = useState('');
  const [debouncedEra, setDebouncedEra] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce q and era
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q);
      setDebouncedEra(era);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, era]);

  const filters = {
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(artistId ? { artist_id: artistId as number } : {}),
    ...(collectionId ? { collection_id: collectionId as number } : {}),
    ...(debouncedEra ? { era: debouncedEra } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['artworks', filters],
    queryFn: () => listArtworks(filters),
  });

  const { data: artistsData } = useQuery({
    queryKey: ['artists'],
    queryFn: fetchArtists,
  });

  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: fetchCollections,
  });

  const hasFilters = q || artistId || collectionId || era;

  function clearFilters() {
    setQ('');
    setDebouncedQ('');
    setArtistId('');
    setCollectionId('');
    setEra('');
    setDebouncedEra('');
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Artist filter */}
        {artistsData && artistsData.length > 0 && (
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value ? Number(e.target.value) : '')}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All artists</option>
            {artistsData.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {/* Collection filter */}
        {collectionsData && collectionsData.length > 0 && (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value ? Number(e.target.value) : '')}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All collections</option>
            {collectionsData.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Era filter */}
        <input
          type="text"
          value={era}
          onChange={(e) => setEra(e.target.value)}
          placeholder="Era..."
          className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          Failed to load artworks.
        </div>
      ) : !data?.artworks.length ? (
        <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {hasFilters ? 'No artworks match your filters.' : 'No artworks yet. Upload your first one!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.artworks.map((artwork) => (
            <ArtworkCard key={artwork.id} artwork={artwork} files={artwork.files} />
          ))}
        </div>
      )}
    </div>
  );
}
