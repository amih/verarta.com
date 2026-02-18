import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { getTableRows } from '../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    // Query artworks by owner via secondary index.
    // upper_bound is exclusive in EOSIO — using lower_bound == upper_bound returns nothing.
    // Instead, query from lower_bound with a high limit and filter by owner here.
    const result = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      index_position: 2,
      key_type: 'name',
      lower_bound: user.blockchainAccount,
      limit: 1000,
    });

    const artworks = result.rows
      .filter((row: any) => row.owner === user.blockchainAccount)
      .map((row: any) => ({
        id: row.artwork_id,
        owner: row.owner,
        title: (() => { try { return atob(row.title_encrypted); } catch { return row.title_encrypted; } })(),
        created_at: new Date(row.created_at * 1000).toISOString(),
      }));

    return new Response(JSON.stringify({
      success: true,
      artworks,
      count: artworks.length,
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
