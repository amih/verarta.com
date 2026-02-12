import type { APIRoute } from 'astro';
import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { createSession } from '../../../lib/auth.js';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Parse and validate input
    const body = await request.json();
    const validation = LoginSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { email } = validation.data;

    // Find user by email
    const result = await query(
      `SELECT id, blockchain_account, email, display_name, is_admin, webauthn_credential_id
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({
        error: 'User not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = result.rows[0];

    // Update last login
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Create session
    const token = await createSession(user.id);

    // Set httpOnly cookie
    cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        blockchain_account: user.blockchain_account,
        email: user.email,
        display_name: user.display_name,
        is_admin: user.is_admin,
        webauthn_credential_id: user.webauthn_credential_id,
      },
      token, // Also return token for non-cookie clients
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
