import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../middleware/auth.js';
import { getTableRows, buildAndSignTransaction } from '../../../lib/antelope.js';
import { query } from '../../../lib/db.js';
import { decryptDek } from '../../../lib/crypto.js';
import sodium from 'libsodium-wrappers';

/**
 * Server-side re-key: decrypt each file's admin DEK using the requesting admin's
 * backed-up private key (from DB), then re-encrypt for the service X25519 key.
 * This avoids needing the browser's IndexedDB private key.
 */
export const POST: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  const servicePublicKey = process.env.SERVICE_X25519_PUBLIC_KEY;
  if (!servicePublicKey) {
    return new Response(JSON.stringify({ error: 'SERVICE_X25519_PUBLIC_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await sodium.ready;

    // 1. Get the admin's backed-up private key from DB
    const userResult = await query(
      `SELECT email, encryption_public_key, encrypted_private_key, key_nonce FROM users WHERE id = $1`,
      [user.userId]
    );
    if (userResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dbUser = userResult.rows[0];
    if (!dbUser.encrypted_private_key || !dbUser.key_nonce) {
      return new Response(JSON.stringify({ error: 'No backed-up encryption keys found for your account' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Decrypt the admin's private key (same derivation as frontend)
    const salt = sodium.from_string(dbUser.email);
    const derivedKey = sodium.crypto_generichash(
      sodium.crypto_secretbox_KEYBYTES,
      sodium.from_string('verarta-local-key'),
      salt
    );

    const nonce = sodium.from_base64(dbUser.key_nonce, sodium.base64_variants.ORIGINAL);
    const encPrivKey = sodium.from_base64(dbUser.encrypted_private_key, sodium.base64_variants.ORIGINAL);

    let adminPrivateKey: Uint8Array;
    try {
      adminPrivateKey = sodium.crypto_secretbox_open_easy(encPrivKey, nonce, derivedKey);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to decrypt your backed-up private key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Find the admin's key index in the admin keys table
    const adminKeysResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'adminkeys',
      limit: 100,
    });

    const adminKeys = (adminKeysResult.rows as any[])
      .filter((k: any) => k.is_active)
      .sort((a: any, b: any) => a.key_id - b.key_id);

    const myKeyIndex = adminKeys.findIndex((k: any) => k.public_key === dbUser.encryption_public_key);
    if (myKeyIndex < 0) {
      return new Response(JSON.stringify({ error: 'Your encryption key is not registered as an admin key on-chain' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find the service key index
    const serviceKeyIndex = adminKeys.findIndex((k: any) => k.public_key === servicePublicKey);
    if (serviceKeyIndex < 0) {
      return new Response(JSON.stringify({ error: 'Service key not found in admin keys' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Paginate all artfiles from chain
    const allFiles: any[] = [];
    let nextKey: string | undefined;
    while (true) {
      const res = await getTableRows({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        key_type: 'i64',
        limit: 100,
        ...(nextKey ? { lower_bound: nextKey } : {}),
      });
      for (const row of res.rows as any[]) {
        if (row.upload_complete) {
          allFiles.push(row);
        }
      }
      if (!res.more || !res.next_key) break;
      nextKey = String(res.next_key);
    }

    // 4. Filter files that need a DEK for the service key
    const filesToRekey = allFiles.filter(
      (f: any) => f.admin_encrypted_deks.length === serviceKeyIndex
    );

    if (filesToRekey.length === 0) {
      const noAdmin = allFiles.filter((f: any) => f.admin_encrypted_deks.length === 0).length;
      return new Response(JSON.stringify({
        success: true,
        message: `No files need re-keying.`,
        processed: 0,
        failed: 0,
        skipped_no_admin: noAdmin,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Decrypt each file's DEK and re-encrypt for service key
    let processed = 0;
    let failed = 0;
    const errors: Array<{ file_id: string; error: string }> = [];

    for (const file of filesToRekey) {
      const myEncDek = file.admin_encrypted_deks[myKeyIndex];
      if (!myEncDek) {
        failed++;
        errors.push({ file_id: String(file.file_id), error: 'No admin DEK at my index' });
        continue;
      }

      // Handle embedded ephemeral key format: "encDek.ephPubKey"
      let dekB64 = myEncDek;
      let authTag = file.auth_tag;
      if (myEncDek.includes('.')) {
        const parts = myEncDek.split('.');
        dekB64 = parts[0];
        authTag = parts[1];
      }

      try {
        // Decrypt the DEK using admin's private key
        const dek = await decryptDek(dekB64, file.iv, authTag, sodium.to_base64(adminPrivateKey, sodium.base64_variants.ORIGINAL));

        // Re-encrypt DEK for service key
        const servicePubKeyBytes = sodium.from_base64(servicePublicKey, sodium.base64_variants.ORIGINAL);
        const ivBytes = sodium.from_base64(file.iv, sodium.base64_variants.ORIGINAL);
        const boxNonce = new Uint8Array(sodium.crypto_box_NONCEBYTES);
        boxNonce.set(ivBytes);

        const ephemeralKeyPair = sodium.crypto_box_keypair();
        const newEncDek = sodium.crypto_box_easy(dek, boxNonce, servicePubKeyBytes, ephemeralKeyPair.privateKey);
        const newEncDekB64 = sodium.to_base64(newEncDek, sodium.base64_variants.ORIGINAL);
        const ephPubB64 = sodium.to_base64(ephemeralKeyPair.publicKey, sodium.base64_variants.ORIGINAL);

        // Push addadmindek transaction
        await buildAndSignTransaction('addadmindek', {
          file_id: Number(file.file_id),
          new_encrypted_dek: `${newEncDekB64}.${ephPubB64}`,
        });

        processed++;
      } catch (err) {
        failed++;
        errors.push({
          file_id: String(file.file_id),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      failed,
      total: filesToRekey.length,
      ...(errors.length > 0 && { errors: errors.slice(0, 10) }),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Server-side rekey error:', error);
    return new Response(JSON.stringify({ error: 'Re-key failed', details: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
