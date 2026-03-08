import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;
  const url = new URL(context.request.url);
  const username = url.searchParams.get('username')?.trim();

  if (!username) {
    return new Response(JSON.stringify({ available: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
      [username, user.userId]
    );

    return new Response(JSON.stringify({ available: result.rows.length === 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ available: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
