import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getTableRows } from '../../../lib/antelope.js';

const ArtworkIdSchema = z.string().regex(/^\d+$/, 'Invalid artwork ID');

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

    // Validate ID format
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

    // Get artwork from blockchain
    const artworkResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      lower_bound: artworkId.toString(),
      upper_bound: artworkId.toString(),
      limit: 1,
    });

    if (artworkResult.rows.length === 0) {
      return new Response(JSON.stringify({
        error: 'Artwork not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const artwork = artworkResult.rows[0];

    // Get associated files
    const filesResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      index_position: 2, // by_artwork_id index (if exists)
      lower_bound: artworkId.toString(),
      upper_bound: artworkId.toString(),
      limit: 100,
    });

    return new Response(JSON.stringify({
      success: true,
      artwork: {
        ...artwork,
        files: filesResult.rows,
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
