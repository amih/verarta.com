import { apiClient } from './client';
import type {
  UploadInitRequest,
  UploadInitResponse,
  UploadChunkRequest,
  UploadChunkResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
  UploadStartRequest,
  UploadStartResponse,
  ArtworkListResponse,
  ArtworkDetailResponse,
  ArtworkFile,
} from '@/types/api';
import { decryptDek, encryptDekForRecipient } from '@/lib/crypto/encryption';
import { signAndPushTransaction } from '@/lib/crypto/antelope';
import { queryTable } from '@/lib/api/chain';

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

/**
 * New upload endpoint: browser sends encrypted ciphertext,
 * backend handles chunking + chain writes with service key.
 */
export async function uploadStart(data: UploadStartRequest): Promise<UploadStartResponse> {
  const res = await apiClient.post<UploadStartResponse>('/api/artworks/upload-start', data);
  return res.data;
}

export interface ArtworkFilters {
  q?: string;
  artist_id?: number;
  collection_id?: number;
  era?: string;
}

export async function listArtworks(filters?: ArtworkFilters): Promise<ArtworkListResponse> {
  const res = await apiClient.get<ArtworkListResponse>('/api/artworks/list', { params: filters });
  return res.data;
}

export interface ArtworkExtras {
  title: string | null;
  description_html: string | null;
  creation_date: string | null;
  era: string | null;
  artist_id: number | null;
  collection_id: number | null;
  artist_name: string | null;
  collection_name: string | null;
}

export interface HistoryEvent {
  type: 'created' | 'transferred';
  account?: string;
  from?: string;
  to?: string;
  timestamp: string;
  tx_id?: string;
}

export async function getArtworkExtras(id: number): Promise<ArtworkExtras | null> {
  const res = await apiClient.get<{ extras: ArtworkExtras | null }>(`/api/artworks/${id}/extras`);
  return res.data.extras;
}

export async function saveArtworkExtras(
  id: number,
  data: Partial<Omit<ArtworkExtras, 'artist_name' | 'collection_name'>>
): Promise<void> {
  await apiClient.put(`/api/artworks/${id}/extras`, data);
}

export async function getArtworkHistory(id: number): Promise<{ events: HistoryEvent[] }> {
  const res = await apiClient.get<{ events: HistoryEvent[] }>(`/api/artworks/${id}/history`);
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

/**
 * Download a file's raw encrypted bytes from the backend.
 */
export async function downloadFileRaw(fileId: number): Promise<ArrayBuffer> {
  const res = await apiClient.get(`/api/artworks/files/${fileId}/download`, {
    responseType: 'arraybuffer',
  });
  return res.data;
}

interface OnChainFile {
  file_id: number;
  artwork_id: number;
  iv: string;
  encrypted_dek: string;
  auth_tag: string;
  [key: string]: unknown;
}

/**
 * Transfer artwork ownership to another account.
 * Re-encrypts each file's DEK for the recipient's X25519 key, then pushes
 * a `transferart` transaction to the chain.
 */
export async function transferArtwork(
  artworkId: number,
  files: ArtworkFile[],
  fromAccount: string,
  toAccount: string,
  recipientX25519PublicKey: string,
  userX25519PrivateKey: string,
  antelopePrivateKeyWif: string
): Promise<{ transaction_id: string }> {
  const uploadedFiles = files.filter((f) => f.upload_complete);

  const results = await Promise.all(
    uploadedFiles.map(async (file) => {
      // Fetch on-chain file record to get iv, encrypted_dek, auth_tag
      const tableResult = await queryTable<OnChainFile>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        key_type: 'i64',
        lower_bound: String(file.id),
        upper_bound: String(BigInt(file.id) + 1n),
        limit: 1,
      });

      const onChain = tableResult.rows.find((r) => r.file_id === file.id);
      if (!onChain) {
        throw new Error(`On-chain file record not found for file_id=${file.id}`);
      }

      // Decrypt the DEK with the current owner's private key
      const dek = await decryptDek(
        onChain.encrypted_dek,
        onChain.iv,
        onChain.auth_tag,
        userX25519PrivateKey
      );

      // Re-encrypt the DEK for the recipient
      const { encryptedDek: newEncryptedDek, ephemeralPublicKey: newAuthTag } =
        await encryptDekForRecipient(dek, onChain.iv, recipientX25519PublicKey);

      return {
        file_id: file.id,
        new_encrypted_dek: newEncryptedDek,
        new_auth_tag: newAuthTag,
      };
    })
  );

  const file_ids = results.map((r) => r.file_id);
  const new_encrypted_deks = results.map((r) => r.new_encrypted_dek);
  const new_auth_tags = results.map((r) => r.new_auth_tag);

  return signAndPushTransaction(
    'transferart',
    {
      artwork_id: artworkId,
      from: fromAccount,
      to: toAccount,
      file_ids,
      new_encrypted_deks,
      new_auth_tags,
    },
    fromAccount,
    antelopePrivateKeyWif
  );
}
