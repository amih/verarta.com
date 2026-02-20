import type { APIRoute } from 'astro';
import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../middleware/auth.js';

const StoreKeysSchema = z.object({
  publicKey: z.string().min(1),
  encryptedPrivateKey: z.string().min(1),
  nonce: z.string().min(1),
  antelopePublicKey: z.string().min(1).optional(),
  antelopeEncryptedPrivateKey: z.string().min(1).optional(),
  antelopeKeyNonce: z.string().min(1).optional(),
});

// GET: Retrieve backed-up encryption keys
export const GET: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;

    const result = await query(
      `SELECT encryption_public_key, encrypted_private_key, key_nonce,
              antelope_public_key, antelope_encrypted_private_key, antelope_key_nonce
       FROM users WHERE id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].encryption_public_key) {
      return new Response(JSON.stringify({ error: 'No keys found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const row = result.rows[0];
    return new Response(JSON.stringify({
      success: true,
      publicKey: row.encryption_public_key,
      encryptedPrivateKey: row.encrypted_private_key,
      nonce: row.key_nonce,
      antelopePublicKey: row.antelope_public_key || undefined,
      antelopeEncryptedPrivateKey: row.antelope_encrypted_private_key || undefined,
      antelopeKeyNonce: row.antelope_key_nonce || undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get keys error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Store encryption keys backup
export const POST: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;
    const body = await context.request.json();
    const validation = StoreKeysSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { publicKey, encryptedPrivateKey, nonce, antelopePublicKey, antelopeEncryptedPrivateKey, antelopeKeyNonce } = validation.data;

    await query(
      `UPDATE users
       SET encryption_public_key = $1, encrypted_private_key = $2, key_nonce = $3,
           antelope_public_key = COALESCE(antelope_public_key, $4),
           antelope_encrypted_private_key = COALESCE(antelope_encrypted_private_key, $5),
           antelope_key_nonce = COALESCE(antelope_key_nonce, $6)
       WHERE id = $7`,
      [publicKey, encryptedPrivateKey, nonce, antelopePublicKey || null, antelopeEncryptedPrivateKey || null, antelopeKeyNonce || null, user.userId]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Store keys error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
