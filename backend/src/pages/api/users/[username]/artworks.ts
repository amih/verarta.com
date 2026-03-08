import type { APIRoute } from 'astro';
import { query } from '../../../../lib/db.js';
import { getTableRows } from '../../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  const usernameParam = context.params.username;
  if (!usernameParam) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // URL uses underscores for spaces
  const username = usernameParam.replace(/_/g, ' ');

  try {
    // Look up user by username
    let userResult = await query(
      `SELECT id, blockchain_account FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    if (userResult.rows.length === 0) {
      userResult = await query(
        `SELECT id, blockchain_account FROM users WHERE LOWER(username) = LOWER($1)`,
        [usernameParam]
      );
    }

    if (userResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dbUser = userResult.rows[0];

    // Fetch artworks from blockchain by owner
    const chainResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      index_position: 2,
      key_type: 'name',
      lower_bound: dbUser.blockchain_account,
      limit: 1000,
    });

    const chainArtworks = chainResult.rows.filter(
      (row: any) => row.owner === dbUser.blockchain_account
    );

    if (chainArtworks.length === 0) {
      return new Response(JSON.stringify({ artworks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const artworkIds = chainArtworks.map((r: any) => r.artwork_id);

    // Fetch extras WHERE hidden = FALSE (or hidden IS NULL — default is public)
    const extrasResult = await query(
      `SELECT ae.blockchain_artwork_id, ae.title, ae.creation_date, ae.era,
              ae.description_html, ae.thumbnail_url,
              a.name AS artist_name, c.name AS collection_name
       FROM artwork_extras ae
       LEFT JOIN artists a ON ae.artist_id = a.id
       LEFT JOIN collections c ON ae.collection_id = c.id
       WHERE ae.user_id = $1
         AND ae.blockchain_artwork_id = ANY($2::bigint[])
         AND (ae.hidden = FALSE OR ae.hidden IS NULL)`,
      [dbUser.id, artworkIds]
    );

    const extrasMap = new Map<string, any>();
    for (const row of extrasResult.rows) {
      extrasMap.set(String(row.blockchain_artwork_id), row);
    }

    // Only include artworks that have extras with hidden=false/null
    const publicArtworks = chainArtworks
      .filter((row: any) => extrasMap.has(String(row.artwork_id)))
      .map((row: any) => {
        const extras = extrasMap.get(String(row.artwork_id));
        let title: string;
        try {
          title = extras?.title || atob(row.title_encrypted);
        } catch {
          title = row.title_encrypted;
        }

        const descText = extras?.description_html
          ? extras.description_html.replace(/<[^>]*>/g, '').slice(0, 200)
          : null;

        return {
          id: row.artwork_id,
          title,
          thumbnail_url: extras?.thumbnail_url ?? null,
          artist_name: extras?.artist_name ?? null,
          collection_name: extras?.collection_name ?? null,
          era: extras?.era ?? null,
          creation_date: extras?.creation_date ?? null,
          description_snippet: descText,
          created_at: new Date(row.created_at * 1000).toISOString(),
        };
      });

    return new Response(JSON.stringify({ artworks: publicArtworks }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Public artworks error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get artworks' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
