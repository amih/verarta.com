import type { APIRoute } from 'astro';
import { setWithExpiry } from '../../../../lib/redis.js';
import { createAuthorizationURL, getEnabledProviders, type OAuthProvider } from '../../../../lib/oauth.js';

export const GET: APIRoute = async ({ params, redirect }) => {
  try {
    const provider = params.provider as string;
    const enabled = getEnabledProviders();

    if (!enabled.includes(provider as OAuthProvider)) {
      return new Response(JSON.stringify({ error: 'Provider not available' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { url, state, codeVerifier } = createAuthorizationURL(provider as OAuthProvider);

    // Store state + code verifier in Redis (10 min TTL)
    await setWithExpiry(
      `oauth_state:${state}`,
      JSON.stringify({ provider, codeVerifier }),
      600
    );

    return redirect(url.toString(), 302);
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return new Response(JSON.stringify({ error: 'Failed to initiate OAuth' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
