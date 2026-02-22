import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../middleware/auth.js';
import { query } from '../../../../lib/db.js';
import { getTableRows, buildAndSignTransaction } from '../../../../lib/antelope.js';
import { PermissionLevel, Name } from '@wharfkit/antelope';

const DELETED_ACCOUNT = 'deleted';

export const POST: APIRoute = async (context) => {
  try {
    const authResult = await requireAuth(context);
    if (authResult) return authResult;

    const user = (context as any).user;
    const { id } = context.params;

    if (!id || !/^\d+$/.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid artwork ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the user owns this artwork on-chain
    const artworkResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artworks',
      key_type: 'i64',
      lower_bound: id,
      limit: 1,
    });

    if (artworkResult.rows.length === 0 || String(artworkResult.rows[0].artwork_id) !== id) {
      return new Response(JSON.stringify({ error: 'Artwork not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (artworkResult.rows[0].owner !== user.blockchainAccount) {
      return new Response(JSON.stringify({ error: 'You do not own this artwork' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch all files for this artwork from on-chain artfiles table
    const filesResult = await getTableRows({
      code: 'verarta.core',
      scope: 'verarta.core',
      table: 'artfiles',
      index_position: 2,
      key_type: 'i64',
      lower_bound: id,
      upper_bound: String(BigInt(id) + 1n),
      limit: 100,
    });

    const artworkFiles = filesResult.rows.filter(
      (r: any) => String(r.artwork_id) === id
    );

    // Build dummy DEK arrays — files become undecryptable (correct for deleted artwork)
    const file_ids = artworkFiles.map((f: any) => f.file_id);
    const new_encrypted_deks = artworkFiles.map(() => '');
    const new_auth_tags = artworkFiles.map(() => '');

    // Transfer artwork to 'deleted' account on-chain
    // Authorization: user@owner — verarta.core@active is on every user's owner
    // permission (not active), so we must declare owner here.
    const authorization = PermissionLevel.from({
      actor: Name.from(user.blockchainAccount),
      permission: 'owner',
    });

    await buildAndSignTransaction(
      'transferart',
      {
        artwork_id: parseInt(id),
        from: user.blockchainAccount,
        to: DELETED_ACCOUNT,
        file_ids,
        new_encrypted_deks,
        new_auth_tags,
        memo: '',
      },
      authorization
    );

    // Clean up postgres artwork_extras row
    await query(
      `DELETE FROM artwork_extras WHERE blockchain_artwork_id = $1 AND user_id = $2`,
      [parseInt(id), user.id]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Delete artwork error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to delete artwork',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
