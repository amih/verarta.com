import type { APIRoute } from 'astro';
import { query } from '../../../../lib/db.js';
import { getTableRows } from '../../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  const artworkId = context.params.id;

  if (!artworkId || isNaN(Number(artworkId))) {
    return new Response(JSON.stringify({ error: 'Invalid artwork ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch artwork from chain
    const chainResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      key_type: 'i64',
      lower_bound: artworkId,
      limit: 1,
    });

    const chainArtwork = chainResult.rows.find(
      (r: any) => String(r.artwork_id) === String(artworkId)
    );

    if (!chainArtwork) {
      return new Response(JSON.stringify({ error: 'Artwork not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch extras — must be public (hidden=false or null)
    const extrasResult = await query(
      `SELECT ae.title, ae.description_html, ae.creation_date, ae.era, ae.thumbnail_url, ae.hidden,
              a.name AS artist_name, c.name AS collection_name,
              u.display_name AS owner_display_name, u.username AS owner_username
       FROM artwork_extras ae
       LEFT JOIN artists a ON ae.artist_id = a.id
       LEFT JOIN collections c ON ae.collection_id = c.id
       LEFT JOIN users u ON ae.user_id = u.id
       WHERE ae.blockchain_artwork_id = $1
         AND (ae.hidden = FALSE OR ae.hidden IS NULL)`,
      [artworkId]
    );

    if (extrasResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Artwork not found or is private' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const extras = extrasResult.rows[0];
    let title: string;
    try {
      title = extras.title || atob(chainArtwork.title_encrypted);
    } catch {
      title = chainArtwork.title_encrypted;
    }

    return new Response(JSON.stringify({
      artwork: {
        id: chainArtwork.artwork_id,
        title,
        thumbnail_url: extras.thumbnail_url ?? null,
        description_html: extras.description_html ?? null,
        artist_name: extras.artist_name ?? null,
        collection_name: extras.collection_name ?? null,
        era: extras.era ?? null,
        creation_date: extras.creation_date ?? null,
        created_at: new Date(chainArtwork.created_at * 1000).toISOString(),
        owner_display_name: extras.owner_display_name ?? null,
        owner_username: extras.owner_username ?? null,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Public artwork detail error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get artwork' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
