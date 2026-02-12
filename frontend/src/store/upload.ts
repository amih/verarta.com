import { create } from 'zustand';
import type { UploadProgress } from '@/types/artwork';

interface UploadState {
  uploads: Record<string, UploadProgress>;
  startUpload: (uploadId: string, totalChunks: number) => void;
  setEncrypting: (uploadId: string) => void;
  updateProgress: (uploadId: string, uploadedChunks: number) => void;
  setCompleting: (uploadId: string) => void;
  completeUpload: (uploadId: string) => void;
  failUpload: (uploadId: string, error: string) => void;
  removeUpload: (uploadId: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: {},

  startUpload: (uploadId, totalChunks) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { uploadId, uploadedChunks: 0, totalChunks, status: 'uploading' },
      },
    })),

  setEncrypting: (uploadId) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { ...state.uploads[uploadId], status: 'encrypting' },
      },
    })),

  updateProgress: (uploadId, uploadedChunks) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { ...state.uploads[uploadId], uploadedChunks, status: 'uploading' },
      },
    })),

  setCompleting: (uploadId) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { ...state.uploads[uploadId], status: 'completing' },
      },
    })),

  completeUpload: (uploadId) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { ...state.uploads[uploadId], status: 'completed' },
      },
    })),

  failUpload: (uploadId, error) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [uploadId]: { ...state.uploads[uploadId], status: 'error', error },
      },
    })),

  removeUpload: (uploadId) =>
    set((state) => {
      const { [uploadId]: _, ...rest } = state.uploads;
      return { uploads: rest };
    }),
}));
