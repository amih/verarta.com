import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../../middleware/auth.js';
import { getTableRows, buildAndSignTransaction } from '../../../../../../lib/antelope.js';

export const POST: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;
    const { id, fileId } = context.params;

    if (!id || !/^\d+$/.test(id) || !fileId || !/^\d+$/.test(fileId)) {
      return new Response(JSON.stringify({ error: 'Invalid artwork or file ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the user owns this artwork on-chain
    const artworkResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      key_type: 'i64',
      lower_bound: id,
      limit: 1,
    });

    if (artworkResult.rows.length === 0 || String(artworkResult.rows[0].artwork_id) !== id) {
      return new Response(JSON.stringify({ error: 'Artwork not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (artworkResult.rows[0].owner !== user.blockchainAccount) {
      return new Response(JSON.stringify({ error: 'You do not own this artwork' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the file exists and belongs to this artwork
    const fileResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      key_type: 'i64',
      lower_bound: fileId,
      limit: 1,
    });

    if (fileResult.rows.length === 0 || String(fileResult.rows[0].file_id) !== fileId) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (String(fileResult.rows[0].artwork_id) !== id) {
      return new Response(JSON.stringify({ error: 'File does not belong to this artwork' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call deletefile action (signed by service key via get_self() auth)
    await buildAndSignTransaction('deletefile', {
      file_id: parseInt(fileId),
      artwork_id: parseInt(id),
      owner: user.blockchainAccount,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Delete file error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to delete file',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
