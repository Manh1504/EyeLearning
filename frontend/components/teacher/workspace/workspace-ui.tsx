'use client';

// components/teacher/workspace/workspace-ui.tsx — UI primitives dùng chung
// cho workspace (shell + 3 tab): Card, IconBtn, PrimaryBtn, EmptyState, ...

import { type ReactNode, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

export const CARD = 'rounded-2xl border border-slate-200 bg-white';
export const INPUT_CLS = 'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100';

export const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-400/90 text-emerald-950',
  draft: 'bg-amber-300/90 text-amber-950',
  archived: 'bg-slate-200/90 text-slate-600',
};

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`${CARD} ${className}`}>{children}</section>;
}

export function IconBtn({
  title, onClick, tone = 'slate', className = '', children,
}: {
  title: string; onClick?: () => void; tone?: 'slate' | 'rose'; className?: string; children: ReactNode;
}) {
  const hover = tone === 'rose' ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-slate-100 hover:text-slate-600';
  return (
    <button onClick={onClick} title={title} className={`shrink-0 rounded p-1 text-slate-300 transition ${hover} ${className}`}>
      {children}
    </button>
  );
}

export function PrimaryBtn({
  onClick, className = '', children, disabled, title,
}: {
  onClick?: () => void; className?: string; children: ReactNode; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon, title, desc, descClass = '', className = '', children,
}: {
  icon: ReactNode; title: string; desc?: ReactNode; descClass?: string; className?: string; children?: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-700">{title}</p>
      {desc && <p className={`mt-1 text-xs text-slate-400 ${descClass}`}>{desc}</p>}
      {children}
    </div>
  );
}

export function SectionHeader({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="border-b border-slate-100 px-6 py-4">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900">{icon} {title}</h3>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

export function RenameInput({
  initial, onCommit, onCancel, className = '',
}: {
  initial: string; onCommit: (v: string) => void; onCancel: () => void; className?: string;
}) {
  return (
    <input
      autoFocus
      defaultValue={initial}
      onBlur={(e) => { onCommit(e.target.value); onCancel(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onCancel();
      }}
      className={`rounded-md border border-cyan-300 px-2 text-sm outline-none ring-2 ring-cyan-100 ${className}`}
    />
  );
}


export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xóa',
  cancelLabel = 'Hủy',
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Đóng hộp thoại xác nhận"
        className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]"
        onClick={() => { if (!submitting) onClose(); }}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <Icon name="ri-error-warning-line" className="text-xl" />
        </div>

        <h3 id="confirm-dialog-title" className="mt-4 text-base font-semibold text-slate-900">
          {title}
        </h3>
        <div id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-slate-500">
          {description}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="min-w-24 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {submitting ? 'Đang xóa…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
