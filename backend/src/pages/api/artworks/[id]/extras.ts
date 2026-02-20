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
              a.name AS artist_name, c.name AS collection_name
       FROM artwork_extras ae
       LEFT JOIN artists a ON ae.artist_id = a.id
       LEFT JOIN collections c ON ae.collection_id = c.id
       WHERE ae.blockchain_artwork_id=$1 AND ae.user_id=$2`,
      [artworkId, user.id]
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
    const { title, description_html, creation_date, era, artist_id, collection_id } = body;

    await query(
      `INSERT INTO artwork_extras(blockchain_artwork_id, user_id, title, description_html, creation_date, era, artist_id, collection_id, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (blockchain_artwork_id, user_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         description_html = EXCLUDED.description_html,
         creation_date = EXCLUDED.creation_date,
         era = EXCLUDED.era,
         artist_id = EXCLUDED.artist_id,
         collection_id = EXCLUDED.collection_id,
         updated_at = NOW()`,
      [artworkId, user.id, title || null, description_html || null, creation_date || null, era || null, artist_id || null, collection_id || null]
    );

    // Mirror to on-chain fields — description and metadata as base64-encoded plaintext.
    // This is best-effort; Postgres remains the authoritative editable store.
    try {
      const descriptionEncoded = description_html
        ? Buffer.from(description_html).toString('base64')
        : '';
      const metadataObj: Record<string, unknown> = {};
      if (creation_date) metadataObj.creation_date = creation_date;
      if (era) metadataObj.era = era;
      if (artist_id) metadataObj.artist_id = artist_id;
      if (collection_id) metadataObj.collection_id = collection_id;
      const metadataEncoded = Object.keys(metadataObj).length > 0
        ? Buffer.from(JSON.stringify(metadataObj)).toString('base64')
        : '';

      await buildAndSignTransaction('updateart', {
        artwork_id: Number(artworkId),
        owner: user.blockchainAccount,
        description_encrypted: descriptionEncoded,
        metadata_encrypted: metadataEncoded,
      });
    } catch (chainError) {
      // Non-fatal — log and continue; Postgres save already succeeded
      console.error('[extras] on-chain updateart failed (non-fatal):', chainError);
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
