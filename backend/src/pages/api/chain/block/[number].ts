import type { APIRoute } from 'astro';
import { chainClient } from '../../../../lib/antelope.js';

export const GET: APIRoute = async ({ params }) => {
  try {
    const { number } = params;

    if (!number) {
      return new Response(JSON.stringify({
        error: 'Block number is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const blockNum = parseInt(number, 10);
    if (isNaN(blockNum) || blockNum < 1) {
      return new Response(JSON.stringify({
        error: 'Invalid block number',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const block = await chainClient.v1.chain.get_block(blockNum);

    return new Response(JSON.stringify({
      success: true,
      block: {
        block_num: Number(block.block_num),
        block_id: String(block.id),
        timestamp: String(block.timestamp),
        producer: String(block.producer),
        transactions: (block.transactions || []).map((trx: any) => {
          if (trx.trx && typeof trx.trx === 'object' && trx.trx.id) {
            return {
              id: String(trx.trx.id),
              status: trx.status,
              actions: (trx.trx.transaction?.actions || []).map((act: any) => ({
                account: String(act.account),
                name: String(act.name),
                authorization: (act.authorization || []).map((auth: any) => ({
                  actor: String(auth.actor),
                  permission: String(auth.permission),
                })),
                data: act.data,
              })),
            };
          }
          // Deferred or inline transaction ID only
          return { id: String(trx.trx), status: trx.status, actions: [] };
        }),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get block error:', error);

    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('block_validate_exception') || msg.includes('Could not find block')) {
      return new Response(JSON.stringify({
        error: 'Block not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to get block',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
