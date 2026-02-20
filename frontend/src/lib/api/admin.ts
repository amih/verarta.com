import { apiClient } from './client';
import type { ArtworkFilters } from './artworks';

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  blockchain_account: string;
  last_login: string | null;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await apiClient.get<{ users: AdminUser[] }>('/api/admin/users');
  return res.data.users;
}

export async function toggleUserAdmin(userId: number): Promise<{ id: number; is_admin: boolean }> {
  const res = await apiClient.post<{ user: { id: number; is_admin: boolean } }>(
    `/api/admin/users/${userId}/toggle-admin`
  );
  return res.data.user;
}

export interface AdminArtwork {
  id: number;
  title: string;
  created_at: string;
  file_count: number;
}

export async function fetchUserArtworks(userId: number, filters?: ArtworkFilters): Promise<AdminArtwork[]> {
  const res = await apiClient.get<{ artworks: AdminArtwork[] }>(`/api/admin/users/${userId}/artworks`, { params: filters });
  return res.data.artworks;
}

export async function fetchUserArtists(userId: number): Promise<{ id: number; name: string }[]> {
  const res = await apiClient.get<{ artists: { id: number; name: string }[] }>(`/api/admin/users/${userId}/artists`);
  return res.data.artists;
}

export async function fetchUserCollections(userId: number): Promise<{ id: number; name: string }[]> {
  const res = await apiClient.get<{ collections: { id: number; name: string }[] }>(`/api/admin/users/${userId}/collections`);
  return res.data.collections;
}

export interface AdminKey {
  key_id: number;
  admin_account: string;
  public_key: string;
  description: string;
}

export async function fetchAdminKeys(): Promise<AdminKey[]> {
  const res = await apiClient.get<{ keys: AdminKey[] }>('/api/admin/keys');
  return res.data.keys;
}

export async function registerAdminKey(public_key: string, description: string): Promise<void> {
  await apiClient.post('/api/admin/keys', { public_key, description });
}

export interface RekeyResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: Array<{ file_id: number; error: string }>;
}

export async function rekeyFiles(
  files: Array<{ file_id: number; new_encrypted_dek: string }>
): Promise<RekeyResult> {
  const res = await apiClient.post<RekeyResult>('/api/admin/rekey-files', { files });
  return res.data;
}
