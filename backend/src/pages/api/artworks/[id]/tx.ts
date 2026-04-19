import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';

export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;
  const artworkId = context.params.id;

  if (!artworkId || isNaN(Number(artworkId))) {
    return new Response(JSON.stringify({ error: 'Invalid artwork ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json();
    const txId = typeof body.tx_id === 'string' ? body.tx_id.trim().toLowerCase() : '';

    if (!/^[a-f0-9]{64}$/.test(txId)) {
      return new Response(JSON.stringify({ error: 'Invalid transaction ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await query(
      `INSERT INTO artwork_extras(blockchain_artwork_id, user_id, blockchain_tx_id, updated_at)
       VALUES($1, $2, $3, NOW())
       ON CONFLICT (blockchain_artwork_id, user_id)
       DO UPDATE SET blockchain_tx_id = COALESCE(artwork_extras.blockchain_tx_id, EXCLUDED.blockchain_tx_id),
                     updated_at = NOW()`,
      [artworkId, user.userId, txId]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Store tx error:', error);
    return new Response(JSON.stringify({ error: 'Failed to store transaction ID' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
