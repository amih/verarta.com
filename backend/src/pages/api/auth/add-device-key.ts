import type { APIRoute } from 'astro';
import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../middleware/auth.js';
import { addDeviceKeyToAccount } from '../../../lib/antelope.js';

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

    if (result.rows.length === 0 || !result.rows[0].blockchain_account) {
      return new Response(JSON.stringify({ error: 'No blockchain account found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accountName = result.rows[0].blockchain_account;

    const added = await addDeviceKeyToAccount(accountName, antelope_public_key);

    return new Response(JSON.stringify({
      success: true,
      added,
      blockchain_account: accountName,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Add device key error:', error);

    // Detect authorization failure (verarta.core not on owner permission)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('unsatisfied_authorization') || msg.includes('does not satisfy')) {
      return new Response(JSON.stringify({
        error: 'owner_migration_required',
        message: 'Account owner permission needs verarta.core@active. Sign updateauth from the original device.',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to add device key',
      details: msg,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
