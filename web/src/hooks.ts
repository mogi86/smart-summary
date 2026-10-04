import { useEffect, useState } from 'react';

/** `#/jobs/<id>` で選択中のジョブを表す。ハッシュが無ければ新規作成画面 */
export function useSelectedJobId(): [string | null, (jobId: string | null) => void] {
  const [jobId, setJobId] = useState(readJobId);

  useEffect(() => {
    const onHashChange = () => setJobId(readJobId());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const select = (next: string | null) => {
    window.location.hash = next ? `#/jobs/${next}` : '#/';
  };
  return [jobId, select];
}

function readJobId(): string | null {
  const match = /^#\/jobs\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/** active の間、一定間隔で callback を呼ぶ */
export function useInterval(callback: () => void, intervalMs: number, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(callback, intervalMs);
    return () => clearInterval(timer);
  }, [callback, intervalMs, active]);
}
