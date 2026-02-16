'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { verifyEmailSchema, type VerifyEmailInput } from '@/lib/utils/validation';
import { verifyEmail, createAccount, backupKeys } from '@/lib/api/auth';
import { registerWebAuthnCredential, isWebAuthnSupported } from '@/lib/crypto/webauthn';
import { getEncryptedKeyData } from '@/lib/crypto/keys';
import { useAuthStore } from '@/store/auth';
import { Loader2 } from 'lucide-react';

export function VerifyEmailForm() {
  const router = useRouter();
  const loginStore = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'verify' | 'webauthn'>('verify');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('verarta_register_email');
    if (storedEmail) setEmail(storedEmail);
    else router.push('/auth/register');
  }, [router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
  });

  useEffect(() => {
    if (email) setValue('email', email);
  }, [email, setValue]);

  async function onSubmit(data: VerifyEmailInput) {
    setError('');
    setLoading(true);
    try {
      // 1. Verify email
      await verifyEmail(data);
      setStep('webauthn');

      // 2. Register WebAuthn credential
      const displayName = email.split('@')[0];
      let credentialId = '';
      let publicKey = '';

      if (isWebAuthnSupported()) {
        const credential = await registerWebAuthnCredential(email, displayName);
        credentialId = credential.credentialId;
        publicKey = credential.publicKey;
      } else {
        // Fallback: use placeholder for environments without WebAuthn
        credentialId = 'no-webauthn-' + Date.now();
        publicKey = sessionStorage.getItem('verarta_register_pubkey') || '';
      }

      // 3. Create blockchain account (with Antelope public key for on-chain identity)
      const antelopePublicKey = sessionStorage.getItem('verarta_register_antelope_pubkey') || '';
      const result = await createAccount({
        email,
        webauthn_credential_id: credentialId,
        webauthn_public_key: publicKey,
        antelope_public_key: antelopePublicKey,
      });

      // 4. Store session
      loginStore(result.user, result.token);

      // 4b. Backup encryption keys to server
      try {
        const keyData = await getEncryptedKeyData(email);
        if (keyData) {
          await backupKeys(keyData);
        }
      } catch (e) {
        console.warn('Failed to backup encryption keys:', e);
      }

      // 5. Clean up sessionStorage
      sessionStorage.removeItem('verarta_register_email');
      sessionStorage.removeItem('verarta_register_account');
      sessionStorage.removeItem('verarta_register_pubkey');
      sessionStorage.removeItem('verarta_register_antelope_pubkey');

      // 6. Redirect to dashboard
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Verification failed');
      } else if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('WebAuthn registration was cancelled. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
      setStep('verify');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('email')} />

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        We sent a verification code to <strong>{email}</strong>.
        Enter it below to complete registration.
      </p>

      {step === 'verify' && (
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Verification Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            {...register('code')}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-lg tracking-widest shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="000000"
          />
          {errors.code && (
            <p className="mt-1 text-sm text-red-600">{errors.code.message}</p>
          )}
        </div>
      )}

      {step === 'webauthn' && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Setting up biometric authentication...
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {step === 'verify' && (
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Verifying...' : 'Verify & Continue'}
        </button>
      )}
    </form>
  );
}
