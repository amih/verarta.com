import type { APIRoute } from 'astro';
import { query } from '../../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const usernameParam = context.params.username;
  if (!usernameParam) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // URL uses underscores for spaces
  const username = usernameParam.replace(/_/g, ' ');

  try {
    const result = await query(
      `SELECT display_name, username, bio, profile_image_url, cover_image_url
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    if (result.rows.length === 0) {
      // Also try with the raw param (maybe no spaces)
      const result2 = await query(
        `SELECT display_name, username, bio, profile_image_url, cover_image_url
         FROM users WHERE LOWER(username) = LOWER($1)`,
        [usernameParam]
      );
      if (result2.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ profile: result2.rows[0] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ profile: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Public profile error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get profile' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
