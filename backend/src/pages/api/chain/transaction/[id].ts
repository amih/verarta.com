import type { APIRoute } from 'astro';
import { getTransaction } from '../../../../lib/hyperion.js';

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({
        error: 'Transaction ID is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate hex format (transaction IDs are 64-char hex strings)
    if (!/^[a-f0-9]{64}$/i.test(id)) {
      return new Response(JSON.stringify({
        error: 'Invalid transaction ID format',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await getTransaction(id);

    return new Response(JSON.stringify({
      success: true,
      transaction: result,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get transaction error:', error);

    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('not found') || msg.includes('404')) {
      return new Response(JSON.stringify({
        error: 'Transaction not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to get transaction',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
