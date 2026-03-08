import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';

const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'auth', 'dashboard', 'settings', 'upload',
  'explorer', 'about', 'disclaimer', 'u', 'user', 'users',
]);

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,30}[a-zA-Z0-9]$/;

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  try {
    const result = await query(
      `SELECT display_name, email, username, bio, profile_image_url, cover_image_url
       FROM users WHERE id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ profile: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get profile' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  try {
    const body = await context.request.json();
    const { username, display_name, bio } = body;

    // Validate username if provided
    if (username !== undefined && username !== null && username !== '') {
      if (!USERNAME_RE.test(username)) {
        return new Response(JSON.stringify({
          error: 'Username must be 2-32 characters, start and end with alphanumeric, and contain only letters, numbers, spaces, underscores, or hyphens',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (RESERVED_USERNAMES.has(username.toLowerCase().replace(/[ _-]/g, ''))) {
        return new Response(JSON.stringify({ error: 'This username is reserved' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check uniqueness (case-insensitive)
      const existing = await query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
        [username, user.userId]
      );
      if (existing.rows.length > 0) {
        return new Response(JSON.stringify({ error: 'Username already taken' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (username !== undefined) {
      updates.push(`username = $${idx++}`);
      params.push(username || null);
    }
    if (display_name !== undefined) {
      updates.push(`display_name = $${idx++}`);
      params.push(display_name || null);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${idx++}`);
      params.push(bio || null);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    params.push(user.userId);
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
