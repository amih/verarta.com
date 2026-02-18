import type { APIRoute } from 'astro';
import { z } from 'zod';
import { PackedTransaction, Bytes, Signature } from '@wharfkit/antelope';
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

    // Construct a proper PackedTransaction so wharfkit doesn't try to
    // interpret the raw object as a SignedTransaction (which would look for
    // expiration/actions/etc. fields and fail with "undefined expiration").
    const packedTx = PackedTransaction.from({
      signatures: signatures.map(s => Signature.from(s)),
      compression: 0,
      packed_context_free_data: Bytes.from('', 'hex'),
      packed_trx: Bytes.from(serializedTransaction, 'hex'),
    });

    const result = await pushTransaction(packedTx);

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
