import { apiClient } from './client';

export async function searchUsers(q: string): Promise<{
  users: Array<{ blockchain_account: string; display_name: string }>;
}> {
  const res = await apiClient.get('/api/users/search', { params: { q } });
  return res.data;
}
