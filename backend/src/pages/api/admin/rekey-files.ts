import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../middleware/auth.js';
import { buildAndSignTransaction } from '../../../lib/antelope.js';

interface RekeyEntry {
  file_id: number;
  new_encrypted_dek: string;
}

export const POST: APIRoute = async (context) => {
  const authResult = await requireAdmin(context);
  if (authResult) return authResult;

  let body: { files: RekeyEntry[] };
  try {
    body = await context.request.json() as { files: RekeyEntry[] };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { files } = body;
  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ error: 'files array is required and must not be empty' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ file_id: number; error: string }> = [];

  for (const entry of files) {
    const { file_id, new_encrypted_dek } = entry;
    if (!file_id || !new_encrypted_dek) {
      failed++;
      errors.push({ file_id: file_id ?? 0, error: 'Missing file_id or new_encrypted_dek' });
      continue;
    }

    try {
      await buildAndSignTransaction('addadmindek', { file_id, new_encrypted_dek });
      processed++;
    } catch (err) {
      failed++;
      errors.push({
        file_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed, failed, ...(errors.length > 0 && { errors }) }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
