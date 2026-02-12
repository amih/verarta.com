import type { APIRoute } from 'astro';
import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { getAndDelete } from '../../../lib/redis.js';
import { createSession } from '../../../lib/auth.js';

const CreateAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  webauthn_credential_id: z.string().min(1, 'WebAuthn credential ID required'),
  webauthn_public_key: z.string().min(1, 'WebAuthn public key required'),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Parse and validate input
    const body = await request.json();
    const validation = CreateAccountSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { email, webauthn_credential_id, webauthn_public_key } = validation.data;

    // Check if email was verified
    const verifiedDataStr = await getAndDelete(`email_verified:${email}`);

    if (!verifiedDataStr) {
      return new Response(JSON.stringify({
        error: 'Email not verified or verification expired',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const verifiedData = JSON.parse(verifiedDataStr);

    // Check if email already exists (double-check)
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return new Response(JSON.stringify({
        error: 'Email already registered',
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create user in database
    const result = await query(
      `INSERT INTO users (
        blockchain_account,
        email,
        display_name,
        webauthn_credential_id,
        webauthn_public_key,
        email_verified,
        last_login
      ) VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
      RETURNING id, blockchain_account, email, display_name, is_admin`,
      [
        verifiedData.blockchain_account,
        email,
        verifiedData.display_name,
        webauthn_credential_id,
        webauthn_public_key,
      ]
    );

    const user = result.rows[0];

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
      },
      token, // Also return token for non-cookie clients
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Account creation error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
