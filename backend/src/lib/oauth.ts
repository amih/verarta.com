import { Google, Apple, MicrosoftEntraId, generateState, generateCodeVerifier, decodeIdToken } from 'arctic';
import type { OAuth2Tokens } from 'arctic';

export type OAuthProvider = 'google' | 'apple' | 'microsoft';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.PUBLIC_URL || 'http://localhost:4321';

function getGoogle(): Google {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${API_URL}/api/auth/oauth/google/callback`
  );
}

function getApple(): Apple {
  return new Apple(
    process.env.APPLE_CLIENT_ID!,
    process.env.APPLE_TEAM_ID!,
    process.env.APPLE_KEY_ID!,
    new TextEncoder().encode(process.env.APPLE_PRIVATE_KEY!),
    `${API_URL}/api/auth/oauth/apple/callback`
  );
}

function getMicrosoft(): MicrosoftEntraId {
  return new MicrosoftEntraId(
    'common', // multi-tenant
    process.env.MICROSOFT_CLIENT_ID!,
    process.env.MICROSOFT_CLIENT_SECRET!,
    `${API_URL}/api/auth/oauth/microsoft/callback`
  );
}

export function getEnabledProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('google');
  }
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    providers.push('apple');
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    providers.push('microsoft');
  }
  return providers;
}

export interface OAuthUserProfile {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providerId: string;
}

export function createAuthorizationURL(provider: OAuthProvider): {
  url: URL;
  state: string;
  codeVerifier: string | null;
} {
  const state = generateState();

  switch (provider) {
    case 'google': {
      const codeVerifier = generateCodeVerifier();
      const url = getGoogle().createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);
      return { url, state, codeVerifier };
    }
    case 'apple': {
      // Apple does not use PKCE
      const url = getApple().createAuthorizationURL(state, ['name', 'email']);
      url.searchParams.set('response_mode', 'form_post');
      return { url, state, codeVerifier: null };
    }
    case 'microsoft': {
      const codeVerifier = generateCodeVerifier();
      const url = getMicrosoft().createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile', 'User.Read']);
      return { url, state, codeVerifier };
    }
  }
}

export async function validateCallback(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string | null
): Promise<OAuth2Tokens> {
  switch (provider) {
    case 'google':
      return await getGoogle().validateAuthorizationCode(code, codeVerifier!);
    case 'apple':
      return await getApple().validateAuthorizationCode(code);
    case 'microsoft':
      return await getMicrosoft().validateAuthorizationCode(code, codeVerifier!);
  }
}

export async function fetchUserProfile(
  provider: OAuthProvider,
  tokens: OAuth2Tokens
): Promise<OAuthUserProfile> {
  switch (provider) {
    case 'google':
      return await fetchGoogleProfile(tokens);
    case 'apple':
      return fetchAppleProfile(tokens);
    case 'microsoft':
      return await fetchMicrosoftProfile(tokens);
  }
}

async function fetchGoogleProfile(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
  const accessToken = tokens.accessToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  const data = await res.json();
  return {
    email: data.email,
    name: data.name || null,
    avatarUrl: data.picture || null,
    providerId: data.sub,
  };
}

function fetchAppleProfile(tokens: OAuth2Tokens): OAuthUserProfile {
  // Apple provides user info via the ID token
  const idToken = tokens.idToken();
  const claims = decodeIdToken(idToken) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
  };

  return {
    email: claims.email || '',
    name: null, // Apple only sends name on the very first authorization; not in the token
    avatarUrl: null, // Apple does not provide avatars
    providerId: claims.sub,
  };
}

async function fetchMicrosoftProfile(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
  const accessToken = tokens.accessToken();

  // Fetch basic profile
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`Microsoft profile failed: ${profileRes.status}`);
  const profile = await profileRes.json();

  // Try to fetch profile photo
  let avatarUrl: string | null = null;
  try {
    const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (photoRes.ok) {
      const arrayBuffer = await photoRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
      avatarUrl = `data:${contentType};base64,${base64}`;
    }
  } catch {
    // Photo not available — not all accounts have one
  }

  return {
    email: profile.mail || profile.userPrincipalName,
    name: profile.displayName || null,
    avatarUrl,
    providerId: profile.id,
  };
}
