import type { APIRoute } from 'astro';
import { query } from '../../../lib/db.js';

export const GET: APIRoute = async () => {
  try {
    const result = await query(
      `SELECT u.username, u.display_name, u.profile_image_url
       FROM users u
       WHERE u.username IS NOT NULL AND u.username != ''
         AND EXISTS (
           SELECT 1 FROM artwork_extras ae
           WHERE ae.user_id = u.id
             AND (ae.hidden = FALSE OR ae.hidden IS NULL)
         )
       ORDER BY u.display_name ASC`
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
