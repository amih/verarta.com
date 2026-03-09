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

  const files = (result.rows as any[]).filter(
    (row: any) => String(row.artwork_id) === artworkId && row.upload_complete
  );

  // Prefer an explicit thumbnail file; fall back to the first main file
  return files.find((f: any) => f.is_thumbnail) || files[0] || null;
}

/**
 * Reassemble encrypted file from blockchain chunks.
 */
async function reassembleFile(fileId: string, totalChunks: number): Promise<Buffer> {
  // Each chunk is ~256KB; the chain API's 15ms-per-row ABI serialization
  // deadline can timeout when fetching multiple large chunks at once.
  // Strategy: find the first chunk's primary key via secondary index (limit=1),
  // then paginate by primary key one chunk at a time.
  const chainUrl = process.env.CHAIN_HISTORY_URL || 'http://localhost:8888';

  async function fetchRows(body: Record<string, unknown>) {
    const resp = await fetch(`${chainUrl}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'verarta.core', scope: 'verarta.core', table: 'artchunks', json: true, ...body }),
    });
    return await resp.json() as any;
  }

  // Step 1: Find the first chunk's primary key via secondary index
  const first = await fetchRows({
    index_position: 2, key_type: 'i64',
    lower_bound: fileId, upper_bound: fileId, limit: 1,
  });

  if (!first.rows?.length) {
    throw new Error(`No chunks found for file ${fileId}`);
  }

  // Step 2: Paginate by primary key (chunk_id), one at a time
  const chunkMap = new Map<number, Buffer>();
  let lowerBound = String(first.rows[0].chunk_id);

  for (let i = 0; i < totalChunks + 5 && chunkMap.size < totalChunks; i++) {
    const result = await fetchRows({ lower_bound: lowerBound, limit: 1 });

    for (const row of result.rows || []) {
      if (String(row.file_id) === fileId) {
        chunkMap.set(row.chunk_index, Buffer.from(row.chunk_data, 'base64'));
      }
    }

    if (!result.more || !result.next_key) break;
    lowerBound = String(result.next_key);

    // If we've moved past our file's chunks, stop
    const lastRow = result.rows?.[result.rows.length - 1];
    if (lastRow && String(lastRow.file_id) !== fileId && chunkMap.size > 0) break;
  }

  if (chunkMap.size === 0) {
    throw new Error(`No chunks found for file ${fileId}`);
  }

  const sorted = [...chunkMap.entries()].sort((a, b) => a[0] - b[0]);
  return Buffer.concat(sorted.map(([, buf]) => buf));
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
    const allDeks = [thumbFile.encrypted_dek, ...adminDeks];
    for (let i = 0; i < allDeks.length; i++) {
      const encDek = allDeks[i];
      if (!encDek) continue;
      try {
        // Admin DEKs use "encDek.ephPubKey" format; primary uses auth_tag as ephemeral key
        let dekB64 = encDek;
        let ephPubKey = authTag;
        if (encDek.includes('.')) {
          const parts = encDek.split('.');
          dekB64 = parts[0];
          ephPubKey = parts[1];
        }
        dek = await decryptDek(dekB64, iv, ephPubKey, servicePrivateKey);
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
