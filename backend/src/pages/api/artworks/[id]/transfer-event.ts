import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const artworkId = Number(context.params.id);
  const body = await context.request.json();
  const { from_account, to_account, tx_id } = body;

  if (!from_account || !to_account) {
    return new Response(JSON.stringify({ error: 'from_account and to_account are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await query(
      `INSERT INTO artwork_events (blockchain_artwork_id, event_type, from_account, to_account, tx_id)
       VALUES ($1, 'transferred', $2, $3, $4)`,
      [artworkId, from_account, to_account, tx_id ?? null]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to record transfer event' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
