import type { APIContext } from 'astro';
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { query } from '../lib/db.js';

export async function requireAuth(context: APIContext) {
  const authHeader = context.request.headers.get('Authorization');
  const cookieToken = context.cookies.get('session')?.value;

  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Verify JWT
    const payload = verifyToken(token);

    // Check if session is still valid (not revoked)
    const valid = await isSessionValid(token);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Session expired or revoked' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Attach user to context
    (context as any).user = payload;
    return null; // Allow request to proceed

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function requireAdmin(context: APIContext) {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  // Re-check is_admin from DB — JWT value can be stale if admin was granted after login
  const result = await query('SELECT is_admin FROM users WHERE id = $1', [user.userId]);
  const isAdmin = result.rows[0]?.is_admin ?? false;

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}
