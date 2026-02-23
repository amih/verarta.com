'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { DragEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  getArtwork,
  getArtworkExtras,
  saveArtworkExtras,
  getArtworkHistory,
  deleteArtwork,
  deleteArtworkFile,
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
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
  Clock,
  Upload,
  Trash2,
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

  // Delete dialog
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // File order state (edit mode)
  const [editFileOrder, setEditFileOrder] = useState<number[]>([]);

  // Drag-and-drop state
  const dragFileId = useRef<number | null>(null);
  const dragOverFileId = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // File delete state
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<number | null>(null);

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

  const displayedFiles = useMemo(() => {
    const files = data?.artwork?.files ?? [];
    const order = editMode ? editFileOrder : (extras?.file_order ?? []);
    if (!order.length) return files;
    return [...files].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [data?.artwork?.files, extras?.file_order, editMode, editFileOrder]);

  function handleDragStart(fileId: number) {
    dragFileId.current = fileId;
  }

  function handleDragOver(e: DragEvent, fileId: number) {
    e.preventDefault();
    if (dragFileId.current === fileId) return;
    dragOverFileId.current = fileId;
    setDragOverId(fileId);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const from = dragFileId.current;
    const to = dragOverFileId.current;
    if (from === null || to === null || from === to) {
      dragFileId.current = null;
      dragOverFileId.current = null;
      setDragOverId(null);
      return;
    }
    setEditFileOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
    dragFileId.current = null;
    dragOverFileId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragFileId.current = null;
    dragOverFileId.current = null;
    setDragOverId(null);
  }

  async function handleDeleteFile(fileId: number) {
    setConfirmDeleteFileId(null);
    setDeletingFileId(fileId);
    try {
      await deleteArtworkFile(id, fileId);
      setEditFileOrder((prev) => prev.filter((fid) => fid !== fileId));
      await queryClient.invalidateQueries({ queryKey: ['artwork', id] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeletingFileId(null);
    }
  }

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
    setEditFileOrder(
      extras?.file_order?.length
        ? extras.file_order
        : artwork.files.map((f) => f.id)
    );
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
        file_order: editFileOrder.length ? editFileOrder : null,
      });

      await queryClient.invalidateQueries({ queryKey: ['artwork-extras', id] });
      setEditMode(false);
    } catch {
      setEditError('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteArtwork(id, user.email);
      // Optimistically remove from all cached artwork lists — the blockchain
      // takes a moment to finalize, so a refetch would still return this item.
      queryClient.setQueriesData(
        { queryKey: ['artworks'] },
        (old: any) => {
          if (!old?.artworks) return old;
          const artworks = old.artworks.filter((a: any) => String(a.id) !== String(id));
          return { ...old, artworks, count: artworks.length };
        }
      );
      router.push('/dashboard');
    } catch {
      setDeleting(false);
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

  // Derive owner display name from history events
  const ownerDisplayName = useMemo(() => {
    if (!historyData?.events.length) return null;
    for (const e of [...historyData.events].reverse()) {
      if (e.type === 'transferred' && e.to === artwork.owner) return e.to_name ?? null;
      if (e.type === 'created' && e.account === artwork.owner) return e.account_name ?? null;
    }
    return null;
  }, [historyData, artwork.owner]);

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
              Owner:{' '}
              <span className="text-zinc-700 dark:text-zinc-300">
                {ownerDisplayName ?? artwork.owner}
              </span>
              {ownerDisplayName && (
                <span className="ml-1 text-zinc-400 dark:text-zinc-500">({artwork.owner})</span>
              )}
              {' '}&middot;{' '}Created: {new Date(artwork.created_at).toLocaleString()}
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
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete
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

      {/* Image previews */}
      {(() => {
        const imageFiles = displayedFiles.filter(
          (f) => f.mime_type?.startsWith('image/') && f.upload_complete && !f.is_thumbnail
        );
        if (imageFiles.length === 0) return null;
        const [mainImage, ...additionalImages] = imageFiles;
        return (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <FileViewer
              fileId={mainImage.id}
              filename={mainImage.filename}
              mimeType={mainImage.mime_type}
              autoDecrypt
            />
            {additionalImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                {additionalImages.map((img) => (
                  <FileViewer
                    key={img.id}
                    fileId={img.id}
                    filename={img.filename}
                    mimeType={img.mime_type}
                    autoDecrypt
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Files section */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Files</h2>

        {displayedFiles.filter((f) => !f.is_thumbnail).length > 0 && (
          <div className="space-y-2 mb-4">
            {displayedFiles.filter((f) => !f.is_thumbnail).map((file) => (
              <div
                key={file.id}
                draggable={editMode && isOwner}
                onDragStart={() => handleDragStart(file.id)}
                onDragOver={(e) => editMode && isOwner && handleDragOver(e, file.id)}
                onDrop={(e) => editMode && isOwner && handleDrop(e)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                  dragOverId === file.id
                    ? 'border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/70'
                    : 'border-zinc-100 dark:border-zinc-800'
                } ${editMode && isOwner ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {editMode && isOwner && (
                    <GripVertical className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                  )}
                  <FileIcon className="h-5 w-5 shrink-0 text-zinc-400" />
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
                <div className="flex items-center gap-2">
                  {editMode && isOwner && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteFileId(confirmDeleteFileId === file.id ? null : file.id)}
                        disabled={deletingFileId === file.id}
                        title="Delete file"
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      >
                        {deletingFileId === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      {confirmDeleteFileId === file.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Delete this file permanently?
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            This cannot be undone.
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id)}
                              className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFileId(null)}
                              className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {file.upload_complete && (
                    <FileViewer
                      fileId={file.id}
                      filename={file.filename}
                      mimeType={file.mime_type}
                    />
                  )}
                </div>
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
                    {event.type === 'created' ? (
                      <>
                        Created by{' '}
                        <span className="font-medium">{event.account_name ?? event.account}</span>
                        {event.account_name && (
                          <span className="ml-1 text-zinc-400 dark:text-zinc-500">({event.account})</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{event.from_name ?? event.from}</span>
                        {event.from_name && (
                          <span className="ml-1 text-zinc-400 dark:text-zinc-500">({event.from})</span>
                        )}
                        {' → '}
                        <span className="font-medium">{event.to_name ?? event.to}</span>
                        {event.to_name && (
                          <span className="ml-1 text-zinc-400 dark:text-zinc-500">({event.to})</span>
                        )}
                      </>
                    )}
                  </p>
                  {event.message && (
                    <p className="mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400">
                      "{event.message}"
                    </p>
                  )}
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

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete artwork permanently?
            </h2>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently transfer <strong>{displayTitle}</strong> to a reserved account,
              removing it from your collection. You will no longer be able to access or decrypt its files.
            </p>
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              This action cannot be undone. The blockchain will record the transfer as an immutable
              audit trail. Administrators will retain access to the encrypted files.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
