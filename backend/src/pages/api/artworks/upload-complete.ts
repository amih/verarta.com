import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';
import { deleteTempFile } from '../../../lib/fileUpload.js';

const UploadCompleteSchema = z.object({
  upload_id: z.string().uuid('Invalid upload ID'),
  blockchain_artwork_id: z.number().int().positive(),
  blockchain_file_id: z.number().int().positive(),
});

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    // Parse and validate input
    const body = await context.request.json();
    const validation = UploadCompleteSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { upload_id, blockchain_artwork_id, blockchain_file_id } = validation.data;

    // Get upload record
    const uploadResult = await query(
      `SELECT id, user_id, total_chunks, uploaded_chunks, temp_file_path, completed_at
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

    // Check if already completed
    if (upload.completed_at) {
      return new Response(JSON.stringify({
        error: 'Upload already completed',
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify all chunks uploaded
    if (upload.uploaded_chunks < upload.total_chunks) {
      return new Response(JSON.stringify({
        error: 'Not all chunks uploaded',
        uploaded_chunks: upload.uploaded_chunks,
        total_chunks: upload.total_chunks,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update upload record with blockchain IDs
    await query(
      `UPDATE file_uploads
       SET blockchain_artwork_id = $1,
           blockchain_file_id = $2,
           completed_at = NOW()
       WHERE id = $3`,
      [blockchain_artwork_id, blockchain_file_id, upload.id]
    );

    // Delete temporary file
    try {
      await deleteTempFile(upload.temp_file_path);
    } catch (error) {
      console.error('Failed to delete temp file (non-fatal):', error);
      // Continue even if deletion fails - cleanup job will handle it
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Upload completed successfully',
      blockchain_artwork_id,
      blockchain_file_id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload complete error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to complete upload',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
