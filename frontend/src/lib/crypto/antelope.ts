import {
  PrivateKey,
  Action,
  Transaction,
  PermissionLevel,
  Name,
  Serializer,
  Checksum256,
  TimePointSec,
} from '@wharfkit/antelope';
import sodium from 'libsodium-wrappers';
import { getChainInfo } from '@/lib/api/chain';
import { apiClient } from '@/lib/api/client';

const CONTRACT_ACCOUNT = 'verarta.core';

// Fetch ABI through the backend proxy (the chain node is not publicly exposed)
let cachedAbi: any = null;

async function getContractAbi() {
  if (cachedAbi) return cachedAbi;
  const res = await apiClient.get<{ success: true; abi: any }>('/api/chain/abi');
  cachedAbi = res.data.abi;
  return cachedAbi;
}

// Fetch chain info through the backend proxy and reconstruct wharfkit types
async function getChainInfoDirect() {
  const { chain_info } = await getChainInfo();
  return {
    head_block_time: TimePointSec.from(chain_info.head_block_time),
    head_block_num: { value: chain_info.head_block_num },
    head_block_id: Checksum256.from(chain_info.head_block_id),
    chain_id: chain_info.chain_id,
  };
}

let sodiumReady = false;

async function ensureSodium() {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

function deriveKey(email: string): Uint8Array {
  const salt = sodium.from_string(email);
  return sodium.crypto_generichash(
    sodium.crypto_secretbox_KEYBYTES,
    sodium.from_string('verarta-antelope-key'),
    salt
  );
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
 * Check if an account's owner permission includes verarta.core@active.
 * If not, the account needs migration before new device keys can be added.
 */
export async function needsOwnerMigration(accountName: string): Promise<boolean> {
  const { getAccount } = await import('@/lib/api/chain');
  const accountData = await getAccount(accountName);
  const account = accountData.account as any;
  const ownerPerm = account.permissions?.find(
    (p: any) => p.perm_name === 'owner' || String(p.perm_name) === 'owner'
  );
  if (!ownerPerm) return true;
  const accounts = ownerPerm.required_auth.accounts || [];
  return !accounts.some(
    (a: any) =>
      String(a.permission.actor) === CONTRACT_ACCOUNT &&
      String(a.permission.permission) === 'active'
  );
}

/**
 * Store an Antelope private key in IndexedDB (encrypted with email-derived key via crypto_secretbox).
 */
export async function storeAntelopeKey(email: string, privateKey: string, publicKey: string): Promise<void> {
  await ensureSodium();
  const key = deriveKey(email);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(
    sodium.from_string(privateKey),
    nonce,
    key
  );

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      email,
      publicKey,
      encryptedPrivateKey: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
      nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve the Antelope key pair from IndexedDB.
 * Handles migration from old btoa format (no nonce field) to crypto_secretbox.
 */
export async function getAntelopeKey(email: string): Promise<{
  privateKey: string;
  publicKey: string;
} | null> {
  await ensureSodium();
  const db = await openDB();
  const stored = await new Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    nonce?: string;
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!stored) return null;

  // Migration: old format has no nonce field (btoa-encoded)
  if (!stored.nonce) {
    const privateKey = atob(stored.encryptedPrivateKey);
    // Re-encrypt with crypto_secretbox and store
    await storeAntelopeKey(email, privateKey, stored.publicKey);
    return { privateKey, publicKey: stored.publicKey };
  }

  const key = deriveKey(email);
  const nonce = sodium.from_base64(stored.nonce, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.from_base64(stored.encryptedPrivateKey, sodium.base64_variants.ORIGINAL);

  let privateKeyBytes: Uint8Array;
  try {
    privateKeyBytes = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);
  } catch (err) {
    throw new Error(`getAntelopeKey: crypto_secretbox_open_easy failed: ${err}`);
  }

  return {
    privateKey: sodium.to_string(privateKeyBytes),
    publicKey: stored.publicKey,
  };
}

/**
 * Get encrypted Antelope key data from IndexedDB (for server backup).
 */
export async function getEncryptedAntelopeKeyData(email: string): Promise<{
  antelopePublicKey: string;
  antelopeEncryptedPrivateKey: string;
  antelopeKeyNonce: string;
} | null> {
  await ensureSodium();
  const db = await openDB();
  const stored = await new Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    nonce?: string;
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!stored || !stored.nonce) return null;

  return {
    antelopePublicKey: stored.publicKey,
    antelopeEncryptedPrivateKey: stored.encryptedPrivateKey,
    antelopeKeyNonce: stored.nonce,
  };
}

/**
 * Import encrypted Antelope key data from server backup into local IndexedDB.
 */
export async function importEncryptedAntelopeKeyData(
  email: string,
  data: { antelopePublicKey: string; antelopeEncryptedPrivateKey: string; antelopeKeyNonce: string }
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      email,
      publicKey: data.antelopePublicKey,
      encryptedPrivateKey: data.antelopeEncryptedPrivateKey,
      nonce: data.antelopeKeyNonce,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Fetch system ABI through backend proxy (for updateauth)
let cachedSystemAbi: any = null;

async function getSystemAbi() {
  if (cachedSystemAbi) return cachedSystemAbi;
  const res = await apiClient.get<{ success: true; abi: any }>('/api/chain/system-abi');
  cachedSystemAbi = res.data.abi;
  return cachedSystemAbi;
}

/**
 * Migrate an existing account's owner permission to include verarta.core@active.
 * This allows the platform to add new device keys via updateauth.
 * Must be called from the original device that has the owner key.
 */
export async function migrateOwnerPermission(
  accountName: string,
  privateKeyWif: string
): Promise<{ transaction_id: string }> {
  const privateKey = PrivateKey.from(privateKeyWif);
  const info = await getChainInfoDirect();
  const systemAbi = await getSystemAbi();

  // Fetch current account to get existing owner permission
  const { getAccount } = await import('@/lib/api/chain');
  const accountData = await getAccount(accountName);
  const account = accountData.account;

  const ownerPerm = (account as any).permissions?.find(
    (p: any) => p.perm_name === 'owner' || String(p.perm_name) === 'owner'
  );
  if (!ownerPerm) {
    throw new Error('Account has no owner permission');
  }

  // Check if verarta.core@active is already present
  const existingAccounts = ownerPerm.required_auth.accounts || [];
  const alreadyHas = existingAccounts.some(
    (a: any) =>
      (String(a.permission.actor) === CONTRACT_ACCOUNT) &&
      (String(a.permission.permission) === 'active')
  );
  if (alreadyHas) {
    return { transaction_id: 'already_migrated' };
  }

  // Build new owner permission with verarta.core@active added
  const existingKeys = ownerPerm.required_auth.keys.map((k: any) => ({
    key: String(k.key),
    weight: Number(k.weight),
  }));
  const newAccounts = [
    ...existingAccounts.map((a: any) => ({
      permission: {
        actor: Name.from(String(a.permission.actor)),
        permission: Name.from(String(a.permission.permission)),
      },
      weight: Number(a.weight),
    })),
    {
      permission: {
        actor: Name.from(CONTRACT_ACCOUNT),
        permission: Name.from('active'),
      },
      weight: 1,
    },
  ];

  const auth = PermissionLevel.from({
    actor: Name.from(accountName),
    permission: 'owner',
  });

  const updateAuthAction = Action.from({
    account: Name.from('eosio'),
    name: Name.from('updateauth'),
    authorization: [auth],
    data: {
      account: Name.from(accountName),
      permission: Name.from('owner'),
      parent: Name.from(''),
      auth: {
        threshold: 1,
        keys: existingKeys,
        accounts: newAccounts,
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
    actions: [updateAuthAction],
  });

  const chainId = Checksum256.from(info.chain_id);
  const signature = privateKey.signDigest(transaction.signingDigest(chainId));

  const serializedHex = Serializer.encode({ object: transaction }).hexString;
  const { pushTransaction } = await import('@/lib/api/chain');
  const result = await pushTransaction({
    signatures: [String(signature)],
    serializedTransaction: serializedHex,
  });

  return { transaction_id: result.transaction_id };
}

/**
 * Call the backend to add this device's public key to the account's active permission.
 * Returns { added: true } if key was added, { added: false } if already present.
 * Throws with error 'owner_migration_required' if the account needs migration first.
 */
export async function addDeviceKey(publicKey: string): Promise<{ added: boolean }> {
  const res = await apiClient.post<{ success: boolean; added: boolean }>(
    '/api/auth/add-device-key',
    { antelope_public_key: publicKey }
  );
  return { added: res.data.added };
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
