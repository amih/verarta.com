'use client';

import { useState, useEffect } from 'react';
import { FileIcon, Loader2 } from 'lucide-react';
import { decryptFile } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { fetchKeys } from '@/lib/api/auth';
import { downloadFileRaw } from '@/lib/api/artworks';
import { queryTable } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';

interface OnChainFileMetadata {
  file_id: number;
  encrypted_dek: string;
  iv: string;
  auth_tag: string;
  file_hash: string;
  mime_type: string;
  filename_encrypted: string;
}

interface ArtworkThumbnailProps {
  fileId: string;
  mimeType: string;
}

export function ArtworkThumbnail({ fileId, mimeType }: ArtworkThumbnailProps) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;

    async function decrypt() {
      try {
        const tableResult = await queryTable<OnChainFileMetadata>({
          code: 'verarta.core',
          scope: 'verarta.core',
          table: 'artfiles',
          key_type: 'i64',
          lower_bound: fileId,
          limit: 1,
        });

        if (
          tableResult.rows.length === 0 ||
          String(tableResult.rows[0].file_id) !== String(fileId)
        ) {
          setLoading(false);
          return;
        }

        const meta = tableResult.rows[0];

        let keyPair = await getKeyPair(user!.email);
        if (!keyPair) {
          const serverKeys = await fetchKeys();
          if (serverKeys) {
            await importEncryptedKeyData(user!.email, serverKeys);
            keyPair = await getKeyPair(user!.email);
          }
        }
        if (!keyPair) {
          setLoading(false);
          return;
        }

        const encryptedBytes = await downloadFileRaw(Number(fileId));
        const decryptedBuffer = await decryptFile(
          new Uint8Array(encryptedBytes),
          meta.iv,
          meta.encrypted_dek,
          meta.auth_tag,
          keyPair.privateKey
        );

        const blob = new Blob([decryptedBuffer], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        setDecryptedUrl(objectUrl);
      } catch {
        // silent fallback — FileIcon will show
      } finally {
        setLoading(false);
      }
    }

    decrypt();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, mimeType, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (decryptedUrl) {
    return (
      <div className="mb-3 h-32 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
        <img
          src={decryptedUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
      <FileIcon className="h-10 w-10 text-zinc-400" />
    </div>
  );
}
