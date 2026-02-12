import type { User, SessionUser } from './user';

// Generic
export interface ApiError {
  error: string;
  details?: string | Array<{ code: string; message: string; path: string[] }>;
}

// Auth
export interface RegisterRequest {
  email: string;
  display_name: string;
}

export interface RegisterResponse {
  success: true;
  message: string;
  blockchain_account: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface VerifyEmailResponse {
  success: true;
  message: string;
  blockchain_account: string;
}

export interface CreateAccountRequest {
  email: string;
  webauthn_credential_id: string;
  webauthn_public_key: string;
}

export interface CreateAccountResponse {
  success: true;
  user: User;
  token: string;
}

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  success: true;
  user: User & { webauthn_credential_id: string };
  token: string;
}

export interface SessionResponse {
  success: true;
  user: SessionUser;
}

// Chain
export interface ChainInfoResponse {
  success: true;
  chain_info: {
    server_version: string;
    chain_id: string;
    head_block_num: number;
    head_block_id: string;
    head_block_time: string;
  };
}

export interface ChainAccountResponse {
  success: true;
  account: {
    account_name: string;
    ram_quota: number;
    ram_usage: number;
    net_weight: number;
    cpu_weight: number;
    net_limit: { used: number; available: number; max: number };
    cpu_limit: { used: number; available: number; max: number };
  };
}

export interface PushTransactionRequest {
  signatures: string[];
  serializedTransaction: string;
}

export interface PushTransactionResponse {
  success: true;
  transaction_id: string;
  processed: {
    id: string;
    block_num: number;
    block_time: string;
  };
}

export interface TableQueryParams {
  code: string;
  scope: string;
  table: string;
  lower_bound?: string;
  upper_bound?: string;
  limit?: number;
  index_position?: number;
  key_type?: string;
  reverse?: boolean;
}

export interface TableQueryResponse<T = Record<string, unknown>> {
  success: true;
  rows: T[];
  more: boolean;
  next_key: string | null;
}

// Artworks
export interface UploadInitRequest {
  title: string;
  filename: string;
  mime_type: string;
  file_data: string; // base64
  is_thumbnail?: boolean;
}

export interface UploadInitResponse {
  success: true;
  upload_id: string;
  total_chunks: number;
  chunk_size: number;
  file_size: number;
  file_hash: string;
  message: string;
}

export interface UploadChunkRequest {
  upload_id: string;
  chunk_index: number;
  signed_transaction: {
    signatures: string[];
    serializedTransaction: string;
  };
}

export interface UploadChunkResponse {
  success: true;
  transaction_id: string;
  chunk_index: number;
  uploaded_chunks: number;
  total_chunks: number;
  progress: number;
  complete: boolean;
}

export interface UploadCompleteRequest {
  upload_id: string;
  blockchain_artwork_id: number;
  blockchain_file_id: number;
}

export interface UploadCompleteResponse {
  success: true;
  message: string;
  blockchain_artwork_id: number;
  blockchain_file_id: number;
}

export interface ArtworkListResponse {
  success: true;
  artworks: Array<{
    id: number;
    owner: string;
    title: string;
    created_at: string;
  }>;
  count: number;
}

export interface ArtworkFile {
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

export interface ArtworkDetailResponse {
  success: true;
  artwork: {
    id: number;
    owner: string;
    title: string;
    created_at: string;
    files: ArtworkFile[];
  };
}
