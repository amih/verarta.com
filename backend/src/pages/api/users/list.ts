import type { APIRoute } from 'astro';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async () => {
  try {
    const result = await query(
      `SELECT username, display_name, profile_image_url
       FROM users
       WHERE username IS NOT NULL AND username != ''
       ORDER BY display_name ASC`
    );

    return new Response(JSON.stringify({ users: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('List users error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
