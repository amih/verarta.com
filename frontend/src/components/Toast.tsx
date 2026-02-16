'use client';

import { useToastStore, type ToastType } from '@/store/toast';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
};

const bgColors: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  error: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg ${bgColors[toast.type]}`}
        >
          {icons[toast.type]}
          <span className="text-sm text-zinc-800 dark:text-zinc-200">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-3 w-3 text-zinc-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
