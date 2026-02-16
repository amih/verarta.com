import { APIClient, Name } from '@wharfkit/antelope';

// History node for read operations
export const chainClient = new APIClient({
  url: process.env.HISTORY_NODE_URL || 'http://localhost:8888',
});

// Producer node for write operations
export const producerClient = new APIClient({
  url: process.env.PRODUCER_NODE_URL || 'http://localhost:8000',
});

// Chain configuration
export const CHAIN_CONFIG = {
  chainId: process.env.CHAIN_ID || '',
  contractAccount: Name.from('verarta.core'),
  systemAccount: Name.from('eosio'),
};

// Get chain info
export async function getChainInfo() {
  return await chainClient.v1.chain.get_info();
}

// Get account info
export async function getAccount(accountName: string) {
  return await chainClient.v1.chain.get_account(Name.from(accountName));
}

// Get table rows
export async function getTableRows(params: {
  code: string;
  scope: string;
  table: string;
  lower_bound?: string;
  upper_bound?: string;
  limit?: number;
  index_position?: number;
  key_type?: string;
}) {
  return await chainClient.v1.chain.get_table_rows({
    json: true,
    code: params.code,
    scope: params.scope,
    table: params.table,
    lower_bound: params.lower_bound,
    upper_bound: params.upper_bound,
    limit: params.limit || 100,
    index_position: params.index_position,
    key_type: params.key_type,
  });
}

// Push transaction
export async function pushTransaction(serializedTransaction: any) {
  return await producerClient.v1.chain.push_transaction(serializedTransaction);
}
