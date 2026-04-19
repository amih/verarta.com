import { apiClient } from './client';
import axios from 'axios';

export interface UserProfile {
  display_name: string | null;
  email: string;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
}

export interface PublicProfile {
  display_name: string | null;
  username: string | null;
  bio: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
}

export interface PublicArtwork {
  id: number;
  title: string;
  thumbnail_url: string | null;
  artist_name: string | null;
  collection_name: string | null;
  era: string | null;
  creation_date: string | null;
  description_snippet: string | null;
  created_at: string;
}

// Authenticated endpoints

export async function getMyProfile(): Promise<UserProfile> {
  const res = await apiClient.get<{ profile: UserProfile }>('/api/users/profile');
  return res.data.profile;
}

export async function updateMyProfile(data: {
  username?: string;
  display_name?: string;
  bio?: string;
}): Promise<void> {
  await apiClient.put('/api/users/profile', data);
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const res = await apiClient.get<{ available: boolean }>(
    `/api/users/username-available?username=${encodeURIComponent(username)}`
  );
  return res.data.available;
}

export async function uploadProfileImage(base64: string, type: 'profile' | 'cover'): Promise<string> {
  const res = await apiClient.post<{ url: string }>('/api/uploads/image', {
    image: base64,
    type,
  });
  return res.data.url;
}

export async function uploadPublicThumbnail(base64: string, artworkId: number): Promise<string> {
  const res = await apiClient.post<{ url: string }>('/api/uploads/image', {
    image: base64,
    type: 'thumbnail',
    artwork_id: artworkId,
  });
  return res.data.url;
}

export interface PublicUserSummary {
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
}

// Public endpoints (no auth required)

const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4321',
  headers: { 'Content-Type': 'application/json' },
});

export async function getPublicUsers(): Promise<PublicUserSummary[]> {
  const res = await publicClient.get<{ users: PublicUserSummary[] }>('/api/users/list');
  return res.data.users;
}

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const res = await publicClient.get<{ profile: PublicProfile }>(
    `/api/users/${encodeURIComponent(username)}/public`
  );
  return res.data.profile;
}

export async function getPublicArtworks(username: string): Promise<PublicArtwork[]> {
  const res = await publicClient.get<{ artworks: PublicArtwork[] }>(
    `/api/users/${encodeURIComponent(username)}/artworks`
  );
  return res.data.artworks;
}

export interface PublicArtworkDetail {
  id: number;
  title: string;
  thumbnail_url: string | null;
  description_html: string | null;
  artist_name: string | null;
  collection_name: string | null;
  era: string | null;
  creation_date: string | null;
  created_at: string;
  owner_display_name: string | null;
  owner_username: string | null;
  owner_account: string | null;
  blockchain_tx_id: string | null;
}

export async function getPublicArtworkDetail(artworkId: number): Promise<PublicArtworkDetail> {
  const res = await publicClient.get<{ artwork: PublicArtworkDetail }>(
    `/api/artworks/${artworkId}/public`
  );
  return res.data.artwork;
}

export async function saveArtworkTxId(artworkId: number, txId: string): Promise<void> {
  await apiClient.put(`/api/artworks/${artworkId}/tx`, { tx_id: txId });
}
