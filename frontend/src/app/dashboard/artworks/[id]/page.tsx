'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  getArtwork,
  getArtworkExtras,
  saveArtworkExtras,
  getArtworkHistory,
} from '@/lib/api/artworks';
import { fetchArtists, createArtist, type Artist } from '@/lib/api/artists';
import { fetchCollections, createCollection, type Collection } from '@/lib/api/collections';
import { fetchAdminKeys } from '@/lib/api/admin';
import { addFileToArtwork } from '@/lib/upload/orchestrator';
import { FileViewer } from '@/components/artwork/FileViewer';
import { TransferDialog } from '@/components/artwork/TransferDialog';
import { useAuthStore } from '@/store/auth';
import { ALLOWED_MIME_TYPES } from '@/types/artwork';
import {
  ArrowRightLeft,
  FileIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
  Clock,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

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

  useEffect(() => {
    setInputVal(value.name);
  }, [value.name]);

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

  const showCreate =
    inputVal.trim() &&
    !items.some((i) => i.name.toLowerCase() === inputVal.trim().toLowerCase());

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
        {label}
      </label>
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
              Create:{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {inputVal.trim()}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function ArtworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Transfer dialog
  const [showTransfer, setShowTransfer] = useState(false);

  // Edit form state
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCreationDate, setEditCreationDate] = useState('');
  const [editEra, setEditEra] = useState('');
  const [editArtist, setEditArtist] = useState<{ id: number | null; name: string }>({ id: null, name: '' });
  const [editCollection, setEditCollection] = useState<{ id: number | null; name: string }>({ id: null, name: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Add file state
  const [addFileMode, setAddFileMode] = useState(false);
  const [addFileFile, setAddFileFile] = useState<File | null>(null);
  const [addFileDragOver, setAddFileDragOver] = useState(false);
  const [addFileError, setAddFileError] = useState('');
  const [addFileUploading, setAddFileUploading] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[80px] focus:outline-none px-3 py-2',
      },
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['artwork', id],
    queryFn: () => getArtwork(id),
    enabled: !isNaN(id),
  });

  const { data: extras } = useQuery({
    queryKey: ['artwork-extras', id],
    queryFn: () => getArtworkExtras(id),
    enabled: !isNaN(id),
  });

  const { data: historyData } = useQuery({
    queryKey: ['artwork-history', id],
    queryFn: () => getArtworkHistory(id),
    enabled: !isNaN(id),
    retry: false,
  });

  function enterEditMode() {
    if (!data) return;
    const artwork = data.artwork;
    setEditTitle(extras?.title || artwork.title);
    setEditCreationDate(extras?.creation_date || '');
    setEditEra(extras?.era || '');
    setEditArtist(
      extras?.artist_id
        ? { id: extras.artist_id, name: extras.artist_name || '' }
        : { id: null, name: '' }
    );
    setEditCollection(
      extras?.collection_id
        ? { id: extras.collection_id, name: extras.collection_name || '' }
        : { id: null, name: '' }
    );
    editor?.commands.setContent(extras?.description_html || '');
    setEditError('');
    if (artists.length === 0) fetchArtists().then(setArtists).catch(() => {});
    if (collections.length === 0) fetchCollections().then(setCollections).catch(() => {});
    setEditMode(true);
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError('');
    try {
      let artistId = editArtist.id;
      let collectionId = editCollection.id;

      if (editArtist.name && !artistId) {
        const created = await createArtist(editArtist.name);
        artistId = created.id;
        setArtists((prev) => [...prev, created]);
      }
      if (editCollection.name && !collectionId) {
        const created = await createCollection(editCollection.name);
        collectionId = created.id;
        setCollections((prev) => [...prev, created]);
      }

      await saveArtworkExtras(id, {
        title: editTitle || undefined,
        description_html: editor?.getHTML() || null,
        creation_date: editCreationDate || null,
        era: editEra || null,
        artist_id: artistId ?? null,
        collection_id: collectionId ?? null,
      });

      await queryClient.invalidateQueries({ queryKey: ['artwork-extras', id] });
      setEditMode(false);
    } catch {
      setEditError('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  const handleAddFile = useCallback((f: File) => {
    if (!ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      setAddFileError(`Unsupported file type: ${f.type}`);
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setAddFileError('File size exceeds 100 MB limit');
      return;
    }
    setAddFileError('');
    setAddFileFile(f);
  }, []);

  async function submitAddFile() {
    if (!addFileFile || !user) return;
    setAddFileUploading(true);
    setAddFileError('');
    try {
      const adminKeys = await fetchAdminKeys();
      const adminPublicKeys = adminKeys.map((k) => k.public_key);
      const currentFileCount = data?.artwork.files.length ?? 0;

      await addFileToArtwork({
        artworkId: id,
        file: addFileFile,
        email: user.email,
        blockchainAccount: user.blockchain_account,
        adminPublicKeys,
      });

      // Poll until the history node has indexed the new file (producer→history lag)
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 800));
        try {
          const updated = await getArtwork(id);
          if (updated.artwork.files.length > currentFileCount) break;
        } catch { /* keep polling */ }
      }

      await queryClient.invalidateQueries({ queryKey: ['artwork', id] });
      setAddFileMode(false);
      setAddFileFile(null);
    } catch (err) {
      setAddFileError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAddFileUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          &larr; Back to dashboard
        </Link>
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          Artwork not found.
        </div>
      </div>
    );
  }

  const { artwork } = data;
  const isOwner = user?.blockchain_account === artwork.owner;
  const displayTitle = extras?.title || artwork.title;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
        &larr; Back to dashboard
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{displayTitle}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Owner: {artwork.owner} &middot; Created: {new Date(artwork.created_at).toLocaleString()}
            </p>
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={editMode ? () => setEditMode(false) : enterEditMode}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {editMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editMode ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={() => setShowTransfer(true)}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer
              </button>
            </div>
          )}
        </div>

        {/* Extras metadata row (hidden in edit mode) */}
        {!editMode && extras && (extras.artist_name || extras.collection_name || extras.era || extras.creation_date) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {extras.artist_name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-400">Artist</span>
                {extras.artist_name}
              </span>
            )}
            {extras.collection_name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <span className="text-blue-400">Collection</span>
                {extras.collection_name}
              </span>
            )}
            {extras.era && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <span className="text-amber-400">Era</span>
                {extras.era}
              </span>
            )}
            {extras.creation_date && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-400">Date</span>
                {extras.creation_date}
              </span>
            )}
          </div>
        )}

        {/* Inline edit form */}
        {editMode && (
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Description
              </label>
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

            <Combobox
              label="Artist"
              items={artists}
              value={editArtist}
              onChange={setEditArtist}
              placeholder="Search or create artist"
            />

            <Combobox
              label="Collection"
              items={collections}
              value={editCollection}
              onChange={setEditCollection}
              placeholder="Search or create collection"
            />

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Creation date
              </label>
              <input
                type="text"
                value={editCreationDate}
                onChange={(e) => setEditCreationDate(e.target.value)}
                placeholder='e.g. "1923", "c. 1850"'
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Era
              </label>
              <input
                type="text"
                value={editEra}
                onChange={(e) => setEditEra(e.target.value)}
                placeholder='e.g. "Baroque", "1920s", "Contemporary"'
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {editError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {editError}
              </div>
            )}

            <button
              type="button"
              onClick={saveEdit}
              disabled={editSaving}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {editSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {!editMode && extras?.description_html && extras.description_html !== '<p></p>' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</h2>
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400"
            dangerouslySetInnerHTML={{ __html: extras.description_html }}
          />
        </div>
      )}

      {/* Image preview */}
      {(() => {
        const imageFile = artwork.files.find(
          (f) => f.mime_type?.startsWith('image/') && f.upload_complete
        );
        if (!imageFile) return null;
        return (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <FileViewer
              fileId={imageFile.id}
              filename={imageFile.filename}
              mimeType={imageFile.mime_type}
              autoDecrypt
            />
          </div>
        );
      })()}

      {/* Files section */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Files</h2>

        {artwork.files.length > 0 && (
          <div className="space-y-3 mb-4">
            {artwork.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <FileIcon className="h-5 w-5 text-zinc-400" />
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {file.filename}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {file.mime_type} &middot; {(file.file_size / 1024 / 1024).toFixed(2)} MB
                      {!file.upload_complete && (
                        <span className="ml-2 text-amber-600">
                          ({file.uploaded_chunks}/{file.total_chunks} chunks)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {file.upload_complete && (
                  <FileViewer
                    fileId={file.id}
                    filename={file.filename}
                    mimeType={file.mime_type}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add file */}
        {isOwner && (
          <div>
            {!addFileMode ? (
              <button
                onClick={() => {
                  setAddFileMode(true);
                  setAddFileFile(null);
                  setAddFileError('');
                }}
                className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
              >
                <Plus className="h-4 w-4" />
                Add file
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setAddFileDragOver(true);
                  }}
                  onDragLeave={() => setAddFileDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setAddFileDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleAddFile(f);
                  }}
                  onClick={() => addFileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                    addFileDragOver
                      ? 'border-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                      : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600'
                  }`}
                >
                  <input
                    ref={addFileInputRef}
                    type="file"
                    accept={ALLOWED_MIME_TYPES.join(',')}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAddFile(f);
                    }}
                  />
                  {addFileFile ? (
                    <div className="flex items-center gap-3">
                      <FileIcon className="h-6 w-6 text-zinc-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {addFileFile.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {(addFileFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddFileFile(null);
                        }}
                        className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        <X className="h-4 w-4 text-zinc-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="mb-2 h-6 w-6 text-zinc-400" />
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Drop a file or click to browse
                      </p>
                    </>
                  )}
                </div>

                {addFileError && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {addFileError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitAddFile}
                    disabled={!addFileFile || addFileUploading}
                    className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {addFileUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddFileMode(false);
                      setAddFileFile(null);
                      setAddFileError('');
                    }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ownership History */}
      {historyData && historyData.events.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <Clock className="h-4 w-4" />
            Ownership History
          </h2>
          <div className="space-y-3">
            {historyData.events.map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {event.type === 'created'
                      ? `Created by ${event.account}`
                      : `${event.from} → ${event.to}`}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTransfer && (
        <TransferDialog
          artworkId={artwork.id}
          artworkTitle={artwork.title}
          files={artwork.files}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => {
            setShowTransfer(false);
            router.push('/dashboard');
          }}
        />
      )}
    </div>
  );
}
