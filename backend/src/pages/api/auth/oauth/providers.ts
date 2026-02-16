import type { APIRoute } from 'astro';
import { getEnabledProviders } from '../../../../lib/oauth.js';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    providers: getEnabledProviders(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
