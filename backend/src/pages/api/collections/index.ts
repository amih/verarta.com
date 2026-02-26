import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  try {
    const result = await query(
      'SELECT id, name FROM collections WHERE user_id=$1 ORDER BY name',
      [user.userId]
    );
    return new Response(JSON.stringify({ collections: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch collections' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  try {
    const body = await context.request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await query(
      'INSERT INTO collections(user_id, name) VALUES($1, $2) ON CONFLICT (user_id, name) DO UPDATE SET name=EXCLUDED.name RETURNING id, name',
      [user.userId, name]
    );

    return new Response(JSON.stringify({ collection: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to create collection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
