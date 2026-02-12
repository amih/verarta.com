import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getAndDelete } from '../../../lib/redis.js';

const VerifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse and validate input
    const body = await request.json();
    const validation = VerifyEmailSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { email, code } = validation.data;

    // DEV MODE: Accept "414155" as universal bypass code (until SMTP is configured)
    const DEV_BYPASS = process.env.DEV_MODE === 'true' && code === '414155';

    // Get verification data from Redis
    const verifyDataStr = await getAndDelete(`email_verify:${email}`);

    if (!verifyDataStr) {
      return new Response(JSON.stringify({
        error: 'Verification code expired or not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const verifyData = JSON.parse(verifyDataStr);

    // Check if code matches (or DEV_BYPASS)
    if (!DEV_BYPASS && verifyData.code !== code) {
      // Put the data back if code is wrong (allow retry)
      const timeLeft = 900 - Math.floor((Date.now() - verifyData.timestamp) / 1000);
      if (timeLeft > 0) {
        await getAndDelete(`email_verify:${email}`); // Delete first
        const { setWithExpiry } = await import('../../../lib/redis.js');
        await setWithExpiry(`email_verify:${email}`, verifyDataStr, timeLeft);
      }

      return new Response(JSON.stringify({
        error: 'Invalid verification code',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Code is valid - store verified status in Redis for account creation
    const { setWithExpiry } = await import('../../../lib/redis.js');
    await setWithExpiry(`email_verified:${email}`, JSON.stringify({
      display_name: verifyData.display_name,
      blockchain_account: verifyData.blockchain_account,
      verified_at: Date.now(),
    }), 3600); // Valid for 1 hour

    return new Response(JSON.stringify({
      success: true,
      message: 'Email verified successfully',
      blockchain_account: verifyData.blockchain_account,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Email verification error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
