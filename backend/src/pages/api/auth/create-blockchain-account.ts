import type { APIRoute } from 'astro';
import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../middleware/auth.js';
import { createBlockchainAccount } from '../../../lib/antelope.js';

const Schema = z.object({
  antelope_public_key: z.string().min(1, 'Antelope public key required'),
});

export const POST: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    const body = await context.request.json();
    const validation = Schema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { antelope_public_key } = validation.data;

    // Get user's blockchain account name from DB
    const result = await query(
      'SELECT blockchain_account FROM users WHERE id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accountName = result.rows[0].blockchain_account;

    // Create the on-chain account
    try {
      await createBlockchainAccount(accountName, antelope_public_key);
    } catch (err: any) {
      // If account already exists, that's fine
      if (err?.message?.includes('already exists') || err?.message?.includes('name is already taken')) {
        return new Response(JSON.stringify({
          success: true,
          blockchain_account: accountName,
          message: 'Account already exists on chain',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.error('Blockchain account creation failed:', err);
      return new Response(JSON.stringify({
        error: 'Failed to create blockchain account',
        details: err instanceof Error ? err.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      blockchain_account: accountName,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Create blockchain account error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
