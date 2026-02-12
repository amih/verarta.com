import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getAccount } from '../../../../lib/antelope.js';

const AccountNameSchema = z.string().regex(/^[a-z1-5.]{1,12}$/, 'Invalid account name format');

export const GET: APIRoute = async ({ params }) => {
  try {
    const { name } = params;

    if (!name) {
      return new Response(JSON.stringify({
        error: 'Account name is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate account name format
    const validation = AccountNameSchema.safeParse(name);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Invalid account name',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const account = await getAccount(name);

    return new Response(JSON.stringify({
      success: true,
      account,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Get account error:', error);

    // Check if account doesn't exist
    if (error instanceof Error && error.message.includes('unknown key')) {
      return new Response(JSON.stringify({
        error: 'Account not found',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to get account',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
