import type { APIRoute } from 'astro';
import { chainClient, CHAIN_CONFIG } from '../../../lib/antelope.js';

export const GET: APIRoute = async () => {
  try {
    const { abi } = await chainClient.v1.chain.get_abi(CHAIN_CONFIG.contractAccount);
    if (!abi) {
      return new Response(JSON.stringify({ error: 'ABI not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, abi }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch contract ABI',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
