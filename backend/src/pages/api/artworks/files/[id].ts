import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getTableRows } from '../../../../lib/antelope.js';
import { downloadFile } from '../../../../lib/hyperion.js';

const FileIdSchema = z.string().regex(/^\d+$/, 'Invalid file ID');

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({
        error: 'File ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate ID format
    const validation = FileIdSchema.safeParse(id);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Invalid file ID format',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileId = parseInt(id);
    const metadataOnly = url.searchParams.get('metadata_only') === 'true';

    // Get file metadata from blockchain — primary key lookup, key_type must be
    // 'i64' or wharfkit defaults to 'name' and the node rejects the numeric bound.
    const fileResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      key_type: 'i64',
      lower_bound: id,
      limit: 1,
    });

    if (fileResult.rows.length === 0 || String(fileResult.rows[0].file_id) !== id) {
      return new Response(JSON.stringify({
        error: 'File not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileMetadata = fileResult.rows[0];

    // If metadata only, return metadata
    if (metadataOnly) {
      return new Response(JSON.stringify({
        success: true,
        file: fileMetadata,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if upload is complete
    if (!fileMetadata.upload_complete) {
      return new Response(JSON.stringify({
        error: 'File upload not complete',
        uploaded_chunks: fileMetadata.uploaded_chunks,
        total_chunks: fileMetadata.chunk_count,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Download file from Hyperion (reassemble chunks)
    const fileBuffer = await downloadFile(fileId, fileMetadata.owner);

    // Verify file hash
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const computedHash = hash.digest('hex');

    if (computedHash !== fileMetadata.file_hash) {
      console.error('File hash mismatch:', {
        expected: fileMetadata.file_hash,
        computed: computedHash,
      });
      return new Response(JSON.stringify({
        error: 'File integrity check failed',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Set appropriate headers for file download
    const headers = new Headers({
      'Content-Type': fileMetadata.mime_type || 'application/octet-stream',
      'Content-Length': fileBuffer.length.toString(),
      'Content-Disposition': `attachment; filename="${fileMetadata.filename}"`,
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year (immutable)
    });

    return new Response(fileBuffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('Download file error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to download file',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
