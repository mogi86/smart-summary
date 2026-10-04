import { useCallback, useEffect, useState } from 'react';
import { isFinished, type Job, listJobs } from './api';
import { JobDetail } from './components/JobDetail';
import { JobList } from './components/JobList';
import { NewJobForm } from './components/NewJobForm';
import { useInterval, useSelectedJobId } from './hooks';

const LIST_POLL_INTERVAL_MS = 3000;

export function App() {
  const [selectedJobId, selectJob] = useSelectedJobId();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const reloadJobs = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setListError(null);
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void reloadJobs();
  }, [reloadJobs]);

  // 実行中のジョブがある間だけ一覧を更新する
  const hasRunningJob = jobs?.some((job) => !isFinished(job.status)) ?? false;
  useInterval(reloadJobs, LIST_POLL_INTERVAL_MS, hasRunningJob);

  const handleSubmitted = (job: Job) => {
    void reloadJobs();
    selectJob(job.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">smart-summary</h1>
          <span className="text-xs text-slate-500">長文を抽出 → 要約の 2 段階で要約</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-72 md:shrink-0">
          <button
            type="button"
            onClick={() => selectJob(null)}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            新しい要約
          </button>
          <h2 className="mt-6 mb-2 px-1 text-xs font-semibold text-slate-500">履歴</h2>
          {listError ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {listError}
            </p>
          ) : (
            <JobList jobs={jobs} selectedJobId={selectedJobId} onSelect={selectJob} />
          )}
        </aside>

        <main className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {selectedJobId ? (
            <JobDetail key={selectedJobId} jobId={selectedJobId} onStatusChange={reloadJobs} />
          ) : (
            <NewJobForm onSubmitted={handleSubmitted} />
          )}
        </main>
      </div>
    </div>
  );
}
