import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { getActions } from '../../../../lib/hyperion.js';
import { query } from '../../../../lib/db.js';

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

    const rawEvents = data.actions
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
          memo: d.memo || undefined,
          timestamp: a['@timestamp'],
          tx_id: a.trx_id,
        };
      });

    // Resolve blockchain accounts → display names
    const accounts = new Set<string>();
    for (const e of rawEvents) {
      if (e.type === 'created') accounts.add(e.account);
      else { accounts.add(e.from); accounts.add(e.to); }
    }

    const nameMap = new Map<string, string>();
    if (accounts.size > 0) {
      const res = await query(
        `SELECT blockchain_account, display_name FROM users WHERE blockchain_account = ANY($1)`,
        [Array.from(accounts)]
      );
      for (const row of res.rows) {
        nameMap.set(row.blockchain_account, row.display_name);
      }
    }

    const events = rawEvents.map((e) => {
      if (e.type === 'created') {
        return { ...e, account_name: nameMap.get(e.account) ?? null };
      }
      return {
        ...e,
        from_name: nameMap.get(e.from) ?? null,
        to_name: nameMap.get(e.to) ?? null,
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
