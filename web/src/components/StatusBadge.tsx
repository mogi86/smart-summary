import type { JobStatus } from '../api';

const STATUS: Record<JobStatus, { label: string; className: string }> = {
  pending: { label: '待機中', className: 'bg-slate-100 text-slate-600' },
  extracting: { label: '抽出中', className: 'bg-amber-50 text-amber-700' },
  summarizing: { label: '要約中', className: 'bg-amber-50 text-amber-700' },
  completed: { label: '完了', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失敗', className: 'bg-rose-50 text-rose-700' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
