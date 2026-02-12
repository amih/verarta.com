import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { getTableRows } from '../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    // Query artworks table from blockchain
    // Using secondary index to get artworks by owner
    const result = await getTableRows({
      code: 'verartacore',
      scope: 'verartacore',
      table: 'artworks',
      index_position: 2, // by_owner index
      key_type: 'name',
      lower_bound: user.blockchainAccount,
      upper_bound: user.blockchainAccount,
      limit: 1000,
    });

    return new Response(JSON.stringify({
      success: true,
      artworks: result.rows,
      count: result.rows.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('List artworks error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to list artworks',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
