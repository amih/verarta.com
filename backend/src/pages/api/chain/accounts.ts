import type { APIRoute } from 'astro';
import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../middleware/auth.js';

export const GET: APIRoute = async (context) => {
  try {
    // Try to authenticate — non-admin users and anonymous visitors get no emails
    let isAdmin = false;
    const authResult = await requireAuth(context);
    if (!authResult) {
      isAdmin = !!(context as any).user?.isAdmin;
    }

    const result = await query(
      'SELECT blockchain_account, display_name, email, created_at FROM users ORDER BY id'
    );

    const accounts = result.rows.map((row: any) => ({
      blockchain_account: row.blockchain_account,
      display_name: row.display_name,
      ...(isAdmin ? { email: row.email } : {}),
      created_at: row.created_at,
    }));

    return new Response(JSON.stringify({
      success: true,
      accounts,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('List accounts error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to list accounts',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
