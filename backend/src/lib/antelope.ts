import {
  APIClient,
  Name,
  Action,
  Transaction,
  SignedTransaction,
  PackedTransaction,
  PermissionLevel,
  PrivateKey,
  Checksum256,
  TimePointSec,
} from '@wharfkit/antelope';

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

// Service key for server-side transaction signing (uploadchunk, completefile)
function getServiceKey(): PrivateKey {
  const key = process.env.SERVICE_PRIVATE_KEY;
  if (!key) {
    throw new Error('SERVICE_PRIVATE_KEY not configured');
  }
  return PrivateKey.from(key);
}

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

/**
 * Build, sign, and push a transaction using the service key.
 * Used for uploadchunk and completefile actions that the server handles.
 */
export async function buildAndSignTransaction(
  actionName: string,
  data: Record<string, unknown>,
  authorization?: PermissionLevel
): Promise<{ transaction_id: string }> {
  const info = await chainClient.v1.chain.get_info();
  const contractAccount = CHAIN_CONFIG.contractAccount;
  const serviceKey = getServiceKey();

  const auth = authorization || PermissionLevel.from({
    actor: contractAccount,
    permission: 'active',
  });

  // Get the ABI to properly serialize the action data
  const { abi } = await chainClient.v1.chain.get_abi(contractAccount);
  if (!abi) {
    throw new Error('Failed to fetch contract ABI');
  }

  const action = Action.from({
    account: contractAccount,
    name: Name.from(actionName),
    authorization: [auth],
    data,
  }, abi);

  // Build transaction header
  const expiration = TimePointSec.fromMilliseconds(
    info.head_block_time.toMilliseconds() + 60000
  );

  const transaction = Transaction.from({
    expiration,
    ref_block_num: info.head_block_num.value & 0xffff,
    ref_block_prefix: info.head_block_id.array.slice(8, 12).reduce(
      (val: number, byte: number, i: number) => val | (byte << (i * 8)),
      0
    ) >>> 0,
    actions: [action],
  });

  // Sign
  const chainId = Checksum256.from(info.chain_id);
  const signature = serviceKey.signDigest(transaction.signingDigest(chainId));

  // Push — must use PackedTransaction, not a raw object, or wharfkit will try
  // to decode it as SignedTransaction and fail looking for 'expiration'.
  const signedTx = SignedTransaction.from({ ...transaction, signatures: [signature] });
  const result = await producerClient.v1.chain.push_transaction(
    PackedTransaction.fromSigned(signedTx)
  );

  return { transaction_id: String(result.transaction_id) };
}

/**
 * Create a blockchain account for a new user.
 * Uses the system `newaccount` action with the service key,
 * then stakes resources for the new account.
 */
export async function createBlockchainAccount(
  accountName: string,
  userAntelopePublicKey: string
): Promise<void> {
  const info = await chainClient.v1.chain.get_info();
  const serviceKey = getServiceKey();
  const contractAccount = CHAIN_CONFIG.contractAccount;
  const systemAccount = CHAIN_CONFIG.systemAccount;

  const auth = PermissionLevel.from({
    actor: contractAccount,
    permission: 'active',
  });

  // Get system ABI for newaccount
  const { abi: systemAbi } = await chainClient.v1.chain.get_abi(systemAccount);
  if (!systemAbi) {
    throw new Error('Failed to fetch system ABI');
  }

  const newAccountAction = Action.from({
    account: systemAccount,
    name: Name.from('newaccount'),
    authorization: [auth],
    data: {
      creator: contractAccount,
      name: Name.from(accountName),
      owner: {
        threshold: 1,
        keys: [{ key: userAntelopePublicKey, weight: 1 }],
        accounts: [],
        waits: [],
      },
      active: {
        threshold: 1,
        keys: [{ key: userAntelopePublicKey, weight: 1 }],
        accounts: [],
        waits: [],
      },
    },
  }, systemAbi);

  const expiration = TimePointSec.fromMilliseconds(
    info.head_block_time.toMilliseconds() + 60000
  );

  const transaction = Transaction.from({
    expiration,
    ref_block_num: info.head_block_num.value & 0xffff,
    ref_block_prefix: info.head_block_id.array.slice(8, 12).reduce(
      (val: number, byte: number, i: number) => val | (byte << (i * 8)),
      0
    ) >>> 0,
    actions: [newAccountAction],
  });

  const chainId = Checksum256.from(info.chain_id);
  const signature = serviceKey.signDigest(transaction.signingDigest(chainId));

  const signedTx = SignedTransaction.from({
    ...transaction,
    signatures: [signature],
  });

  await producerClient.v1.chain.push_transaction(
    PackedTransaction.fromSigned(signedTx)
  );
}
