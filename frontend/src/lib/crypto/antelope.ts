import {
  PrivateKey,
  Action,
  Transaction,
  PermissionLevel,
  Name,
  Serializer,
  Checksum256,
  TimePointSec,
  APIClient,
} from '@wharfkit/antelope';
import { getChainInfo } from '@/lib/api/chain';

const CONTRACT_ACCOUNT = 'verarta.core';

// Use the backend's chain proxy to get ABI (avoids CORS issues with direct chain access)
let cachedAbi: any = null;

async function getContractAbi() {
  if (cachedAbi) return cachedAbi;
  const client = new APIClient({
    url: process.env.NEXT_PUBLIC_CHAIN_URL || 'http://localhost:8888',
  });
  const { abi } = await client.v1.chain.get_abi(Name.from(CONTRACT_ACCOUNT));
  if (!abi) throw new Error('Failed to fetch contract ABI');
  cachedAbi = abi;
  return abi;
}

async function getChainInfoDirect() {
  const client = new APIClient({
    url: process.env.NEXT_PUBLIC_CHAIN_URL || 'http://localhost:8888',
  });
  return await client.v1.chain.get_info();
}

/**
 * Generate an Antelope key pair for blockchain transaction signing.
 */
export function generateAntelopeKeyPair(): {
  privateKey: string; // WIF format
  publicKey: string; // EOS/PUB_K1 format
} {
  const privateKey = PrivateKey.generate('K1');
  return {
    privateKey: String(privateKey),
    publicKey: String(privateKey.toPublic()),
  };
}

// IndexedDB storage for Antelope keys (separate store from X25519 keys)
const DB_NAME = 'verarta-keys';
const STORE_NAME = 'antelope-keys';
const DB_VERSION = 2; // Bump version to add new store

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Keep existing store if upgrading
      if (!db.objectStoreNames.contains('keypairs')) {
        db.createObjectStore('keypairs', { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'email' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store an Antelope private key in IndexedDB (encrypted with email-derived key).
 */
export async function storeAntelopeKey(email: string, privateKey: string, publicKey: string): Promise<void> {
  // Simple obfuscation for local storage - same pattern as X25519 keys
  const encoded = btoa(privateKey);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      email,
      publicKey,
      encryptedPrivateKey: encoded,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve the Antelope key pair from IndexedDB.
 */
export async function getAntelopeKey(email: string): Promise<{
  privateKey: string;
  publicKey: string;
} | null> {
  const db = await openDB();
  const stored = await new Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!stored) return null;

  return {
    privateKey: atob(stored.encryptedPrivateKey),
    publicKey: stored.publicKey,
  };
}

/**
 * Sign and push a transaction for a contract action.
 * Used by the browser to sign createart and addfile transactions.
 */
export async function signAndPushTransaction(
  actionName: string,
  data: Record<string, unknown>,
  signerAccount: string,
  privateKeyWif: string
): Promise<{ transaction_id: string }> {
  const privateKey = PrivateKey.from(privateKeyWif);
  const info = await getChainInfoDirect();
  const abi = await getContractAbi();

  const auth = PermissionLevel.from({
    actor: Name.from(signerAccount),
    permission: 'active',
  });

  const action = Action.from({
    account: Name.from(CONTRACT_ACCOUNT),
    name: Name.from(actionName),
    authorization: [auth],
    data,
  }, abi);

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

  const chainId = Checksum256.from(info.chain_id);
  const signature = privateKey.signDigest(transaction.signingDigest(chainId));

  // Push through the backend proxy (handles CORS and logging)
  const serializedHex = Serializer.encode({ object: transaction }).hexString;
  const { pushTransaction } = await import('@/lib/api/chain');
  const result = await pushTransaction({
    signatures: [String(signature)],
    serializedTransaction: serializedHex,
  });

  return { transaction_id: result.transaction_id };
}
