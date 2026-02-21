import { PublicHeader } from '@/components/layout/PublicHeader';

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Your Art. Your Data. Always.
        </h1>

        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          Verarta is built to serve artists and collectors — not to own their information.
        </p>

        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          You remain the sole owner of everything you upload.
          Images, provenance records, documents, metadata — all of it belongs to you.
        </p>

        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          We do not sell, transfer, or claim rights over your data. Ever.
        </p>

        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          You can export your records at any time in a standard format. If Verarta ever changes,
          is acquired, or stops operating, you will be notified and given full access to download
          your information.
        </p>

        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Verarta is provided as a free platform to support the art community. While we implement
          reasonable security measures, no digital system can guarantee absolute protection. We are
          committed to transparency and responsible stewardship of your data.
        </p>

        <div className="mt-8 text-zinc-900 dark:text-zinc-100">
          <p className="font-medium">Your artwork.</p>
          <p className="font-medium">Your records.</p>
          <p className="font-medium">Your control.</p>
        </div>
      </div>
    </div>
  );
}
