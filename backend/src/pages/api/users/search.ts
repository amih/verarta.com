import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const url = new URL(context.request.url);
    const q = url.searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ success: true, users: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const pattern = `%${q}%`;
    const result = await query(
      `SELECT blockchain_account, display_name
       FROM users
       WHERE email ILIKE $1 OR display_name ILIKE $1 OR blockchain_account ILIKE $1
       LIMIT 5`,
      [pattern]
    );

    return new Response(JSON.stringify({
      success: true,
      users: result.rows.map((row: any) => ({
        blockchain_account: row.blockchain_account,
        display_name: row.display_name,
      })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('User search error:', error);
    return new Response(JSON.stringify({
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
