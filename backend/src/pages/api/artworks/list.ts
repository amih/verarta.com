import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { getTableRows } from '../../../lib/antelope.js';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    const url = new URL(context.request.url);
    const q = url.searchParams.get('q')?.trim() || '';
    const artistId = url.searchParams.get('artist_id') || '';
    const collectionId = url.searchParams.get('collection_id') || '';
    const era = url.searchParams.get('era')?.trim() || '';

    // Query artworks by owner via secondary index.
    const result = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      index_position: 2,
      key_type: 'name',
      lower_bound: user.blockchainAccount,
      limit: 1000,
    });

    let filteredRows = result.rows.filter((row: any) => row.owner === user.blockchainAccount);

    // Decode all titles first
    const decoded = filteredRows.map((row: any) => ({
      ...row,
      _title: (() => { try { return atob(row.title_encrypted); } catch { return row.title_encrypted; } })(),
    }));

    // Free-text filter on title
    let rows = q
      ? decoded.filter((row: any) => row._title.toLowerCase().includes(q.toLowerCase()))
      : decoded;

    // PostgreSQL-based filters (artist_id, collection_id, era)
    if (artistId || collectionId || era) {
      const conditions: string[] = ['user_id=$1'];
      const params: any[] = [user.id];
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

    // Fetch extras for all remaining rows (for enrichment)
    let extrasMap: Map<string, any> = new Map();
    if (rows.length > 0) {
      const artworkIds = rows.map((r: any) => r.artwork_id);
      const extrasResult = await query(
        `SELECT ae.blockchain_artwork_id, ae.creation_date, ae.era,
                a.name AS artist_name, c.name AS collection_name
         FROM artwork_extras ae
         LEFT JOIN artists a ON ae.artist_id = a.id
         LEFT JOIN collections c ON ae.collection_id = c.id
         WHERE ae.user_id=$1 AND ae.blockchain_artwork_id = ANY($2::bigint[])`,
        [user.id, artworkIds]
      );
      for (const row of extrasResult.rows) {
        extrasMap.set(String(row.blockchain_artwork_id), row);
      }
    }

    const artworks = await Promise.all(
      rows.map(async (row: any) => {
        // Fetch the first file for this artwork via secondary index (artwork_id)
        let file: { id: string; mime_type: string } | null = null;
        try {
          const fileResult = await getTableRows({
            code: 'verarta.core',
            scope: 'verarta.core',
            table: 'artfiles',
            index_position: 2,
            key_type: 'i64',
            lower_bound: row.artwork_id.toString(),
            upper_bound: (BigInt(row.artwork_id) + 1n).toString(),
            limit: 1,
          });
          if (fileResult.rows.length > 0) {
            const f = fileResult.rows[0] as any;
            file = { id: String(f.file_id), mime_type: f.mime_type };
          }
        } catch {
          // silently ignore — file info is best-effort
        }

        const extras = extrasMap.get(String(row.artwork_id));

        return {
          id: row.artwork_id,
          owner: row.owner,
          title: row._title,
          created_at: new Date(row.created_at * 1000).toISOString(),
          file,
          artist_name: extras?.artist_name ?? null,
          collection_name: extras?.collection_name ?? null,
          era: extras?.era ?? null,
          creation_date: extras?.creation_date ?? null,
        };
      })
    );

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
