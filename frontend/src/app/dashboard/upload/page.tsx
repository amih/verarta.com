'use client';

import { UploadForm } from '@/components/artwork/UploadForm';
import { QuotaDisplay } from '@/components/artwork/QuotaDisplay';

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Upload Artwork</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <UploadForm />
          </div>
        </div>
        <div>
          <QuotaDisplay />
        </div>
      </div>
    </div>
  );
}
