import type { APIRoute } from 'astro';
import { query } from '../../../../../lib/db.js';
import { getAndDelete } from '../../../../../lib/redis.js';
import { createSession } from '../../../../../lib/auth.js';
import { validateCallback, fetchUserProfile, type OAuthProvider } from '../../../../../lib/oauth.js';
import { generateAccountName } from '../../../../../lib/accountName.js';
import { createBlockchainAccount } from '../../../../../lib/antelope.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export const GET: APIRoute = async ({ url, redirect }) => {
  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return redirect(`${FRONTEND_URL}/auth/login?error=missing_params`, 302);
    }

    // Validate state via Redis (CSRF protection)
    const storedData = await getAndDelete(`oauth_state:${state}`);
    if (!storedData) {
      return redirect(`${FRONTEND_URL}/auth/login?error=invalid_state`, 302);
    }

    const { provider, codeVerifier } = JSON.parse(storedData) as {
      provider: OAuthProvider;
      codeVerifier: string | null;
    };

    // Exchange code for tokens
    const tokens = await validateCallback(provider, code, codeVerifier);

    // Fetch user profile from provider
    const profile = await fetchUserProfile(provider, tokens);

    if (!profile.email) {
      return redirect(`${FRONTEND_URL}/auth/login?error=no_email`, 302);
    }

    // Check if user exists
    const existingUser = await query(
      'SELECT id, avatar_url, display_name FROM users WHERE email = $1',
      [profile.email]
    );

    let userId: number;

    if (existingUser.rows.length > 0) {
      // Merge: update OAuth info and avatar if not set
      const user = existingUser.rows[0];
      userId = user.id;

      const updates: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      updates.push(`oauth_provider = $${paramIdx++}`);
      params.push(provider);

      updates.push(`oauth_provider_id = $${paramIdx++}`);
      params.push(profile.providerId);

      if (profile.avatarUrl && !user.avatar_url) {
        updates.push(`avatar_url = $${paramIdx++}`);
        params.push(profile.avatarUrl);
      }

      if (profile.name && !user.display_name) {
        updates.push(`display_name = $${paramIdx++}`);
        params.push(profile.name);
      }

      updates.push(`last_login = NOW()`);

      params.push(userId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );
    } else {
      // New user: create account
      const accountName = generateAccountName('user');
      const displayName = profile.name || profile.email.split('@')[0];

      const result = await query(
        `INSERT INTO users (
          blockchain_account, email, display_name, email_verified,
          oauth_provider, oauth_provider_id, avatar_url, last_login
        ) VALUES ($1, $2, $3, TRUE, $4, $5, $6, NOW())
        RETURNING id`,
        [
          accountName,
          profile.email,
          displayName,
          provider,
          profile.providerId,
          profile.avatarUrl,
        ]
      );

      userId = result.rows[0].id;

      // Attempt to create blockchain account (without user's Antelope key — they'll generate one client-side)
      // The blockchain account will be created once the user generates keys on the callback page
      // For now, just reserve the name in the DB
    }

    // Create JWT session
    const token = await createSession(userId);

    return redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`, 302);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return redirect(`${FRONTEND_URL}/auth/login?error=oauth_failed`, 302);
  }
};

// Apple sends callback as POST (form_post response mode)
export const POST: APIRoute = async (context) => {
  try {
    const formData = await context.request.formData();
    const code = formData.get('code') as string | null;
    const state = formData.get('state') as string | null;

    if (!code || !state) {
      return context.redirect(`${FRONTEND_URL}/auth/login?error=missing_params`, 302);
    }

    // Rewrite URL params so the GET handler logic can be reused
    const url = new URL(context.url);
    url.searchParams.set('code', code);
    url.searchParams.set('state', state);

    // Validate state via Redis
    const storedData = await getAndDelete(`oauth_state:${state}`);
    if (!storedData) {
      return context.redirect(`${FRONTEND_URL}/auth/login?error=invalid_state`, 302);
    }

    const { provider, codeVerifier } = JSON.parse(storedData) as {
      provider: OAuthProvider;
      codeVerifier: string | null;
    };

    const tokens = await validateCallback(provider, code, codeVerifier);
    const profile = await fetchUserProfile(provider, tokens);

    if (!profile.email) {
      return context.redirect(`${FRONTEND_URL}/auth/login?error=no_email`, 302);
    }

    // Same merge/create logic as GET
    const existingUser = await query(
      'SELECT id, avatar_url, display_name FROM users WHERE email = $1',
      [profile.email]
    );

    let userId: number;

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      userId = user.id;

      const updates: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      updates.push(`oauth_provider = $${paramIdx++}`);
      params.push(provider);

      updates.push(`oauth_provider_id = $${paramIdx++}`);
      params.push(profile.providerId);

      if (profile.avatarUrl && !user.avatar_url) {
        updates.push(`avatar_url = $${paramIdx++}`);
        params.push(profile.avatarUrl);
      }

      if (profile.name && !user.display_name) {
        updates.push(`display_name = $${paramIdx++}`);
        params.push(profile.name);
      }

      updates.push(`last_login = NOW()`);

      params.push(userId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );
    } else {
      const accountName = generateAccountName('user');
      const displayName = profile.name || profile.email.split('@')[0];

      const result = await query(
        `INSERT INTO users (
          blockchain_account, email, display_name, email_verified,
          oauth_provider, oauth_provider_id, avatar_url, last_login
        ) VALUES ($1, $2, $3, TRUE, $4, $5, $6, NOW())
        RETURNING id`,
        [accountName, profile.email, displayName, provider, profile.providerId, profile.avatarUrl]
      );

      userId = result.rows[0].id;
    }

    const token = await createSession(userId);

    return context.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`, 302);
  } catch (error) {
    console.error('OAuth POST callback error:', error);
    return context.redirect(`${FRONTEND_URL}/auth/login?error=oauth_failed`, 302);
  }
};
