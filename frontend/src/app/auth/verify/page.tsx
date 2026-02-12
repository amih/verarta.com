import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';

export default function VerifyPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Verify your email
      </h2>
      <VerifyEmailForm />
    </>
  );
}
