import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';
import { pushTransaction } from '../../../lib/antelope.js';

const UploadChunkSchema = z.object({
  upload_id: z.string().uuid('Invalid upload ID'),
  chunk_index: z.number().int().min(0),
  signed_transaction: z.object({
    signatures: z.array(z.string()),
    serializedTransaction: z.string(),
  }),
});

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    // Parse and validate input
    const body = await context.request.json();
    const validation = UploadChunkSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { upload_id, chunk_index, signed_transaction } = validation.data;

    // Get upload record
    const uploadResult = await query(
      `SELECT id, user_id, total_chunks, uploaded_chunks
       FROM file_uploads
       WHERE upload_id = $1`,
      [upload_id]
    );

    if (uploadResult.rows.length === 0) {
      return new Response(JSON.stringify({
        error: 'Upload not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upload = uploadResult.rows[0];

    // Verify ownership
    if (upload.user_id !== user.userId) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify chunk index is valid
    if (chunk_index >= upload.total_chunks) {
      return new Response(JSON.stringify({
        error: 'Invalid chunk index',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if chunk already uploaded
    const existingChunk = await query(
      'SELECT id FROM chunk_uploads WHERE file_upload_id = $1 AND chunk_index = $2',
      [upload.id, chunk_index]
    );

    if (existingChunk.rows.length > 0) {
      return new Response(JSON.stringify({
        error: 'Chunk already uploaded',
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Push transaction to blockchain
    const txResult = await pushTransaction({
      signatures: signed_transaction.signatures,
      serializedTransaction: Uint8Array.from(
        Buffer.from(signed_transaction.serializedTransaction, 'hex')
      ),
    });

    // Record chunk upload
    await query(
      `INSERT INTO chunk_uploads (file_upload_id, chunk_index, tx_id, uploaded_at)
       VALUES ($1, $2, $3, NOW())`,
      [upload.id, chunk_index, txResult.transaction_id]
    );

    // Update uploaded chunks count
    await query(
      `UPDATE file_uploads
       SET uploaded_chunks = uploaded_chunks + 1
       WHERE id = $1`,
      [upload.id]
    );

    const newUploadedChunks = upload.uploaded_chunks + 1;
    const progress = (newUploadedChunks / upload.total_chunks) * 100;

    return new Response(JSON.stringify({
      success: true,
      transaction_id: txResult.transaction_id,
      chunk_index,
      uploaded_chunks: newUploadedChunks,
      total_chunks: upload.total_chunks,
      progress: Math.round(progress),
      complete: newUploadedChunks >= upload.total_chunks,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload chunk error:', error);

    // Check for blockchain-specific errors
    let errorMessage = 'Failed to upload chunk';
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient blockchain resources (CPU, NET, or RAM)';
      } else if (error.message.includes('expired')) {
        errorMessage = 'Transaction expired. Please try again.';
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
