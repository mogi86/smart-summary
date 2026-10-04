import { describe, expect, it } from 'vitest';
import type { JobDispatcher } from '../src/application/ports/jobDispatcher';
import { GetSummaryJob, ListSummaryJobs } from '../src/application/querySummaryJobs';
import { SubmitSummaryJob } from '../src/application/submitSummaryJob';
import { createApp } from '../src/presentation/http/app';
import { InMemorySummaryJobRepository } from './inMemorySummaryJobRepository';

interface JobJson {
  id: string;
  createdAt: string;
}
interface DetailJson {
  job: JobJson;
  extraction: { keyPoints: string[] } | null;
  summary: unknown;
}

const noopDispatcher: JobDispatcher = { dispatch: async () => {} };

function newApp() {
  const repository = new InMemorySummaryJobRepository();
  const app = createApp({
    submitSummaryJob: new SubmitSummaryJob(repository, noopDispatcher),
    getSummaryJob: new GetSummaryJob(repository),
    listSummaryJobs: new ListSummaryJobs(repository),
  });
  const post = (body: unknown) =>
    app.request('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { app, repository, post };
}

describe('HTTP API', () => {
  it('ジョブを登録し、一覧と詳細で取得できる', async () => {
    const { app, repository, post } = newApp();

    const created = await post({ title: 'タイトル', text: '本文' });
    expect(created.status).toBe(201);
    const job = (await created.json()) as JobJson;
    expect(job).toMatchObject({ title: 'タイトル', status: 'pending', createdBy: 'local' });

    await repository.saveExtraction(job.id, { keyPoints: ['要点'], createdAt: job.createdAt });

    const list = (await (await app.request('/api/jobs')).json()) as { jobs: JobJson[] };
    expect(list.jobs.map((listed) => listed.id)).toEqual([job.id]);

    const detail = (await (await app.request(`/api/jobs/${job.id}`)).json()) as DetailJson;
    expect(detail.job.id).toBe(job.id);
    expect(detail.extraction?.keyPoints).toEqual(['要点']);
    expect(detail.summary).toBeNull();
  });

  it('不正な入力は 400 を返す', async () => {
    const { post } = newApp();
    expect((await post({ title: 'text なし' })).status).toBe(400);
    expect((await post({ text: '   ' })).status).toBe(400);
  });

  it('存在しないジョブは 404 を返す', async () => {
    const { app } = newApp();
    expect((await app.request('/api/jobs/missing')).status).toBe(404);
  });
});
