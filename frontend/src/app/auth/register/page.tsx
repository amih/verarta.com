import Link from 'next/link';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { SSOButtons } from '@/components/auth/SSOButtons';

export default function RegisterPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Create your account
      </h2>
      <SSOButtons />
      <RegisterForm />
      <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </>
  );
}
