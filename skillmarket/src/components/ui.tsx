import { Loader2, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { STATUS_LABELS } from '../lib/constants';
import { initials } from '../lib/format';
import type { RequestStatus } from '../lib/types';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-2 text-slate-600">{children}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' }[size];
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 ${dims}`}>
      {initials(name)}
    </span>
  );
}

const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: 'bg-spark-100 text-spark-800',
  accepted: 'bg-brand-100 text-brand-800',
  declined: 'bg-slate-200 text-slate-700',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function StarRating({ value, count }: { value: number | null; count?: number }) {
  if (value === null) return <span className="text-sm text-slate-500">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700" aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}>
      <Star className="h-4 w-4 fill-spark-400 text-spark-400" aria-hidden="true" />
      <span className="font-semibold">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-slate-500">({count})</span>}
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-sm text-red-700">{message}</p> : null;
}
