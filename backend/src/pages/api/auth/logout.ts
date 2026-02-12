import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { revokeSession } from '../../../lib/auth.js';

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    // Get token from header or cookie
    const authHeader = context.request.headers.get('Authorization');
    const cookieToken = context.cookies.get('session')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return new Response(JSON.stringify({
        error: 'No session to logout',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Revoke session in database
    await revokeSession(token);

    // Clear cookie
    context.cookies.delete('session', { path: '/' });

    return new Response(JSON.stringify({
      success: true,
      message: 'Logged out successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Logout error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
