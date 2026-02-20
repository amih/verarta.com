import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../middleware/auth.js';
import { getTableRows, buildAndSignTransaction } from '../../../lib/antelope.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  try {
    const result = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'adminkeys',
      limit: 1000,
    });

    const activeKeys = (result.rows as Array<{
      key_id: number;
      admin_account: string;
      public_key: string;
      description: string;
      is_active: boolean;
    }>)
      .filter((k) => k.is_active)
      .sort((a, b) => a.key_id - b.key_id)
      .map(({ key_id, admin_account, public_key, description }) => ({
        key_id,
        admin_account,
        public_key,
        description,
      }));

    return new Response(JSON.stringify({ keys: activeKeys }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin keys GET error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch admin keys' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  try {
    const body = await context.request.json() as { public_key: string; description: string };
    const { public_key, description } = body;

    if (!public_key || !description) {
      return new Response(JSON.stringify({ error: 'public_key and description are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get admin_account from the authenticated user's session (JWT payload)
    const user = (context as any).user as { blockchainAccount?: string } | undefined;
    const admin_account = user?.blockchainAccount;

    if (!admin_account) {
      return new Response(JSON.stringify({ error: 'Admin blockchain account not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await buildAndSignTransaction('addadminkey', {
      admin_account,
      public_key,
      description,
    });

    return new Response(JSON.stringify({ success: true, transaction_id: result.transaction_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin keys POST error:', error);
    return new Response(JSON.stringify({ error: 'Failed to register admin key' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
