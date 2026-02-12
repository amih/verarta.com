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
} from '../../../lib/fileUpload.js';

const UploadInitSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  filename: z.string().min(1, 'Filename is required').max(255),
  mime_type: z.string().min(1, 'MIME type is required').max(100),
  file_data: z.string().min(1, 'File data is required'), // base64 encoded
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
    const validation = UploadInitSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, filename, mime_type, file_data, is_thumbnail } = validation.data;

    // Generate unique upload ID
    const uploadId = crypto.randomUUID();

    // Save temp file
    const tempFilePath = await saveTempFile(uploadId, file_data);

    // Get file size
    const fileSize = await getFileSize(tempFilePath);

    // Calculate file hash
    const fileHash = await calculateFileHash(tempFilePath);

    // Calculate total chunks
    const chunkSize = getChunkSize();
    const totalChunks = calculateTotalChunks(fileSize);

    // Create artwork upload record (if not existing)
    // For now, we'll just track the file upload
    // In a full implementation, this would link to an artwork_id

    // Insert file upload record
    const result = await query(
      `INSERT INTO file_uploads (
        user_id,
        upload_id,
        temp_file_path,
        original_filename,
        mime_type,
        file_size,
        file_hash,
        chunk_size,
        total_chunks,
        is_thumbnail,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, upload_id, total_chunks, chunk_size`,
      [
        user.userId,
        uploadId,
        tempFilePath,
        filename,
        mime_type,
        fileSize,
        fileHash,
        chunkSize,
        totalChunks,
        is_thumbnail,
      ]
    );

    const upload = result.rows[0];

    return new Response(JSON.stringify({
      success: true,
      upload_id: upload.upload_id,
      total_chunks: upload.total_chunks,
      chunk_size: upload.chunk_size,
      file_size: fileSize,
      file_hash: fileHash,
      message: 'Upload initialized. Ready to upload chunks.',
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload init error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to initialize upload',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
