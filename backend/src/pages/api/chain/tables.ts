import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getTableRows } from '../../../lib/antelope.js';

const TableQuerySchema = z.object({
  code: z.string().min(1, 'Contract code is required'),
  scope: z.string().min(1, 'Scope is required'),
  table: z.string().min(1, 'Table name is required'),
  lower_bound: z.string().optional(),
  upper_bound: z.string().optional(),
  limit: z.number().min(1).max(10000).optional().default(100),
  index_position: z.number().optional(),
  key_type: z.string().optional(),
  reverse: z.boolean().optional().default(false),
});

export const GET: APIRoute = async ({ url }) => {
  try {
    // Parse query parameters
    const params = {
      code: url.searchParams.get('code') || '',
      scope: url.searchParams.get('scope') || '',
      table: url.searchParams.get('table') || '',
      lower_bound: url.searchParams.get('lower_bound') || undefined,
      upper_bound: url.searchParams.get('upper_bound') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
      index_position: url.searchParams.get('index_position')
        ? parseInt(url.searchParams.get('index_position')!)
        : undefined,
      key_type: url.searchParams.get('key_type') || undefined,
      reverse: url.searchParams.get('reverse') === 'true',
    };

    // Validate input
    const validation = TableQuerySchema.safeParse(params);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const query = validation.data;

    // Query blockchain table
    const result = await getTableRows({
      code: query.code,
      scope: query.scope,
      table: query.table,
      lower_bound: query.lower_bound,
      upper_bound: query.upper_bound,
      limit: query.limit,
      index_position: query.index_position,
      key_type: query.key_type,
      reverse: query.reverse,
    });

    return new Response(JSON.stringify({
      success: true,
      rows: result.rows,
      more: result.more,
      next_key: result.next_key,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Table query error:', error);

    return new Response(JSON.stringify({
      error: 'Failed to query table',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
