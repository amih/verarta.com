import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { getActions } from '../../../../lib/hyperion.js';

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const artworkId = Number(context.params.id);

  try {
    const data = await getActions({
      filter: 'verarta.core:createart,verarta.core:transferart',
      limit: 1000,
      sort: 'asc',
    });

    const events = data.actions
      .filter((a: any) => {
        const d = a.act.data;
        return String(d.artwork_id) === String(artworkId);
      })
      .map((a: any) => {
        const name = a.act.name;
        const d = a.act.data;
        if (name === 'createart') {
          return {
            type: 'created' as const,
            account: d.owner,
            timestamp: a['@timestamp'],
            tx_id: a.trx_id,
          };
        }
        return {
          type: 'transferred' as const,
          from: d.from,
          to: d.to,
          timestamp: a['@timestamp'],
          tx_id: a.trx_id,
        };
      });

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
