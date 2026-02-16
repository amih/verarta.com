import { encryptFile } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { getAntelopeKey, signAndPushTransaction } from '@/lib/crypto/antelope';
import { fetchKeys } from '@/lib/api/auth';
import { uploadStart } from '@/lib/api/artworks';
import { uint8ToBase64 } from '@/lib/utils/chunking';
import { useUploadStore } from '@/store/upload';

export interface UploadOptions {
  file: File;
  title: string;
  email: string; // for key retrieval
  blockchainAccount: string; // user's blockchain account name
  adminPublicKeys?: string[]; // base64 X25519 public keys
}

/**
 * Full upload orchestration (new flow):
 * 1. Get user's keys (X25519 for encryption, Antelope for signing)
 * 2. Encrypt file client-side
 * 3. Sign & push `createart` tx from browser
 * 4. Sign & push `addfile` tx from browser (stores encryption metadata on-chain)
 * 5. Send encrypted ciphertext to backend `POST /api/artworks/upload-start`
 * 6. Backend handles chunking + chain writes with service key
 */
export async function uploadArtwork(opts: UploadOptions): Promise<{
  artworkId: number;
  fileId: number;
}> {
  const store = useUploadStore.getState();
  const tempId = `temp-${Date.now()}`;

  try {
    // 0. Get user's X25519 key pair (try local, then server backup)
    console.log('[upload] Getting X25519 keys for', opts.email);
    let keyPair = await getKeyPair(opts.email);
    if (!keyPair) {
      console.log('[upload] No local keys, trying server backup');
      const serverKeys = await fetchKeys();
      if (serverKeys) {
        console.log('[upload] Server keys found, importing');
        await importEncryptedKeyData(opts.email, serverKeys);
        keyPair = await getKeyPair(opts.email);
      }
    }
    if (!keyPair) {
      throw new Error('Encryption keys not found. Please re-register.');
    }
    console.log('[upload] X25519 publicKey length', keyPair.publicKey.length, 'chars (base64)');

    // 0b. Get user's Antelope key for transaction signing
    const antelopeKey = await getAntelopeKey(opts.email);
    if (!antelopeKey) {
      throw new Error('Blockchain signing key not found. Please re-register.');
    }
    console.log('[upload] Antelope key ready');

    // 1. Encrypt the file
    store.setEncrypting(tempId);
    const recipientKeys = [keyPair.publicKey, ...(opts.adminPublicKeys || [])];
    console.log('[upload] Encrypting file with', recipientKeys.length, 'recipient(s)');
    const fileBuffer = await opts.file.arrayBuffer();
    console.log('[upload] File buffer size:', fileBuffer.byteLength);
    const encrypted = await encryptFile(fileBuffer, recipientKeys);
    console.log('[upload] Encryption complete, nonce:', encrypted.nonce.length, 'chars (base64)');

    // 2. Generate unique IDs for artwork and file
    const artworkId = Date.now();
    const fileId = artworkId + 1;

    // 3. Sign & push `createart` tx from browser
    store.startUpload(tempId, 3); // 3 steps: createart, addfile, upload
    store.updateProgress(tempId, 0);

    await signAndPushTransaction(
      'createart',
      {
        artwork_id: artworkId,
        owner: opts.blockchainAccount,
        title_encrypted: btoa(opts.title), // Simple base64 for now
        description_encrypted: '',
        metadata_encrypted: '',
        creator_public_key: keyPair.publicKey,
      },
      opts.blockchainAccount,
      antelopeKey.privateKey
    );

    store.updateProgress(tempId, 1);

    // 4. Sign & push `addfile` tx from browser (encryption metadata on-chain)
    // Convert file hash from hex to the checksum256 format the contract expects
    const hashBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hashBytes[i] = parseInt(encrypted.hash.slice(i * 2, i * 2 + 2), 16);
    }

    await signAndPushTransaction(
      'addfile',
      {
        file_id: fileId,
        artwork_id: artworkId,
        owner: opts.blockchainAccount,
        filename_encrypted: btoa(opts.file.name),
        mime_type: opts.file.type,
        file_size: encrypted.ciphertext.length,
        file_hash: encrypted.hash,
        encrypted_dek: encrypted.encryptedDeks[0].encryptedDek,
        admin_encrypted_deks: encrypted.encryptedDeks.slice(1).map(d => d.encryptedDek),
        iv: encrypted.nonce,
        auth_tag: encrypted.encryptedDeks[0].ephemeralPublicKey,
        is_thumbnail: false,
      },
      opts.blockchainAccount,
      antelopeKey.privateKey
    );

    store.updateProgress(tempId, 2);

    // 5. Send encrypted ciphertext to backend for chunking + chain upload
    store.setCompleting(tempId);
    const ciphertextB64 = uint8ToBase64(encrypted.ciphertext);

    await uploadStart({
      artwork_id: artworkId,
      file_id: fileId,
      title: opts.title,
      filename: opts.file.name,
      mime_type: opts.file.type,
      file_data: ciphertextB64,
    });

    store.completeUpload(tempId);

    return {
      artworkId,
      fileId,
    };
  } catch (err) {
    store.failUpload(tempId, err instanceof Error ? err.message : 'Upload failed');
    throw err;
  }
}
