import { Hono } from 'hono';
import { InvalidInputError, JobNotFoundError } from '../../application/errors';
import type { GetSummaryJob, ListSummaryJobs } from '../../application/querySummaryJobs';
import type { SubmitSummaryJob } from '../../application/submitSummaryJob';

export interface AppDependencies {
  submitSummaryJob: SubmitSummaryJob;
  getSummaryJob: GetSummaryJob;
  listSummaryJobs: ListSummaryJobs;
}

// 認証を実装するまでの仮の利用者名
const LOCAL_USER = 'local';

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  app.post('/api/jobs', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isSubmitBody(body)) {
      return c.json({ message: 'text は必須です' }, 400);
    }
    const job = await deps.submitSummaryJob.execute({
      title: body.title,
      text: body.text,
      createdBy: LOCAL_USER,
    });
    return c.json(job.toProps(), 201);
  });

  app.get('/api/jobs', async (c) => {
    const jobs = await deps.listSummaryJobs.execute();
    return c.json({ jobs: jobs.map((job) => job.toProps()) });
  });

  app.get('/api/jobs/:id', async (c) => {
    const { job, extraction, summary } = await deps.getSummaryJob.execute(c.req.param('id'));
    return c.json({ job: job.toProps(), extraction, summary });
  });

  app.onError((error, c) => {
    if (error instanceof InvalidInputError) {
      return c.json({ message: error.message }, 400);
    }
    if (error instanceof JobNotFoundError) {
      return c.json({ message: error.message }, 404);
    }
    console.error(error);
    return c.json({ message: 'サーバーエラーが発生しました' }, 500);
  });

  return app;
}

function isSubmitBody(body: unknown): body is { title?: string; text: string } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const { title, text } = body as Record<string, unknown>;
  return typeof text === 'string' && (title === undefined || typeof title === 'string');
}
