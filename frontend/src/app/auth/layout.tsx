import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Image
            src="/logo/logo-dark.svg"
            alt="Verarta"
            width={420}
            height={90}
            className="block w-full dark:hidden"
            priority
          />
          <Image
            src="/logo/logo-light.svg"
            alt="Verarta"
            width={420}
            height={90}
            className="hidden w-full dark:block"
            priority
          />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {children}
        </div>
      </div>
    </div>
  );
}
