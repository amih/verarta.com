import { apiClient } from './client';
import type {
  ChainInfoResponse,
  ChainAccountResponse,
  PushTransactionRequest,
  PushTransactionResponse,
  TableQueryParams,
  TableQueryResponse,
} from '@/types/api';

export async function getChainInfo(): Promise<ChainInfoResponse> {
  const res = await apiClient.get<ChainInfoResponse>('/api/chain/info');
  return res.data;
}

export async function getAccount(name: string): Promise<ChainAccountResponse> {
  const res = await apiClient.get<ChainAccountResponse>(`/api/chain/account/${name}`);
  return res.data;
}

export async function pushTransaction(data: PushTransactionRequest): Promise<PushTransactionResponse> {
  const res = await apiClient.post<PushTransactionResponse>('/api/chain/transaction', data);
  return res.data;
}

export async function queryTable<T = Record<string, unknown>>(
  params: TableQueryParams
): Promise<TableQueryResponse<T>> {
  const res = await apiClient.get<TableQueryResponse<T>>('/api/chain/tables', { params });
  return res.data;
}
