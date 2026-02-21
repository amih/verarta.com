import type { APIRoute } from 'astro';
import { chainClient } from '../../../lib/antelope.js';

export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1),
      50
    );

    const info = await chainClient.v1.chain.get_info();
    const headBlock = Number(info.head_block_num);

    const blocks = [];
    for (let i = 0; i < limit && headBlock - i >= 1; i++) {
      const blockNum = headBlock - i;
      try {
        const block = await chainClient.v1.chain.get_block(blockNum);
        blocks.push({
          block_num: Number(block.block_num),
          timestamp: String(block.timestamp),
          producer: String(block.producer),
          tx_count: (block.transactions || []).length,
        });
      } catch {
        // Skip blocks that fail to load
      }
    }

    return new Response(JSON.stringify({
      success: true,
      head_block_num: headBlock,
      blocks,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Recent blocks error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get recent blocks',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
