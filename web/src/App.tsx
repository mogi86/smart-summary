import { useCallback, useEffect, useState } from 'react';
import { getMe, isFinished, type Job, listJobs, logout, type Me, UNAUTHORIZED_EVENT } from './api';
import { JobDetail } from './components/JobDetail';
import { JobList } from './components/JobList';
import { Login } from './components/Login';
import { NewJobForm } from './components/NewJobForm';
import { useInterval, useSelectedJobId } from './hooks';

const LIST_POLL_INTERVAL_MS = 3000;

/** ログイン状態を確認し、ログイン済みの場合だけ本体の画面を表示する */
export function App() {
  // undefined: 確認中 / null: 未ログイン
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );

    const onUnauthorized = () => setMe(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (error) {
    return (
      <p role="alert" className="m-6 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }
  if (me === undefined) {
    return null;
  }
  if (me === null) {
    return <Login />;
  }
  return <Workspace me={me} onLogout={() => void logout().then(() => setMe(null))} />;
}

function Workspace({ me, onLogout }: { me: Me; onLogout: () => void }) {
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
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{me.user.name}</span>
            {me.authEnabled && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                ログアウト
              </button>
            )}
          </div>
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
