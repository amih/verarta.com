import { apiClient } from './client';
import type {
  ChainInfoResponse,
  ChainAccountResponse,
  PushTransactionRequest,
  PushTransactionResponse,
  TableQueryParams,
  TableQueryResponse,
} from '@/types/api';

// Explorer types
export interface BlockSummary {
  block_num: number;
  timestamp: string;
  producer: string;
  tx_count: number;
}

export interface BlockDetail {
  block_num: number;
  block_id: string;
  timestamp: string;
  producer: string;
  transactions: Array<{
    id: string;
    status: string;
    actions: Array<{
      account: string;
      name: string;
      authorization: Array<{ actor: string; permission: string }>;
      data: Record<string, unknown>;
    }>;
  }>;
}

export interface ChainStats {
  head_block_num: number;
  head_block_time: string;
  chain_id: string;
  server_version: string;
  total_artworks: number;
  total_files: number;
}

export interface HyperionAction {
  act: {
    account: string;
    name: string;
    authorization: Array<{ actor: string; permission: string }>;
    data: Record<string, unknown>;
  };
  trx_id: string;
  block_num: number;
  timestamp: string;
  '@timestamp'?: string;
}

export interface ActionsSearchParams {
  account?: string;
  filter?: string;
  skip?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

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

// Explorer API functions

export async function getBlock(blockNum: number): Promise<{ success: true; block: BlockDetail }> {
  const res = await apiClient.get(`/api/chain/block/${blockNum}`);
  return res.data;
}

export async function getRecentBlocks(limit = 20): Promise<{ success: true; head_block_num: number; blocks: BlockSummary[] }> {
  const res = await apiClient.get('/api/chain/blocks-recent', { params: { limit } });
  return res.data;
}

export async function getChainStats(): Promise<{ success: true; stats: ChainStats }> {
  const res = await apiClient.get('/api/chain/stats');
  return res.data;
}

export async function getActions(params: ActionsSearchParams): Promise<{ success: true; actions: HyperionAction[]; total: number }> {
  const res = await apiClient.get('/api/chain/actions', { params });
  return res.data;
}

export async function getTransaction(id: string): Promise<{ success: true; transaction: any }> {
  const res = await apiClient.get(`/api/chain/transaction/${id}`);
  return res.data;
}
