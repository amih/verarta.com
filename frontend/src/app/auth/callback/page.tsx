'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getSession, backupKeys, fetchKeys } from '@/lib/api/auth';
import { generateKeyPair, getKeyPair, storeKeyPair, importEncryptedKeyData, getEncryptedKeyData } from '@/lib/crypto/keys';
import { generateAntelopeKeyPair, getAntelopeKey, storeAntelopeKey } from '@/lib/crypto/antelope';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuthStore();
  const [status, setStatus] = useState('Completing sign in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      const token = searchParams.get('token');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError(`Sign in failed: ${errorParam}`);
        return;
      }

      if (!token) {
        setError('No authentication token received');
        return;
      }

      try {
        // Store token
        localStorage.setItem('auth_token', token);

        // Fetch session to get user info
        setStatus('Fetching account details...');
        const session = await getSession();
        const user = {
          id: session.user.userId,
          blockchain_account: session.user.blockchain_account,
          email: session.user.email,
          display_name: session.user.email.split('@')[0],
          is_admin: session.user.is_admin,
          avatar_url: session.user.avatar_url || undefined,
        };

        login(user, token);

        // Ensure encryption keys exist
        setStatus('Setting up encryption keys...');
        await ensureKeys(user.email);

        router.replace('/dashboard');
      } catch (err) {
        console.error('OAuth callback error:', err);
        setError('Failed to complete sign in. Please try again.');
        localStorage.removeItem('auth_token');
      }
    }

    handleCallback();
  }, [searchParams, login, router]);

  if (error) {
    return (
      <div className="text-center">
        <p className="mb-4 text-sm text-red-500">{error}</p>
        <a
          href="/auth/login"
          className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{status}</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center">
          <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}

async function ensureKeys(email: string) {
  // 1. Check if X25519 keys exist locally
  const localKeys = await getKeyPair(email);
  if (localKeys) return;

  // 2. Check if server has a backup
  const serverKeys = await fetchKeys();
  if (serverKeys) {
    await importEncryptedKeyData(email, serverKeys);
    return;
  }

  // 3. Generate fresh keys
  const keyPair = await generateKeyPair();
  await storeKeyPair(email, keyPair);

  // Backup to server
  const encryptedData = await getEncryptedKeyData(email);
  if (encryptedData) {
    await backupKeys(encryptedData);
  }

  // Also generate Antelope key pair if not present
  const antelopeKey = await getAntelopeKey(email);
  if (!antelopeKey) {
    const { privateKey, publicKey } = generateAntelopeKeyPair();
    await storeAntelopeKey(email, privateKey, publicKey);
  }
}
