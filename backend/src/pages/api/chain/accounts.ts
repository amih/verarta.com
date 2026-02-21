import type { APIRoute } from 'astro';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async () => {
  try {
    const result = await query(
      'SELECT blockchain_account, display_name, email, created_at FROM users ORDER BY id'
    );

    return new Response(JSON.stringify({
      success: true,
      accounts: result.rows,
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
