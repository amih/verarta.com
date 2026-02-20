import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const artworkId = Number(context.params.id);

  try {
    const result = await query(
      `SELECT event_type, from_account, to_account, tx_id, occurred_at
       FROM artwork_events
       WHERE blockchain_artwork_id = $1
       ORDER BY occurred_at ASC`,
      [artworkId]
    );

    const events = result.rows.map((row: any) => ({
      type: row.event_type as 'created' | 'transferred',
      account: row.event_type === 'created' ? row.to_account : undefined,
      from: row.event_type === 'transferred' ? row.from_account : undefined,
      to: row.event_type === 'transferred' ? row.to_account : undefined,
      timestamp: row.occurred_at,
      tx_id: row.tx_id ?? undefined,
    }));

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
