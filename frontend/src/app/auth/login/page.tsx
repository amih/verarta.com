import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Sign in
      </h2>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
          Create one
        </Link>
      </p>
    </>
  );
}
