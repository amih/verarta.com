import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../../middleware/auth.js';
import { query } from '../../../../../lib/db.js';

const PROTECTED_USER_ID = 1;

export const POST: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  const targetId = Number(context.params.id);
  if (!targetId || isNaN(targetId)) {
    return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (targetId === PROTECTED_USER_ID) {
    return new Response(JSON.stringify({ error: 'Cannot modify protected admin user' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await query(
      'UPDATE users SET is_admin = NOT is_admin WHERE id = $1 RETURNING id, is_admin',
      [targetId]
    );

    if (result.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Toggle admin error:', error);
    return new Response(JSON.stringify({ error: 'Failed to toggle admin status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
