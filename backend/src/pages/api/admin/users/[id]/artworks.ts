import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../../middleware/auth.js';
import { query } from '../../../../../lib/db.js';
import { getTableRows } from '../../../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  try {
    const userId = context.params.id;

    const url = new URL(context.request.url);
    const q = url.searchParams.get('q')?.trim() || '';
    const artistId = url.searchParams.get('artist_id') || '';
    const collectionId = url.searchParams.get('collection_id') || '';
    const era = url.searchParams.get('era')?.trim() || '';

    // Look up the user's blockchain account
    const userResult = await query(
      'SELECT blockchain_account, display_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { blockchain_account } = userResult.rows[0];

    // Query artworks by owner via secondary index (same pattern as /api/artworks/list)
    const result = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      index_position: 2,
      key_type: 'name',
      lower_bound: blockchain_account,
      limit: 1000,
    });

    const filteredRows = result.rows.filter((row: any) => row.owner === blockchain_account);

    // Decode all titles
    let rows = filteredRows.map((row: any) => ({
      ...row,
      _title: (() => { try { return atob(row.title_encrypted); } catch { return row.title_encrypted; } })(),
    }));

    // Free-text filter on title
    if (q) {
      rows = rows.filter((row: any) => row._title.toLowerCase().includes(q.toLowerCase()));
    }

    // PostgreSQL-based filters (artist_id, collection_id, era) — scoped to target user
    if (artistId || collectionId || era) {
      const conditions: string[] = ['user_id=$1'];
      const params: any[] = [userId];
      let paramIdx = 2;

      if (artistId) {
        conditions.push(`artist_id=$${paramIdx++}`);
        params.push(Number(artistId));
      }
      if (collectionId) {
        conditions.push(`collection_id=$${paramIdx++}`);
        params.push(Number(collectionId));
      }
      if (era) {
        conditions.push(`LOWER(era) LIKE $${paramIdx++}`);
        params.push(`%${era.toLowerCase()}%`);
      }

      const extrasResult = await query(
        `SELECT blockchain_artwork_id FROM artwork_extras WHERE ${conditions.join(' AND ')}`,
        params
      );
      const matchingIds = new Set(extrasResult.rows.map((r: any) => String(r.blockchain_artwork_id)));
      rows = rows.filter((row: any) => matchingIds.has(String(row.artwork_id)));
    }

    const artworks = rows.map((row: any) => ({
      id: row.artwork_id,
      title: row._title,
      created_at: new Date(row.created_at * 1000).toISOString(),
      file_count: row.file_count ?? 0,
    }));

    return new Response(JSON.stringify({ success: true, artworks }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Admin user artworks error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch user artworks',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
