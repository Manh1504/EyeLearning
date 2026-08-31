'use client';

// components/teacher/workspace/workspace-ui.tsx — UI primitives dùng chung
// cho workspace (shell + 3 tab): Card, IconBtn, PrimaryBtn, EmptyState, ...

import { type ReactNode, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

export const CARD = 'rounded-xl border border-border bg-card';
export const INPUT_CLS = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25';

export const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-400/90 text-emerald-950',
  draft: 'bg-amber-300/90 text-amber-950',
  archived: 'bg-muted text-muted-foreground',
};

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`${CARD} ${className}`}>{children}</section>;
}

export function IconBtn({
  title, onClick, tone = 'slate', className = '', children,
}: {
  title: string; onClick?: () => void; tone?: 'slate' | 'rose'; className?: string; children: ReactNode;
}) {
  const hover = tone === 'rose' ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-muted-foreground';
  return (
    <button onClick={onClick} title={title} className={`shrink-0 rounded p-1 text-muted-foreground transition ${hover} ${className}`}>
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
      className={`rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground ${className}`}
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
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">{icon}</div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {desc && <p className={`mt-1 text-xs text-muted-foreground ${descClass}`}>{desc}</p>}
      {children}
    </div>
  );
}

export function SectionHeader({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="border-b border-border px-6 py-4">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">{icon} {title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
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
      className={`rounded-md border border-ring px-2 text-sm text-foreground outline-none ring-3 ring-ring/25 ${className}`}
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
        className="absolute inset-0 cursor-default bg-brand-dark/40"
        onClick={() => { if (!submitting) onClose(); }}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Icon name="ri-error-warning-line" className="text-xl" />
        </div>

        <h3 id="confirm-dialog-title" className="mt-4 text-base font-semibold text-foreground">
          {title}
        </h3>
        <div id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="min-w-24 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:bg-destructive/50"
          >
            {submitting ? 'Đang xóa…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}