import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';
import { buildAndSignTransaction } from '../../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;
  const artworkId = context.params.id;

  try {
    const result = await query(
      `SELECT ae.title, ae.description_html, ae.creation_date, ae.era, ae.artist_id, ae.collection_id,
              ae.file_order, a.name AS artist_name, c.name AS collection_name
       FROM artwork_extras ae
       LEFT JOIN artists a ON ae.artist_id = a.id
       LEFT JOIN collections c ON ae.collection_id = c.id
       WHERE ae.blockchain_artwork_id=$1 AND ae.user_id=$2`,
      [artworkId, user.userId]
    );

    const extras = result.rows[0] ?? null;
    return new Response(JSON.stringify({ extras }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch extras' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;
  const artworkId = context.params.id;

  try {
    const body = await context.request.json();
    const { title, description_html, creation_date, era, artist_id, collection_id, file_order } = body;

    await query(
      `INSERT INTO artwork_extras(blockchain_artwork_id, user_id, title, description_html, creation_date, era, artist_id, collection_id, file_order, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (blockchain_artwork_id, user_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         description_html = EXCLUDED.description_html,
         creation_date = EXCLUDED.creation_date,
         era = EXCLUDED.era,
         artist_id = EXCLUDED.artist_id,
         collection_id = EXCLUDED.collection_id,
         file_order = EXCLUDED.file_order,
         updated_at = NOW()`,
      [artworkId, user.userId, title || null, description_html || null, creation_date || null, era || null, artist_id || null, collection_id || null, file_order ? JSON.stringify(file_order) : null]
    );

    // Record extras in blockchain action history via setextras.
    // The action trace is the single source of truth; Postgres is just a cache.
    // This is best-effort — Postgres save already succeeded above.
    try {
      // Resolve artist and collection names so chain history is self-contained
      let artist_name: string | null = null;
      let collection_name: string | null = null;
      if (artist_id) {
        const artistResult = await query('SELECT name FROM artists WHERE id=$1', [artist_id]);
        artist_name = artistResult.rows[0]?.name ?? null;
      }
      if (collection_id) {
        const collectionResult = await query('SELECT name FROM collections WHERE id=$1', [collection_id]);
        collection_name = collectionResult.rows[0]?.name ?? null;
      }

      const extras_json = JSON.stringify({
        title: title || null,
        description_html: description_html || null,
        creation_date: creation_date || null,
        era: era || null,
        artist_name,
        collection_name,
        file_order: file_order || null,
      });

      await buildAndSignTransaction('setextras', {
        artwork_id: Number(artworkId),
        owner: user.blockchainAccount,
        extras_json,
      });
    } catch (chainError) {
      // Non-fatal — log and continue; Postgres save already succeeded
      console.error('[extras] on-chain setextras failed (non-fatal):', chainError);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to save extras' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
