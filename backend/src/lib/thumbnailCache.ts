import { join } from 'path';
import { writeFile, mkdir, access } from 'fs/promises';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { getTableRows } from './antelope.js';
import { decryptDek, decryptFile } from './crypto.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');

/**
 * Find the thumbnail file for an artwork on the blockchain.
 * Returns the file metadata row if found.
 */
async function findThumbnailFile(artworkId: string): Promise<any | null> {
  // Query artfiles by artwork_id using secondary index (byartwork)
  const result = await getTableRows({
    code: 'verarta.core',
    scope: 'verarta.core',
    table: 'artfiles',
    key_type: 'i64',
    lower_bound: artworkId,
    upper_bound: artworkId,
    limit: 50,
    index_position: 2, // byartwork secondary index
  });

  // Find the thumbnail file (is_thumbnail = 1/true)
  const thumbFile = result.rows.find((row: any) =>
    String(row.artwork_id) === artworkId && row.is_thumbnail
  );

  return thumbFile || null;
}

/**
 * Reassemble encrypted file from blockchain chunks.
 */
async function reassembleFile(fileId: string, totalChunks: number): Promise<Buffer> {
  const chunkResult = await getTableRows({
    code: 'verarta.core',
    scope: 'verarta.core',
    table: 'artchunks',
    key_type: 'i64',
    lower_bound: fileId,
    upper_bound: fileId,
    limit: totalChunks + 10,
    index_position: 2, // byfile secondary index
  });

  const chunks: Buffer[] = (chunkResult.rows as any[])
    .filter((c: any) => String(c.file_id) === fileId)
    .sort((a: any, b: any) => a.chunk_index - b.chunk_index)
    .map((chunk: any) => Buffer.from(chunk.chunk_data, 'base64'));

  if (chunks.length === 0) {
    throw new Error(`No chunks found for file ${fileId}`);
  }

  return Buffer.concat(chunks);
}

/**
 * Decrypt an on-chain thumbnail using the service admin key,
 * process it with Sharp, and cache it to disk.
 *
 * Returns the public URL path (e.g. /api/uploads/thumbnails/abc123.webp) or null if failed.
 */
export async function generateCachedThumbnail(artworkId: string): Promise<string | null> {
  const servicePrivateKey = process.env.SERVICE_X25519_PRIVATE_KEY;
  const servicePublicKey = process.env.SERVICE_X25519_PUBLIC_KEY;
  if (!servicePrivateKey || !servicePublicKey) {
    console.error('[thumbnailCache] SERVICE_X25519 keys not configured');
    return null;
  }

  try {
    // 1. Find the thumbnail file on-chain
    const thumbFile = await findThumbnailFile(artworkId);
    if (!thumbFile) {
      console.log(`[thumbnailCache] No thumbnail file found on-chain for artwork ${artworkId}`);
      return null;
    }

    if (!thumbFile.upload_complete) {
      console.log(`[thumbnailCache] Thumbnail upload not complete for artwork ${artworkId}`);
      return null;
    }

    // 2. Find the admin_encrypted_dek for our service key
    // The service key was registered as admin key_id=2 on-chain.
    // admin_encrypted_deks is ordered by admin key registration order.
    // We need to figure out which index corresponds to our service key.
    // The admin keys at time of encryption determine the order.
    // We'll try each admin_encrypted_dek until one works.
    const adminDeks: string[] = thumbFile.admin_encrypted_deks || [];
    const iv = thumbFile.iv;
    const authTag = thumbFile.auth_tag; // ephemeral public key

    let dek: Uint8Array | null = null;

    // Also try the primary encrypted_dek (in case the owner is verarta.core)
    for (const encDek of [thumbFile.encrypted_dek, ...adminDeks]) {
      try {
        dek = await decryptDek(encDek, iv, authTag, servicePrivateKey);
        break;
      } catch {
        // Not our key, try next
      }
    }

    if (!dek) {
      console.log(`[thumbnailCache] Could not decrypt DEK for artwork ${artworkId} - service key not in recipients`);
      return null;
    }

    // 3. Reassemble encrypted thumbnail from chunks
    const fileId = String(thumbFile.file_id);
    const encryptedBuffer = await reassembleFile(fileId, thumbFile.total_chunks);

    // 4. Decrypt the file
    const plaintext = await decryptFile(
      new Uint8Array(encryptedBuffer),
      iv,
      dek
    );

    // 5. Process with Sharp → WebP thumbnail
    const processed = await sharp(Buffer.from(plaintext))
      .resize(600, undefined, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // 6. Save to disk
    const hash = createHash('sha256').update(processed).digest('hex').slice(0, 16);
    const filename = `${hash}.webp`;
    const dirPath = join(UPLOADS_DIR, 'thumbnails');
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, filename), processed);

    const url = `/api/uploads/thumbnails/${filename}`;
    console.log(`[thumbnailCache] Generated cached thumbnail for artwork ${artworkId}: ${url}`);
    return url;
  } catch (error) {
    console.error(`[thumbnailCache] Failed to generate thumbnail for artwork ${artworkId}:`, error);
    return null;
  }
}

/**
 * Check if a cached thumbnail file exists on disk.
 */
export async function thumbnailExists(thumbnailUrl: string): Promise<boolean> {
  if (!thumbnailUrl) return false;
  try {
    // thumbnailUrl looks like /api/uploads/thumbnails/abc.webp
    const relativePath = thumbnailUrl.replace(/^\/api\/uploads\//, '');
    const fullPath = join(UPLOADS_DIR, relativePath);
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}
