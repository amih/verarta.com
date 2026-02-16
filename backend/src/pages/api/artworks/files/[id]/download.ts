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
      lower_bound: fileId.toString(),
      upper_bound: fileId.toString(),
      limit: 1,
    });

    if (fileResult.rows.length === 0) {
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

    // Fetch all chunks from blockchain, ordered by chunk_index
    const allChunks: Buffer[] = [];
    const totalChunks = fileMetadata.total_chunks;

    for (let i = 0; i < totalChunks; i++) {
      // Query chunks by file using the byfile index
      const chunkResult = await getTableRows({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artchunks',
        lower_bound: fileId.toString(),
        upper_bound: fileId.toString(),
        limit: totalChunks,
        index_position: 2, // byfile secondary index
        key_type: 'i64',
      });

      if (chunkResult.rows.length > 0) {
        // Sort by chunk_index and convert
        const sorted = (chunkResult.rows as any[])
          .sort((a, b) => a.chunk_index - b.chunk_index);
        for (const chunk of sorted) {
          allChunks.push(Buffer.from(chunk.chunk_data, 'base64'));
        }
        break; // Got all chunks in one query
      }
    }

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
