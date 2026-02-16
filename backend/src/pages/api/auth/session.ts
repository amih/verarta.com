import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';

export const GET: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    // Get user from context (attached by requireAuth middleware)
    const user = (context as any).user;

    return new Response(JSON.stringify({
      success: true,
      user: {
        userId: user.userId,
        blockchain_account: user.blockchainAccount,
        email: user.email,
        is_admin: user.isAdmin,
        avatar_url: user.avatarUrl,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Session error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
