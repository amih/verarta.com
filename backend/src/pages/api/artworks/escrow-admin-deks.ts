import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { getTableRows, buildAndSignTransaction } from '../../../lib/antelope.js';

interface EscrowEntry {
  file_id: number;
  new_encrypted_dek: string; // format: "encryptedDek.ephemeralPubKey"
}

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  let body: { files: EscrowEntry[] };
  try {
    body = await context.request.json() as { files: EscrowEntry[] };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { files } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ error: 'files array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  let failed = 0;

  for (const entry of files) {
    const { file_id, new_encrypted_dek } = entry;
    if (!file_id || !new_encrypted_dek) {
      failed++;
      continue;
    }

    try {
      // Verify the file belongs to this user
      const fileResult = await getTableRows({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        key_type: 'i64',
        lower_bound: String(file_id),
        limit: 1,
      });

      if (fileResult.rows.length === 0 || String(fileResult.rows[0].file_id) !== String(file_id)) {
        failed++;
        continue;
      }

      if (fileResult.rows[0].owner !== user.blockchainAccount) {
        failed++;
        continue;
      }

      await buildAndSignTransaction('addadmindek', { file_id, new_encrypted_dek });
      processed++;
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ success: true, processed, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
