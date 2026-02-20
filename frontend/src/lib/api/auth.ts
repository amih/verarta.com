import { apiClient } from './client';
import type {
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  LoginRequest,
  LoginResponse,
  SessionResponse,
} from '@/types/api';

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const res = await apiClient.post<RegisterResponse>('/api/auth/register', data);
  return res.data;
}

export async function verifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  const res = await apiClient.post<VerifyEmailResponse>('/api/auth/verify-email', data);
  return res.data;
}

export async function createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
  const res = await apiClient.post<CreateAccountResponse>('/api/auth/create-account', data);
  if (res.data.token) {
    localStorage.setItem('auth_token', res.data.token);
  }
  return res.data;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/api/auth/login', data);
  if (res.data.token) {
    localStorage.setItem('auth_token', res.data.token);
  }
  return res.data;
}

export async function getSession(): Promise<SessionResponse> {
  const res = await apiClient.get<SessionResponse>('/api/auth/session');
  return res.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
  localStorage.removeItem('auth_token');
}

export async function backupKeys(data: {
  publicKey: string;
  encryptedPrivateKey: string;
  nonce: string;
  antelopePublicKey?: string;
  antelopeEncryptedPrivateKey?: string;
  antelopeKeyNonce?: string;
}): Promise<void> {
  await apiClient.post('/api/auth/keys', data);
}

export async function fetchKeys(): Promise<{
  publicKey: string;
  encryptedPrivateKey: string;
  nonce: string;
  antelopePublicKey?: string;
  antelopeEncryptedPrivateKey?: string;
  antelopeKeyNonce?: string;
} | null> {
  try {
    const res = await apiClient.get('/api/auth/keys');
    return res.data;
  } catch {
    return null;
  }
}
