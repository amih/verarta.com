import type { APIRoute } from 'astro';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../../../lib/db.js';
import { setWithExpiry } from '../../../lib/redis.js';
import { sendVerificationEmail } from '../../../lib/email.js';
import { generateAccountName } from '../../../lib/accountName.js';

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  display_name: z.string().min(2, 'Display name must be at least 2 characters').max(100),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse and validate input
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { email, display_name } = validation.data;

    // Check if email already exists
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

    // Generate blockchain account name
    const accountName = generateAccountName('user');

    // Check if account name already exists (rare collision)
    const existingAccount = await query(
      'SELECT id FROM users WHERE blockchain_account = $1',
      [accountName]
    );

    if (existingAccount.rows.length > 0) {
      // Retry with different prefix
      const retryAccountName = generateAccountName('u');
      const retryCheck = await query(
        'SELECT id FROM users WHERE blockchain_account = $1',
        [retryAccountName]
      );

      if (retryCheck.rows.length > 0) {
        return new Response(JSON.stringify({
          error: 'Unable to generate unique account name. Please try again.',
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();

    // Store verification code in Redis with 15-minute expiry
    await setWithExpiry(`email_verify:${email}`, JSON.stringify({
      code,
      display_name,
      blockchain_account: accountName,
      timestamp: Date.now(),
    }), 900); // 15 minutes in seconds

    // Send verification email
    await sendVerificationEmail(email, code, display_name);

    return new Response(JSON.stringify({
      success: true,
      message: 'Verification code sent to email',
      blockchain_account: accountName,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
