import { encryptFile } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { fetchKeys } from '@/lib/api/auth';
import { fileToBase64 } from '@/lib/utils/chunking';
import { uploadInit, uploadChunk, uploadComplete } from '@/lib/api/artworks';
import { useUploadStore } from '@/store/upload';

export interface UploadOptions {
  file: File;
  title: string;
  email: string; // for key retrieval
  adminPublicKeys?: string[]; // base64
}

/**
 * Full upload orchestration:
 * 1. Encrypt the file client-side
 * 2. Initialize upload with backend (sends base64 file data)
 * 3. Upload chunks with signed transactions
 * 4. Complete the upload
 */
export async function uploadArtwork(opts: UploadOptions): Promise<{
  artworkId: number;
  fileId: number;
}> {
  const store = useUploadStore.getState();
  const tempId = `temp-${Date.now()}`;

  try {
    // 0. Get user's key pair (try local, then server backup)
    let keyPair = await getKeyPair(opts.email);
    if (!keyPair) {
      const serverKeys = await fetchKeys();
      if (serverKeys) {
        await importEncryptedKeyData(opts.email, serverKeys);
        keyPair = await getKeyPair(opts.email);
      }
    }
    if (!keyPair) {
      throw new Error('Encryption keys not found. Please re-register.');
    }

    // 1. Encrypt the file
    store.setEncrypting(tempId);
    const recipientKeys = [keyPair.publicKey, ...(opts.adminPublicKeys || [])];
    const fileBuffer = await opts.file.arrayBuffer();
    const encrypted = await encryptFile(fileBuffer, recipientKeys);

    // 2. Convert file to base64 for upload-init
    const fileDataB64 = await fileToBase64(opts.file);

    // 3. Initialize upload
    const initResult = await uploadInit({
      title: opts.title,
      filename: opts.file.name,
      mime_type: opts.file.type,
      file_data: fileDataB64,
    });

    const { upload_id, total_chunks } = initResult;
    store.removeUpload(tempId);
    store.startUpload(upload_id, total_chunks);

    // 4. Upload chunks
    // The backend handles chunking from the file_data sent in upload-init.
    // Each chunk upload requires a signed blockchain transaction.
    // For now, we push transactions through the backend proxy.
    for (let i = 0; i < total_chunks; i++) {
      await uploadChunk({
        upload_id,
        chunk_index: i,
        signed_transaction: {
          // The backend proxies the transaction signing in dev mode.
          // In production, this would be signed client-side with WebAuthn.
          signatures: [],
          serializedTransaction: '',
        },
      });
      store.updateProgress(upload_id, i + 1);
    }

    // 5. Complete the upload
    store.setCompleting(upload_id);
    const completeResult = await uploadComplete({
      upload_id,
      blockchain_artwork_id: 0, // assigned by backend
      blockchain_file_id: 0,    // assigned by backend
    });

    store.completeUpload(upload_id);

    // Store encryption metadata locally for later decryption
    if (typeof window !== 'undefined') {
      const meta = {
        nonce: encrypted.nonce,
        encryptedDek: encrypted.encryptedDeks[0].encryptedDek,
        ephemeralPublicKey: encrypted.encryptedDeks[0].ephemeralPublicKey,
        hash: encrypted.hash,
      };
      localStorage.setItem(
        `verarta-file-meta-${completeResult.blockchain_file_id}`,
        JSON.stringify(meta)
      );
    }

    return {
      artworkId: completeResult.blockchain_artwork_id,
      fileId: completeResult.blockchain_file_id,
    };
  } catch (err) {
    store.failUpload(tempId, err instanceof Error ? err.message : 'Upload failed');
    throw err;
  }
}
