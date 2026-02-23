'use client';

import { useState, useEffect, useRef } from 'react';
import type { DragEvent } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Loader2, X } from 'lucide-react';
import { decryptFile } from '@/lib/crypto/encryption';
import { getKeyPair, importEncryptedKeyData } from '@/lib/crypto/keys';
import { fetchKeys } from '@/lib/api/auth';
import { downloadFileRaw } from '@/lib/api/artworks';
import { queryTable } from '@/lib/api/chain';
import { useAuthStore } from '@/store/auth';
import type { ArtworkFile } from '@/types/api';

interface OnChainFileMeta {
  file_id: number;
  encrypted_dek: string;
  iv: string;
  auth_tag: string;
}

interface ImageGridProps {
  files: ArtworkFile[];
  editMode?: boolean;
  /** Full file-ID order array (all files, not just images). */
  fileOrder: number[];
  /** Called with the updated full file-ID order after a drag-reorder. */
  onReorder: (newFullOrder: number[]) => void;
}

export function ImageGrid({ files, editMode, fileOrder, onReorder }: ImageGridProps) {
  const user = useAuthStore((s) => s.user);
  const [urls, setUrls] = useState<Map<number, string>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Drag state
  const dragId = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Decrypt all images on mount / when files change
  useEffect(() => {
    if (!user) return;

    files.forEach(async (file) => {
      setUrls((prev) => {
        if (prev.has(file.id)) return prev; // already decrypted
        return prev;
      });

      setLoadingIds((prev) => {
        if (prev.has(file.id)) return prev;
        const next = new Set(prev);
        next.add(file.id);
        return next;
      });

      try {
        let keyPair = await getKeyPair(user.email);
        if (!keyPair) {
          const serverKeys = await fetchKeys();
          if (serverKeys) {
            await importEncryptedKeyData(user.email, serverKeys);
            keyPair = await getKeyPair(user.email);
          }
        }
        if (!keyPair) return;

        const tableResult = await queryTable<OnChainFileMeta>({
          code: 'verarta.core',
          scope: 'verarta.core',
          table: 'artfiles',
          key_type: 'i64',
          lower_bound: String(file.id),
          limit: 1,
        });

        const meta = tableResult.rows.find((r) => String(r.file_id) === String(file.id));
        if (!meta) return;

        const encryptedBytes = await downloadFileRaw(file.id);
        const decryptedBuffer = await decryptFile(
          new Uint8Array(encryptedBytes),
          meta.iv,
          meta.encrypted_dek,
          meta.auth_tag,
          keyPair.privateKey
        );

        const blob = new Blob([decryptedBuffer], { type: file.mime_type });
        const objectUrl = URL.createObjectURL(blob);
        setUrls((prev) => new Map(prev).set(file.id, objectUrl));
      } catch {
        // silent fail — cell stays as loading placeholder
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
    });
  }, [files, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      setUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return new Map();
      });
    };
  }, []);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === 'ArrowRight')
        setLightboxIndex((i) => (i !== null && i < files.length - 1 ? i + 1 : i));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, files.length]);

  // Touch swipe for lightbox
  const touchStartX = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return; // ignore short swipes
    if (delta < 0) {
      // swipe left → next
      setLightboxIndex((i) => (i !== null && i < files.length - 1 ? i + 1 : i));
    } else {
      // swipe right → prev
      setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    }
  }

  // Drag-and-drop handlers
  function handleDragStart(fileId: number) {
    dragId.current = fileId;
  }

  function handleDragOver(e: DragEvent, fileId: number) {
    e.preventDefault();
    if (dragId.current === fileId) return;
    setDragOverId(fileId);
  }

  function handleDrop(e: DragEvent, targetId: number) {
    e.preventDefault();
    const fromId = dragId.current;
    if (!fromId || fromId === targetId) {
      dragId.current = null;
      setDragOverId(null);
      return;
    }

    // Rebuild the full file order, moving the dragged image to the target's position
    const imageIds = files.map((f) => f.id);
    const newImageIds = [...imageIds];
    const fromIdx = newImageIds.indexOf(fromId);
    const toIdx = newImageIds.indexOf(targetId);
    newImageIds.splice(fromIdx, 1);
    newImageIds.splice(toIdx, 0, fromId);

    // Slot the new image order back into the full file order
    const imageSet = new Set(imageIds);
    const positions: number[] = [];
    fileOrder.forEach((id, i) => { if (imageSet.has(id)) positions.push(i); });
    const newFullOrder = [...fileOrder];
    positions.forEach((pos, i) => { newFullOrder[pos] = newImageIds[i]; });

    onReorder(newFullOrder);
    dragId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragId.current = null;
    setDragOverId(null);
  }

  if (files.length === 0) return null;

  const cols =
    files.length === 1 ? 'grid-cols-1' :
    files.length === 2 ? 'grid-cols-2' :
    'grid-cols-3';

  return (
    <>
      <div className={`grid ${cols} gap-2`}>
        {files.map((file, idx) => {
          const url = urls.get(file.id);
          const isLoading = loadingIds.has(file.id);
          const isDragOver = dragOverId === file.id;

          return (
            <div
              key={file.id}
              draggable={editMode}
              onDragStart={() => editMode && handleDragStart(file.id)}
              onDragOver={(e) => editMode && handleDragOver(e, file.id)}
              onDrop={(e) => editMode && handleDrop(e, file.id)}
              onDragEnd={handleDragEnd}
              onClick={() => { if (!editMode && url) setLightboxIndex(idx); }}
              className={[
                'relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800',
                !editMode && url ? 'cursor-pointer' : '',
                editMode ? 'cursor-grab active:cursor-grabbing' : '',
                isDragOver ? 'ring-2 ring-zinc-400 dark:ring-zinc-500' : '',
              ].join(' ')}
            >
              {isLoading && !url && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              )}
              {url && (
                <img src={url} alt={file.filename} className="h-full w-full object-cover" />
              )}
              {editMode && (
                <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/40 p-1">
                  <GripVertical className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/25 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev */}
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/25 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {lightboxIndex < files.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/25 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <div onClick={(e) => e.stopPropagation()}>
            {(() => {
              const file = files[lightboxIndex];
              const url = urls.get(file.id);
              if (!url) {
                return (
                  <div className="flex h-64 w-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/60" />
                  </div>
                );
              }
              return (
                <img
                  src={url}
                  alt={file.filename}
                  className="max-h-[85vh] max-w-[85vw] object-contain"
                />
              );
            })()}
          </div>

          {/* Dot indicators */}
          {files.length > 1 && (
            <div className="absolute bottom-5 flex gap-2">
              {files.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === lightboxIndex ? 'bg-white' : 'bg-white/35 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
