import type { Job } from '../api';
import { StatusBadge } from './StatusBadge';

interface Props {
  jobs: Job[] | null;
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}

export function JobList({ jobs, selectedJobId, onSelect }: Props) {
  if (jobs === null) {
    return <p className="px-1 text-sm text-slate-500">読み込み中...</p>;
  }
  if (jobs.length === 0) {
    return <p className="px-1 text-sm text-slate-500">まだ要約はありません。</p>;
  }
  return (
    <ul className="space-y-1">
      {jobs.map((job) => (
        <li key={job.id}>
          <button
            type="button"
            onClick={() => onSelect(job.id)}
            aria-current={job.id === selectedJobId}
            className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
              job.id === selectedJobId
                ? 'bg-indigo-50 ring-1 ring-indigo-200'
                : 'hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-800">{job.title}</span>
              <StatusBadge status={job.status} />
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{formatDateTime(job.createdAt)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
