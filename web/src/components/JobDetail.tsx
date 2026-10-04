import { useCallback, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { getJob, isFinished, type JobDetail as JobDetailData, type JobStatus } from '../api';
import { useInterval } from '../hooks';
import { formatDateTime } from './JobList';
import { StatusBadge } from './StatusBadge';

const POLL_INTERVAL_MS = 2000;

const PROGRESS_MESSAGE: Partial<Record<JobStatus, string>> = {
  pending: '実行を待っています...',
  extracting: '要点を抽出しています...',
  summarizing: '要約を作成しています...',
};

interface Props {
  jobId: string;
  /** 状態が変わったことを一覧側に伝える */
  onStatusChange: () => void;
}

export function JobDetail({ jobId, onStatusChange }: Props) {
  const [detail, setDetail] = useState<JobDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getJob(jobId);
      setDetail((current) => {
        if (current && current.job.status !== next.job.status) {
          onStatusChange();
        }
        return next;
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [jobId, onStatusChange]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    void load();
  }, [load]);

  const loaded = detail?.job.id === jobId ? detail : null;
  useInterval(load, POLL_INTERVAL_MS, loaded !== null && !isFinished(loaded.job.status));

  if (error && !loaded) {
    return (
      <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }
  if (!loaded) {
    return <p className="text-sm text-slate-500">読み込み中...</p>;
  }

  const { job, extraction, summary } = loaded;
  const progress = PROGRESS_MESSAGE[job.status];

  return (
    <article className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold break-all text-slate-900">{job.title}</h2>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{formatDateTime(job.createdAt)} 作成</p>
      </header>

      {progress && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          {progress}
        </p>
      )}

      {job.status === 'failed' && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          処理に失敗しました: {job.errorMessage}
        </p>
      )}

      {summary && (
        <section>
          <h3 className="text-sm font-semibold text-slate-500">要約</h3>
          <div className="markdown mt-2 text-sm text-slate-800">
            <Markdown>{summary.text}</Markdown>
          </div>
        </section>
      )}

      {extraction && (
        <section>
          <h3 className="text-sm font-semibold text-slate-500">
            抽出した要点（{extraction.keyPoints.length} 件）
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            {extraction.keyPoints.map((keyPoint, index) => (
              <li key={index}>{keyPoint}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
