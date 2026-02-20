'use client';

import { useState, useCallback, useEffect } from 'react';
import { decryptFile, verifyFileHash } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { fetchKeys } from '@/lib/api/auth';
import { downloadFileRaw } from '@/lib/api/artworks';
import { fetchAdminKeys } from '@/lib/api/admin';
import { queryTable } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';
import { Download, Eye, Loader2, AlertCircle } from 'lucide-react';

interface FileViewerProps {
  fileId: number;
  filename: string;
  mimeType: string;
  autoDecrypt?: boolean;
}

interface OnChainFileMetadata {
  file_id: number;
  encrypted_dek: string;
  admin_encrypted_deks: string[];
  iv: string;
  auth_tag: string; // ephemeral public key
  file_hash: string;
  mime_type: string;
  filename_encrypted: string;
}

export function FileViewer({ fileId, filename, mimeType, autoDecrypt }: FileViewerProps) {
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
      // 1. Fetch encryption metadata from on-chain artfiles table.
      // upper_bound is exclusive — use limit 1 and verify the returned row matches.
      const tableResult = await queryTable<OnChainFileMetadata>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        key_type: 'i64',
        lower_bound: fileId.toString(),
        limit: 1,
      });

      if (tableResult.rows.length === 0 || String(tableResult.rows[0].file_id) !== String(fileId)) {
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

      // 4. Decrypt the file — try user key first, then admin key fallback
      let decryptedBuffer: ArrayBuffer;
      try {
        decryptedBuffer = await decryptFile(
          new Uint8Array(encryptedBytes),
          meta.iv,
          meta.encrypted_dek,
          meta.auth_tag,
          keyPair.privateKey
        );
      } catch (userDecryptErr) {
        if (!user.is_admin) throw userDecryptErr;

        // Admin fallback: find this admin's key in the registered admin keys list
        const adminKeys = await fetchAdminKeys();
        const myKeyIndex = adminKeys.findIndex((k) => k.public_key === keyPair.publicKey);
        if (myKeyIndex === -1) {
          throw new Error('Your key is not registered as an admin key. Go to Admin → register your key first.');
        }
        const adminEncryptedDek = meta.admin_encrypted_deks[myKeyIndex];
        if (!adminEncryptedDek) {
          throw new Error('No admin-encrypted DEK found for your key index. The file may have been uploaded before admin key escrow was configured.');
        }
        decryptedBuffer = await decryptFile(
          new Uint8Array(encryptedBytes),
          meta.iv,
          adminEncryptedDek,
          meta.auth_tag,
          keyPair.privateKey
        );
      }

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

  useEffect(() => {
    if (autoDecrypt && user && !decryptedUrl) {
      handleDecrypt();
    }
  }, [autoDecrypt, user]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Decrypting…
          </div>
        )}
        <img
          src={decryptedUrl}
          alt={filename}
          className="w-full rounded-lg object-contain"
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

  // While auto-decrypting, show a spinner instead of the button
  if (autoDecrypt && loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Decrypting image…
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
