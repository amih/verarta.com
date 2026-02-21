import type { APIRoute } from 'astro';
import { chainClient, getTableRows } from '../../../lib/antelope.js';

export const GET: APIRoute = async () => {
  try {
    const info = await chainClient.v1.chain.get_info();

    // Count artworks by fetching with limit 1 (we just need the "more" + last key)
    let totalArtworks = 0;
    let more = true;
    let lowerBound: string | undefined;
    while (more) {
      const result = await getTableRows({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artworks',
        lower_bound: lowerBound,
        limit: 10000,
      });
      totalArtworks += result.rows.length;
      more = result.more;
      if (more && result.next_key) {
        lowerBound = String(result.next_key);
      } else {
        more = false;
      }
    }

    // Count files
    let totalFiles = 0;
    more = true;
    lowerBound = undefined;
    while (more) {
      const result = await getTableRows({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artfiles',
        lower_bound: lowerBound,
        limit: 10000,
      });
      totalFiles += result.rows.length;
      more = result.more;
      if (more && result.next_key) {
        lowerBound = String(result.next_key);
      } else {
        more = false;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      stats: {
        head_block_num: Number(info.head_block_num),
        head_block_time: String(info.head_block_time),
        chain_id: String(info.chain_id),
        server_version: String(info.server_version),
        total_artworks: totalArtworks,
        total_files: totalFiles,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Chain stats error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get chain stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
