'use client';

import { useRef, useEffect, useState } from 'react';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.min.css';
import { X, RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';

interface Props {
  file: File;
  onApply: (editedFile: File) => void;
  onCancel: () => void;
}

type AspectRatio = 'free' | '1:1' | '4:3' | '16:9';

const ASPECT_RATIOS: { label: string; value: AspectRatio; ratio: number }[] = [
  { label: 'Free', value: 'free', ratio: NaN },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
];

export function ImageEditorModal({ file, onApply, onCancel }: Props) {
  const cropperRef = useRef<HTMLImageElement & { cropper: Cropper }>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [applying, setApplying] = useState(false);
  const scaleX = useRef(1);
  const scaleY = useRef(1);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function rotate(deg: number) {
    cropperRef.current?.cropper.rotate(deg);
  }

  function flipH() {
    scaleX.current = -scaleX.current;
    cropperRef.current?.cropper.scaleX(scaleX.current);
  }

  function flipV() {
    scaleY.current = -scaleY.current;
    cropperRef.current?.cropper.scaleY(scaleY.current);
  }

  function setAspect(value: AspectRatio, ratio: number) {
    setAspectRatio(value);
    cropperRef.current?.cropper.setAspectRatio(ratio);
  }

  function handleApply() {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    setApplying(true);
    const type = file.type || 'image/jpeg';
    const canvas = cropper.getCroppedCanvas();
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onApply(new File([blob], file.name, { type }));
        }
        setApplying(false);
      },
      type,
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="truncate text-sm font-medium text-zinc-300">{file.name}</span>
        <button
          onClick={onCancel}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Cropper */}
      <div className="min-h-0 flex-1">
        {objectUrl && (
          <Cropper
            ref={cropperRef}
            src={objectUrl}
            style={{ height: '100%', width: '100%' }}
            aspectRatio={NaN}
            guides
            autoCropArea={1}
            viewMode={1}
          />
        )}
      </div>

      {/* Toolbar */}
      <div className="shrink-0 space-y-3 border-t border-white/10 bg-zinc-900 px-4 py-3">
        {/* Rotate / Flip */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => rotate(-90)}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4" />
            −90°
          </button>
          <button
            onClick={() => rotate(90)}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
          >
            <RotateCw className="h-4 w-4" />
            +90°
          </button>
          <button
            onClick={flipH}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
          >
            <FlipHorizontal className="h-4 w-4" />
            Flip H
          </button>
          <button
            onClick={flipV}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
          >
            <FlipVertical className="h-4 w-4" />
            Flip V
          </button>
        </div>

        {/* Aspect ratio */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Aspect:</span>
          {ASPECT_RATIOS.map(({ label, value, ratio }) => (
            <button
              key={value}
              onClick={() => setAspect(value, ratio)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                aspectRatio === value
                  ? 'border-zinc-300 bg-white/15 text-white'
                  : 'border-white/20 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
