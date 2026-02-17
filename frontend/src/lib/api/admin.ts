import { apiClient } from './client';

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
