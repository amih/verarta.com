import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getTableRows } from '../../../lib/antelope.js';

const ArtworkIdSchema = z.string().regex(/^\d+$/, 'Invalid artwork ID');

function mapArtwork(row: any) {
  return {
    id: row.artwork_id,
    owner: row.owner,
    title: (() => { try { return atob(row.title_encrypted); } catch { return row.title_encrypted; } })(),
    created_at: new Date(row.created_at * 1000).toISOString(),
  };
}

function mapFile(row: any) {
  return {
    id: row.file_id,
    artwork_id: row.artwork_id,
    filename: (() => { try { return atob(row.filename_encrypted); } catch { return row.filename_encrypted; } })(),
    mime_type: row.mime_type,
    file_hash: row.file_hash,
    file_size: row.file_size,
    uploaded_chunks: row.uploaded_chunks,
    total_chunks: row.total_chunks,
    upload_complete: row.upload_complete,
    owner: row.owner,
    is_thumbnail: row.is_thumbnail ?? false,
  };
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({
        error: 'Artwork ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validation = ArtworkIdSchema.safeParse(id);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Invalid artwork ID format',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const artworkId = parseInt(id);

    // upper_bound is exclusive — use limit 1 and verify the returned row matches.
    // Compare as strings: the chain returns large uint64 values as JSON strings.
    const artworkResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      key_type: 'i64',
      lower_bound: id,
      limit: 1,
    });

    if (artworkResult.rows.length === 0 || String(artworkResult.rows[0].artwork_id) !== id) {
      return new Response(JSON.stringify({
        error: 'Artwork not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get associated files via by_artwork secondary index (index_position 2).
    // Use BigInt arithmetic for the upper_bound to avoid precision loss on large uint64 IDs.
    const filesResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      index_position: 2,
      key_type: 'i64',
      lower_bound: id,
      upper_bound: (BigInt(id) + 1n).toString(),
      limit: 100,
    });

    return new Response(JSON.stringify({
      success: true,
      artwork: {
        ...mapArtwork(artworkResult.rows[0]),
        files: filesResult.rows.map(mapFile),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get artwork error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get artwork',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
