import sodium from 'libsodium-wrappers';

let sodiumReady = false;

async function ensureSodium() {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

export interface KeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

export async function generateKeyPair(): Promise<KeyPair> {
  await ensureSodium();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(keyPair.privateKey, sodium.base64_variants.ORIGINAL),
  };
}

// IndexedDB key storage
const DB_NAME = 'verarta-keys';
const STORE_NAME = 'keypairs';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains('antelope-keys')) {
        db.createObjectStore('antelope-keys', { keyPath: 'email' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeKeyPair(email: string, keyPair: KeyPair): Promise<void> {
  await ensureSodium();

  // Derive an encryption key from the email (simple key-wrapping for local storage)
  // In production, this should use a user PIN or biometric-derived key
  const salt = sodium.from_string(email);
  const key = sodium.crypto_generichash(
    sodium.crypto_secretbox_KEYBYTES,
    sodium.from_string('verarta-local-key'),
    salt
  );

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(
    sodium.from_base64(keyPair.privateKey, sodium.base64_variants.ORIGINAL),
    nonce,
    key
  );

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      email,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
      nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getKeyPair(email: string): Promise<KeyPair | null> {
  await ensureSodium();
  const db = await openDB();

  const stored = await new Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    nonce: string;
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!stored) return null;

  const salt = sodium.from_string(email);
  const key = sodium.crypto_generichash(
    sodium.crypto_secretbox_KEYBYTES,
    sodium.from_string('verarta-local-key'),
    salt
  );

  const nonce = sodium.from_base64(stored.nonce, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.from_base64(stored.encryptedPrivateKey, sodium.base64_variants.ORIGINAL);

  console.log('[keys] getKeyPair: secretbox nonce length', nonce.length, 'expected', sodium.crypto_secretbox_NONCEBYTES);

  let privateKeyBytes: Uint8Array;
  try {
    privateKeyBytes = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);
  } catch (err) {
    throw new Error(`getKeyPair: crypto_secretbox_open_easy failed (nonce=${nonce.length}B, encrypted=${encrypted.length}B, key=${key.length}B): ${err}`);
  }

  return {
    publicKey: stored.publicKey,
    privateKey: sodium.to_base64(privateKeyBytes, sodium.base64_variants.ORIGINAL),
  };
}

export async function deleteKeyPair(email: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(email);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get the encrypted key data (for server backup)
export async function getEncryptedKeyData(email: string): Promise<{
  publicKey: string;
  encryptedPrivateKey: string;
  nonce: string;
} | null> {
  const db = await openDB();
  const stored = await new Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    nonce: string;
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return stored || null;
}

// Import encrypted key data from server backup into local IndexedDB
export async function importEncryptedKeyData(
  email: string,
  data: { publicKey: string; encryptedPrivateKey: string; nonce: string }
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      email,
      publicKey: data.publicKey,
      encryptedPrivateKey: data.encryptedPrivateKey,
      nonce: data.nonce,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
