export interface Artwork {
  id: number;
  owner: string;
  title: string;
  created_at: string;
}

export interface ArtworkDetail extends Artwork {
  files: ArtworkFileInfo[];
}

export interface ArtworkFileInfo {
  id: number;
  artwork_id: number;
  filename: string;
  mime_type: string;
  file_hash: string;
  file_size: number;
  uploaded_chunks: number;
  total_chunks: number;
  upload_complete: boolean;
  owner: string;
}

export interface UploadProgress {
  uploadId: string;
  uploadedChunks: number;
  totalChunks: number;
  status: 'encrypting' | 'uploading' | 'completing' | 'completed' | 'error';
  error?: string;
}

export interface ArtworkMetadata {
  title: string;
  description?: string;
  tags?: string[];
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
