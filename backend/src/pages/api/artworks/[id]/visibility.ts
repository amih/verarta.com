import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';
import { generateCachedThumbnail, thumbnailExists } from '../../../../lib/thumbnailCache.js';

export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;
  const artworkId = context.params.id;

  try {
    const body = await context.request.json();
    const hidden = Boolean(body.hidden);

    await query(
      `INSERT INTO artwork_extras(blockchain_artwork_id, user_id, hidden, updated_at)
       VALUES($1, $2, $3, NOW())
       ON CONFLICT (blockchain_artwork_id, user_id)
       DO UPDATE SET hidden = EXCLUDED.hidden, updated_at = NOW()`,
      [artworkId, user.userId, hidden]
    );

    // When making artwork public, ensure a cached thumbnail exists
    if (!hidden && artworkId) {
      // Check if we already have a cached thumbnail on disk
      const existing = await query(
        `SELECT thumbnail_url FROM artwork_extras
         WHERE blockchain_artwork_id = $1 AND user_id = $2`,
        [artworkId, user.userId]
      );
      const currentUrl = existing.rows[0]?.thumbnail_url;
      const exists = await thumbnailExists(currentUrl);

      if (!exists) {
        // Generate from blockchain (non-blocking — don't slow down the response)
        generateCachedThumbnail(String(artworkId)).then(async (url) => {
          if (url) {
            await query(
              `UPDATE artwork_extras SET thumbnail_url = $1, updated_at = NOW()
               WHERE blockchain_artwork_id = $2 AND user_id = $3`,
              [url, artworkId, user.userId]
            );
          }
        }).catch((err) => {
          console.error('[visibility] Background thumbnail generation failed:', err);
        });
      }
    }

    return new Response(JSON.stringify({ success: true, hidden }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Visibility update error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update visibility' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
