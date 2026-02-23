'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { uploadSchema, type UploadInput } from '@/lib/utils/validation';
import { uploadArtwork } from '@/lib/upload/orchestrator';
import { useAuthStore } from '@/store/auth';
import { useUploadStore } from '@/store/upload';
import { ALLOWED_MIME_TYPES } from '@/types/artwork';
import { Upload, X, FileIcon, FileText, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ImageEditorModal } from '@/components/artwork/ImageEditorModal';
import { fetchAdminKeys } from '@/lib/api/admin';
import { saveArtworkExtras } from '@/lib/api/artworks';
import { fetchArtists, createArtist, type Artist } from '@/lib/api/artists';
import { fetchCollections, createCollection, type Collection } from '@/lib/api/collections';

function Combobox({
  label,
  items,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  items: { id: number; name: string }[];
  value: { id: number | null; name: string };
  onChange: (val: { id: number | null; name: string }) => void;
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState(value.name);
  const [open, setOpen] = useState(false);

  const filtered = inputVal
    ? items.filter((i) => i.name.toLowerCase().includes(inputVal.toLowerCase()))
    : items;

  function selectItem(item: { id: number; name: string }) {
    onChange({ id: item.id, name: item.name });
    setInputVal(item.name);
    setOpen(false);
  }

  function handleInput(v: string) {
    setInputVal(v);
    onChange({ id: null, name: v });
    setOpen(true);
  }

  const showCreate = inputVal.trim() && !items.some((i) => i.name.toLowerCase() === inputVal.trim().toLowerCase());

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{label}</label>
      <input
        type="text"
        value={inputVal}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {filtered.map((item) => (
            <li
              key={item.id}
              onMouseDown={() => selectItem(item)}
              className="cursor-pointer px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {item.name}
            </li>
          ))}
          {showCreate && (
            <li
              onMouseDown={() => onChange({ id: null, name: inputVal.trim() })}
              className="cursor-pointer px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Create: <span className="font-medium text-zinc-700 dark:text-zinc-200">{inputVal.trim()}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function UploadForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const uploads = useUploadStore((s) => s.uploads);
  const [file, setFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extras state
  const [showMore, setShowMore] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [artist, setArtist] = useState<{ id: number | null; name: string }>({ id: null, name: '' });
  const [collection, setCollection] = useState<{ id: number | null; name: string }>({ id: null, name: '' });
  const [creationDate, setCreationDate] = useState('');
  const [era, setEra] = useState('');

  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[80px] focus:outline-none px-3 py-2',
      },
    },
  });

  useEffect(() => {
    if (showMore && artists.length === 0) {
      fetchArtists().then(setArtists).catch(() => {});
    }
    if (showMore && collections.length === 0) {
      fetchCollections().then(setCollections).catch(() => {});
    }
  }, [showMore]);

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
    if (f.type.startsWith('image/')) {
      setPendingFile(f);
    } else {
      setFile(f);
    }
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
      const adminKeys = await fetchAdminKeys();
      const adminPublicKeys = adminKeys.map((k) => k.public_key);

      const result = await uploadArtwork({
        file,
        title: data.title,
        email: user.email,
        blockchainAccount: user.blockchain_account,
        adminPublicKeys,
      });

      // Save extras if any were filled in
      const hasExtras = artist.name || collection.name || creationDate || era || (editor && editor.getText().trim());
      if (hasExtras) {
        let artistId = artist.id;
        let collectionId = collection.id;

        if (artist.name && !artistId) {
          const created = await createArtist(artist.name);
          artistId = created.id;
          setArtists((prev) => [...prev, created]);
        }
        if (collection.name && !collectionId) {
          const created = await createCollection(collection.name);
          collectionId = created.id;
          setCollections((prev) => [...prev, created]);
        }

        await saveArtworkExtras(result.artworkId, {
          description_html: editor?.getHTML() || null,
          creation_date: creationDate || null,
          era: era || null,
          artist_id: artistId ?? null,
          collection_id: collectionId ?? null,
        });
      }

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
    <>
    {pendingFile && (
      <ImageEditorModal
        file={pendingFile}
        onApply={(edited) => { setFile(edited); setPendingFile(null); }}
        onCancel={() => setPendingFile(null)}
      />
    )}
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

      {/* Collapsible "More details" section */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          More details
        </button>

        {showMore && (
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            {/* Description — Tiptap editor */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Description
              </label>
              {/* Toolbar */}
              <div className="flex gap-1 border border-b-0 border-zinc-300 rounded-t-lg bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  className={`rounded px-2 py-1 text-xs font-bold ${editor?.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-600' : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  className={`rounded px-2 py-1 text-xs italic ${editor?.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-600' : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  className={`rounded px-2 py-1 text-xs ${editor?.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-600' : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
                >
                  •—
                </button>
              </div>
              <div className="rounded-b-lg border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800">
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* Artist combobox */}
            <Combobox
              label="Artist"
              items={artists}
              value={artist}
              onChange={setArtist}
              placeholder="Search or create artist"
            />

            {/* Collection combobox */}
            <Combobox
              label="Collection"
              items={collections}
              value={collection}
              onChange={setCollection}
              placeholder="Search or create collection"
            />

            {/* Creation date */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Creation date
              </label>
              <input
                type="text"
                value={creationDate}
                onChange={(e) => setCreationDate(e.target.value)}
                placeholder='e.g. "1923", "c. 1850"'
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Era */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Era
              </label>
              <input
                type="text"
                value={era}
                onChange={(e) => setEra(e.target.value)}
                placeholder='e.g. "Baroque", "1920s", "Contemporary"'
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
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
    </>
  );
}
