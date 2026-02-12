import type { APIRoute } from 'astro';
import { getChainInfo } from '../../../lib/antelope.js';

export const GET: APIRoute = async () => {
  try {
    const info = await getChainInfo();

    return new Response(JSON.stringify({
      success: true,
      chain_info: info,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Chain info error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get chain info',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
