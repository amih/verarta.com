'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { ShieldCheck, QrCode, Lock } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [verifyId, setVerifyId] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const id = verifyId.trim();
    if (!id) return;
    router.push(`/verify/${encodeURIComponent(id)}`);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-100">
          A Certificate of Authenticity
          <br />
          <span className="text-[#250D59] dark:text-[#DAA5DE]">that cannot be faked.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Verarta records your artwork on a tamper-proof blockchain and issues
          a printable certificate with a QR code any buyer can verify — forever,
          for free, without an account.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth/register"
            className="rounded-lg bg-[#250D59] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a0940]"
          >
            Register your first artwork
          </Link>
          <Link
            href="/auth/login"
            className="rounded-lg border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <QrCode className="h-5 w-5" />
            Verify an artwork
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Bought something with a Verarta certificate? Scan the QR or enter the artwork ID to view its public record.
          </p>
          <form onSubmit={handleVerify} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Artwork ID"
              value={verifyId}
              onChange={(e) => setVerifyId(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#250D59] focus:outline-none focus:ring-2 focus:ring-[#250D59]/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={!verifyId.trim()}
            >
              Verify
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <ShieldCheck className="h-8 w-8 text-[#250D59] dark:text-[#DAA5DE]" />
            <h3 className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Tamper-proof records
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Every artwork you register gets a permanent record on the
              Verarta blockchain. No single party — not even us — can alter it.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <QrCode className="h-8 w-8 text-[#250D59] dark:text-[#DAA5DE]" />
            <h3 className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Buyer-friendly certificates
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Print or email a one-page PDF certificate. Any buyer can scan
              the QR code to confirm the piece is genuine — no account needed.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <Lock className="h-8 w-8 text-[#250D59] dark:text-[#DAA5DE]" />
            <h3 className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Private by default
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Your original files are end-to-end encrypted. You choose what is
              public on the verify page and what stays between you and your buyer.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
