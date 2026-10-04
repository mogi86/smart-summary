export type JobStatus = 'pending' | 'extracting' | 'summarizing' | 'completed' | 'failed';

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface JobDetail {
  job: Job;
  extraction: { keyPoints: string[]; createdAt: string } | null;
  summary: { text: string; createdAt: string } | null;
}

export interface Me {
  user: { id: string; name: string };
  /** false の場合は認証なしで動いている（local） */
  authEnabled: boolean;
}

/** セッションが無効になったときに発火するイベント名 */
export const UNAUTHORIZED_EVENT = 'smart-summary:unauthorized';

/** ログイン中の利用者を返す。未ログインの場合は null */
export async function getMe(): Promise<Me | null> {
  const response = await fetch('/api/me');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`利用者情報の取得に失敗しました (${response.status})`);
  }
  return (await response.json()) as Me;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' });
}

export function isFinished(status: JobStatus): boolean {
  return status === 'completed' || status === 'failed';
}

export async function listJobs(): Promise<Job[]> {
  const body = await request<{ jobs: Job[] }>('/api/jobs');
  return body.jobs;
}

export function getJob(jobId: string): Promise<JobDetail> {
  return request<JobDetail>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function submitJob(input: { title?: string; text: string }): Promise<Job> {
  return request<Job>('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `リクエストに失敗しました (${response.status})`);
  }
  return (await response.json()) as T;
}
