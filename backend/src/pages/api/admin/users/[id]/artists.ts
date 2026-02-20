import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../../middleware/auth.js';
import { query } from '../../../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  const userId = context.params.id;

  try {
    const result = await query(
      'SELECT id, name FROM artists WHERE user_id=$1 ORDER BY name',
      [userId]
    );
    return new Response(JSON.stringify({ artists: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch artists' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
