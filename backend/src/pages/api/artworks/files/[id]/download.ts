import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../../../middleware/auth.js';
import { getTableRows } from '../../../../../lib/antelope.js';

const FileIdSchema = z.string().regex(/^\d+$/, 'Invalid file ID');

/**
 * Download a file's raw encrypted bytes by reassembling chunks from on-chain storage.
 * The client decrypts the data using their private key.
 */
export const GET: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const { id } = context.params;

    if (!id) {
      return new Response(JSON.stringify({ error: 'File ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validation = FileIdSchema.safeParse(id);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid file ID format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileId = parseInt(id);

    // Get file metadata from blockchain
    const fileResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      key_type: 'i64',
      lower_bound: id,
      limit: 1,
    });

    if (fileResult.rows.length === 0 || String(fileResult.rows[0].file_id) !== id) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileMetadata = fileResult.rows[0] as any;

    if (!fileMetadata.upload_complete) {
      return new Response(JSON.stringify({ error: 'File upload not complete' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch all chunks from blockchain via byfile secondary index, ordered by chunk_index
    const totalChunks = fileMetadata.total_chunks;
    const chunkResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artchunks',
      key_type: 'i64',
      lower_bound: id,
      upper_bound: (BigInt(id) + 1n).toString(),
      limit: totalChunks,
      index_position: 2, // byfile secondary index
    });

    const allChunks: Buffer[] = (chunkResult.rows as any[])
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map((chunk) => Buffer.from(chunk.chunk_data, 'base64'));

    if (allChunks.length === 0) {
      return new Response(JSON.stringify({ error: 'No chunks found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileBuffer = Buffer.concat(allChunks);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
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
