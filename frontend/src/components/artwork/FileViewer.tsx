'use client';

import { useState, useCallback } from 'react';
import { decryptFile, verifyFileHash } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { fetchKeys } from '@/lib/api/auth';
import { downloadFileRaw } from '@/lib/api/artworks';
import { queryTable } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';
import { Download, Eye, Loader2, AlertCircle } from 'lucide-react';

interface FileViewerProps {
  fileId: number;
  filename: string;
  mimeType: string;
}

interface OnChainFileMetadata {
  file_id: number;
  encrypted_dek: string;
  iv: string;
  auth_tag: string; // ephemeral public key
  file_hash: string;
  mime_type: string;
  filename_encrypted: string;
}

export function FileViewer({ fileId, filename, mimeType }: FileViewerProps) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);

  const isImage = mimeType.startsWith('image/');

  const handleDecrypt = useCallback(async () => {
    if (!user) {
      setError('Please log in to view files.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Fetch encryption metadata from on-chain artfiles table
      const tableResult = await queryTable<OnChainFileMetadata>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        lower_bound: fileId.toString(),
        upper_bound: fileId.toString(),
        limit: 1,
      });

      if (tableResult.rows.length === 0) {
        throw new Error('File metadata not found on chain');
      }

      const meta = tableResult.rows[0];

      // 2. Get user's private key
      let keyPair = await getKeyPair(user.email);
      if (!keyPair) {
        const serverKeys = await fetchKeys();
        if (serverKeys) {
          await importEncryptedKeyData(user.email, serverKeys);
          keyPair = await getKeyPair(user.email);
        }
      }
      if (!keyPair) {
        throw new Error('Encryption keys not found. Please re-register or restore keys.');
      }

      // 3. Download encrypted file bytes from backend
      const encryptedBytes = await downloadFileRaw(fileId);

      // 4. Decrypt the file
      const decryptedBuffer = await decryptFile(
        new Uint8Array(encryptedBytes),
        meta.iv,               // nonce
        meta.encrypted_dek,    // encrypted DEK
        meta.auth_tag,         // ephemeral public key
        keyPair.privateKey     // user's X25519 private key
      );

      // 5. Verify hash
      const hashHex = meta.file_hash;
      if (hashHex && hashHex !== '0000000000000000000000000000000000000000000000000000000000000000') {
        const valid = await verifyFileHash(decryptedBuffer, hashHex);
        if (!valid) {
          throw new Error('File integrity check failed. The file may have been tampered with.');
        }
      }

      // 6. Create blob URL for display/download
      const blob = new Blob([decryptedBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Clean up previous URL
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }

      setDecryptedUrl(url);
      setDecryptedBlob(blob);
    } catch (err) {
      console.error('Decryption failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt file');
    } finally {
      setLoading(false);
    }
  }, [fileId, mimeType, user, decryptedUrl]);

  const handleDownload = useCallback(() => {
    if (!decryptedUrl) return;
    const a = document.createElement('a');
    a.href = decryptedUrl;
    a.download = filename;
    a.click();
  }, [decryptedUrl, filename]);

  // Show inline preview for decrypted images
  if (decryptedUrl && isImage) {
    return (
      <div className="space-y-3">
        <img
          src={decryptedUrl}
          alt={filename}
          className="max-h-96 rounded-lg border border-zinc-200 dark:border-zinc-700"
        />
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
    );
  }

  // Show download button for decrypted non-image files
  if (decryptedUrl) {
    return (
      <button
        onClick={handleDownload}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Download className="h-3.5 w-3.5" />
        Download decrypted file
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDecrypt}
        disabled={loading}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Decrypting...
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            View / Download
          </>
        )}
      </button>

      {error && (
        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}
    </div>
  );
}
