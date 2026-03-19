import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';
import {
  saveTempFile,
  calculateFileHash,
  calculateTotalChunks,
  getFileSize,
  getChunkSize,
  readChunk,
  deleteTempFile,
} from '../../../lib/fileUpload.js';
import { buildAndSignTransaction, CHAIN_CONFIG, chainClient } from '../../../lib/antelope.js';

const UploadStartSchema = z.object({
  artwork_id: z.number().int().positive(),
  file_id: z.number().int().positive(),
  title: z.string().max(255).default(''),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  file_data: z.string().min(1), // base64-encoded encrypted ciphertext
  is_thumbnail: z.boolean().optional().default(false),
});

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    // Parse and validate input
    const body = await context.request.json();
    const validation = UploadStartSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { artwork_id, file_id, title, filename, mime_type, file_data, is_thumbnail } = validation.data;

    // Generate unique upload ID
    const uploadId = crypto.randomUUID();

    // Save encrypted file to temp storage
    const tempFilePath = await saveTempFile(uploadId, file_data);

    // Get file size and calculate chunks
    const fileSize = await getFileSize(tempFilePath);
    const fileHash = await calculateFileHash(tempFilePath);
    const chunkSize = getChunkSize();
    const totalChunks = calculateTotalChunks(fileSize);

    // Record upload in database
    await query(
      `INSERT INTO file_uploads (
        user_id, upload_id, temp_file_path, original_filename,
        mime_type, file_size, file_hash, chunk_size, total_chunks,
        is_thumbnail, blockchain_artwork_id, blockchain_file_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id`,
      [
        user.userId, uploadId, tempFilePath, filename,
        mime_type, fileSize, fileHash, chunkSize, totalChunks,
        is_thumbnail, artwork_id, file_id,
      ]
    );

    const contractAccount = String(CHAIN_CONFIG.contractAccount);
    const ownerAccount = user.blockchainAccount;

    // Wait for the addfile transaction (pushed by frontend) to be included in a block.
    // The uploadchunk action requires the file to exist on-chain.
    const nodeUrl = process.env.HISTORY_NODE_URL || 'http://localhost:8888';
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const resp = await fetch(`${nodeUrl}/v1/chain/get_table_rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            json: true,
            code: contractAccount,
            scope: contractAccount,
            table: 'artfiles',
            lower_bound: String(file_id),
            upper_bound: String(file_id),
            limit: 1,
          }),
        });
        const result = await resp.json();
        if (result.rows && result.rows.length > 0) break;
      } catch {
        // retry
      }
      if (attempt === 14) throw new Error('File record not confirmed on-chain after 30s');
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Upload all chunks server-side using service key
    for (let i = 0; i < totalChunks; i++) {
      const chunkBuffer = await readChunk(tempFilePath, i);
      const chunkDataB64 = chunkBuffer.toString('base64');
      const chunkId = Date.now() * 1000 + i; // unique chunk ID

      await buildAndSignTransaction('uploadchunk', {
        chunk_id: chunkId,
        file_id,
        owner: ownerAccount,
        chunk_index: i,
        chunk_data: chunkDataB64,
        chunk_size: chunkBuffer.length,
      });

      // Track progress in database
      await query(
        `UPDATE file_uploads SET uploaded_chunks = $1 WHERE upload_id = $2`,
        [i + 1, uploadId]
      );
    }

    // Complete the file on-chain
    await buildAndSignTransaction('completefile', {
      file_id,
      owner: ownerAccount,
      total_chunks: totalChunks,
    });

    // Mark upload complete in database
    await query(
      `UPDATE file_uploads SET completed_at = NOW() WHERE upload_id = $1`,
      [uploadId]
    );

    // Clean up temp file
    try {
      await deleteTempFile(tempFilePath);
    } catch {
      // Non-fatal; cleanup job will handle it
    }

    return new Response(JSON.stringify({
      success: true,
      upload_id: uploadId,
      total_chunks: totalChunks,
      file_size: fileSize,
      file_hash: fileHash,
      message: 'Upload completed successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload start error:', error);

    let errorMessage = 'Failed to upload file';
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient blockchain resources (CPU, NET, or RAM)';
      } else if (error.message.includes('quota')) {
        errorMessage = error.message;
      }
    }

    return new Response(JSON.stringify({
      error: errorMessage,
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
