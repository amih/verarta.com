import { apiClient } from './client';

export interface Collection {
  id: number;
  name: string;
}

export async function fetchCollections(): Promise<Collection[]> {
  const res = await apiClient.get<{ collections: Collection[] }>('/api/collections');
  return res.data.collections;
}

export async function createCollection(name: string): Promise<Collection> {
  const res = await apiClient.post<{ collection: Collection }>('/api/collections', { name });
  return res.data.collection;
}
