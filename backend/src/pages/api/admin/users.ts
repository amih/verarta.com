import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  try {
    const result = await query(
      'SELECT id, email, display_name, is_admin, blockchain_account, last_login FROM users ORDER BY id'
    );

    return new Response(JSON.stringify({ users: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
