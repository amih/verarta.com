import type { APIRoute } from 'astro';
import { getActions } from '../../../lib/hyperion.js';

export const GET: APIRoute = async ({ url }) => {
  try {
    const account = url.searchParams.get('account') || undefined;
    const filter = url.searchParams.get('filter') || undefined;
    const skip = parseInt(url.searchParams.get('skip') || '0', 10) || 0;
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1),
      100
    );
    const sort = (url.searchParams.get('sort') as 'asc' | 'desc') || 'desc';

    const result = await getActions({ account, filter, skip, limit, sort });

    return new Response(JSON.stringify({
      success: true,
      actions: result.actions || [],
      total: result.total?.value || 0,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Actions search error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to search actions',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
