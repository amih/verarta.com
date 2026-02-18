'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { uploadSchema, type UploadInput } from '@/lib/utils/validation';
import { uploadArtwork } from '@/lib/upload/orchestrator';
import { useAuthStore } from '@/store/auth';
import { useUploadStore } from '@/store/upload';
import { ALLOWED_MIME_TYPES } from '@/types/artwork';
import { Upload, X, FileIcon, FileText, Loader2 } from 'lucide-react';

export function UploadForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const uploads = useUploadStore((s) => s.uploads);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadInput>({
    resolver: zodResolver(uploadSchema),
  });

  const activeUpload = Object.values(uploads).find(
    (u) => u.status !== 'completed' && u.status !== 'error'
  );

  const handleFile = useCallback((f: File) => {
    if (!ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      setError(`Unsupported file type: ${f.type}`);
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File size exceeds 100 MB limit');
      return;
    }
    setError('');
    setFile(f);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function onSubmit(data: UploadInput) {
    if (!file || !user) return;
    setError('');

    try {
      const result = await uploadArtwork({
        file,
        title: data.title,
        email: user.email,
        blockchainAccount: user.blockchain_account,
      });

      // Poll until the history node has indexed the artwork (producer→history sync lag)
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 800));
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/artworks/${result.artworkId}`);
          if (res.ok) break;
        } catch { /* keep polling */ }
      }

      router.push(`/dashboard/artworks/${result.artworkId}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Upload failed');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Upload failed');
      }
    }
  }

  const progressPercent = activeUpload
    ? Math.round((activeUpload.uploadedChunks / activeUpload.totalChunks) * 100)
    : 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Title
        </label>
        <input
          id="title"
          type="text"
          {...register('title')}
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          placeholder="Artwork title"
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      {/* File drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? 'border-zinc-500 bg-zinc-100 dark:bg-zinc-800'
            : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-16 w-16 rounded object-cover"
              />
            ) : file.type === 'application/pdf' ? (
              <div className="flex h-16 w-16 items-center justify-center rounded bg-red-100 dark:bg-red-900/30">
                <FileIcon className="h-8 w-8 text-red-500" />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{file.name}</p>
              <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              <X className="h-4 w-4 text-zinc-500" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-zinc-400" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Drop a file here or click to browse
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Images, PDFs, text files up to 100 MB
            </p>
          </>
        )}
      </div>

      {/* Progress bar */}
      {activeUpload && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>
              {activeUpload.status === 'encrypting' && 'Encrypting...'}
              {activeUpload.status === 'uploading' &&
                `Uploading chunk ${activeUpload.uploadedChunks}/${activeUpload.totalChunks}`}
              {activeUpload.status === 'completing' && 'Finalizing...'}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-zinc-700 transition-all dark:bg-zinc-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!file || !!activeUpload}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {activeUpload ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload Artwork
          </>
        )}
      </button>
    </form>
  );
}
