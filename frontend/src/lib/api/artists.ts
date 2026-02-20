import { apiClient } from './client';

export interface Artist {
  id: number;
  name: string;
}

export async function fetchArtists(): Promise<Artist[]> {
  const res = await apiClient.get<{ artists: Artist[] }>('/api/artists');
  return res.data.artists;
}

export async function createArtist(name: string): Promise<Artist> {
  const res = await apiClient.post<{ artist: Artist }>('/api/artists', { name });
  return res.data.artist;
}
