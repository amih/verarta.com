import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';

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
