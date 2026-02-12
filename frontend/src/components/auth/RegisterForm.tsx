'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { registerSchema, type RegisterInput } from '@/lib/utils/validation';
import { register as registerUser } from '@/lib/api/auth';
import { generateKeyPair, storeKeyPair } from '@/lib/crypto/keys';
import { Loader2 } from 'lucide-react';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterInput) {
    setError('');
    setLoading(true);
    try {
      // 1. Generate X25519 key pair
      const keyPair = await generateKeyPair();

      // 2. Store key pair locally (encrypted in IndexedDB)
      await storeKeyPair(data.email, keyPair);

      // 3. Register with backend
      const result = await registerUser(data);

      // 4. Store email + account for verification page
      sessionStorage.setItem('verarta_register_email', data.email);
      sessionStorage.setItem('verarta_register_account', result.blockchain_account);
      sessionStorage.setItem('verarta_register_pubkey', keyPair.publicKey);

      // 5. Redirect to verification
      router.push('/auth/verify');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Registration failed');
      } else {
        setError('Registration failed. Please try again.');
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

      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Display Name
        </label>
        <input
          id="display_name"
          type="text"
          autoComplete="name"
          {...register('display_name')}
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="Your name"
        />
        {errors.display_name && (
          <p className="mt-1 text-sm text-red-600">{errors.display_name.message}</p>
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
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}
