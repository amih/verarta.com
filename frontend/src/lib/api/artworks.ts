import { apiClient } from './client';
import type {
  UploadInitRequest,
  UploadInitResponse,
  UploadChunkRequest,
  UploadChunkResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
  ArtworkListResponse,
  ArtworkDetailResponse,
  ArtworkFile,
} from '@/types/api';

export async function uploadInit(data: UploadInitRequest): Promise<UploadInitResponse> {
  const res = await apiClient.post<UploadInitResponse>('/api/artworks/upload-init', data);
  return res.data;
}

export async function uploadChunk(data: UploadChunkRequest): Promise<UploadChunkResponse> {
  const res = await apiClient.post<UploadChunkResponse>('/api/artworks/upload-chunk', data);
  return res.data;
}

export async function uploadComplete(data: UploadCompleteRequest): Promise<UploadCompleteResponse> {
  const res = await apiClient.post<UploadCompleteResponse>('/api/artworks/upload-complete', data);
  return res.data;
}

export async function listArtworks(): Promise<ArtworkListResponse> {
  const res = await apiClient.get<ArtworkListResponse>('/api/artworks/list');
  return res.data;
}

export async function getArtwork(id: number): Promise<ArtworkDetailResponse> {
  const res = await apiClient.get<ArtworkDetailResponse>(`/api/artworks/${id}`);
  return res.data;
}

export async function getFileMetadata(fileId: number): Promise<{ success: true; file: ArtworkFile }> {
  const res = await apiClient.get(`/api/artworks/files/${fileId}`, {
    params: { metadata_only: true },
  });
  return res.data;
}

export function getFileDownloadUrl(fileId: number): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4321';
  return `${base}/api/artworks/files/${fileId}`;
}
