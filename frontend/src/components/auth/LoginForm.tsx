'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { loginSchema, type LoginInput } from '@/lib/utils/validation';
import { login, fetchKeys } from '@/lib/api/auth';
import { authenticateWebAuthn, isWebAuthnSupported } from '@/lib/crypto/webauthn';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { generateAntelopeKeyPair, getAntelopeKey, storeAntelopeKey, addDeviceKey, migrateOwnerPermission, needsOwnerMigration } from '@/lib/crypto/antelope';
import { useAuthStore } from '@/store/auth';
import { Loader2 } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const loginStore = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setError('');
    setLoading(true);
    try {
      // 1. Login with backend (gets user + credential info)
      const result = await login(data);

      // 2. Authenticate with WebAuthn if supported
      if (isWebAuthnSupported() && result.user.webauthn_credential_id) {
        try {
          await authenticateWebAuthn(result.user.webauthn_credential_id);
        } catch {
          // WebAuthn auth failed — still logged in via JWT, but warn user
          console.warn('WebAuthn authentication skipped');
        }
      }

      // 3. Store session
      loginStore(result.user, result.token);

      // 3b. Restore encryption keys if missing locally
      try {
        const localKeys = await getKeyPair(data.email);
        if (!localKeys) {
          const serverKeys = await fetchKeys();
          if (serverKeys) {
            await importEncryptedKeyData(data.email, serverKeys);
          }
        }
      } catch (e) {
        console.warn('Failed to restore encryption keys:', e);
      }

      // 3c. Ensure Antelope signing keys and add to on-chain account
      try {
        let antelopeKey = await getAntelopeKey(data.email);
        if (!antelopeKey) {
          const { privateKey, publicKey } = generateAntelopeKeyPair();
          await storeAntelopeKey(data.email, privateKey, publicKey);
          antelopeKey = { privateKey, publicKey };
        }

        // Ensure owner migration then add device key
        if (result.user.blockchain_account) {
          try {
            if (await needsOwnerMigration(result.user.blockchain_account)) {
              console.log('Migrating owner permission for', result.user.blockchain_account);
              await migrateOwnerPermission(result.user.blockchain_account, antelopeKey.privateKey);
            }
          } catch (err) {
            console.warn('Owner migration skipped (not the original device):', err);
          }

          try {
            await addDeviceKey(antelopeKey.publicKey);
          } catch (err) {
            console.error('Failed to add device key:', err);
          }
        }
      } catch (e) {
        console.warn('Failed to sync Antelope keys:', e);
      }

      // 4. Redirect to dashboard
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Login failed');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="you@example.com"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
