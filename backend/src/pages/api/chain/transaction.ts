import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { pushTransaction } from '../../../lib/antelope.js';

const TransactionSchema = z.object({
  signatures: z.array(z.string()),
  serializedTransaction: z.string(),
});

export const POST: APIRoute = async (context) => {
  try {
    // Require authentication
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    // Parse and validate input
    const body = await context.request.json();
    const validation = TransactionSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { signatures, serializedTransaction } = validation.data;

    // Push signed transaction to blockchain
    const result = await pushTransaction({
      signatures,
      serializedTransaction: Uint8Array.from(Buffer.from(serializedTransaction, 'hex')),
    });

    return new Response(JSON.stringify({
      success: true,
      transaction_id: result.transaction_id,
      processed: result.processed,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Push transaction error:', error);

    // Parse blockchain error messages
    let errorMessage = 'Failed to push transaction';
    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for common blockchain errors
      if (errorMessage.includes('insufficient')) {
        errorMessage = 'Insufficient resources (CPU, NET, or RAM)';
      } else if (errorMessage.includes('expired')) {
        errorMessage = 'Transaction expired';
      } else if (errorMessage.includes('duplicate')) {
        errorMessage = 'Duplicate transaction';
      }
    }

    return new Response(JSON.stringify({
      error: errorMessage,
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
