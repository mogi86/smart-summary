import { Hono } from 'hono';
import { InvalidInputError, JobNotFoundError } from '../../application/errors';
import type { GetSummaryJob, ListSummaryJobs } from '../../application/querySummaryJobs';
import type { SubmitSummaryJob } from '../../application/submitSummaryJob';
import { type AuthConfig, type AuthEnv, createAuthRoutes, requireUser } from './auth';
import { serveStaticFiles } from './staticFiles';

export interface AppDependencies {
  submitSummaryJob: SubmitSummaryJob;
  getSummaryJob: GetSummaryJob;
  listSummaryJobs: ListSummaryJobs;
  auth: AuthConfig;
  /** 画面のビルド成果物を置いたディレクトリ。指定した場合は API 以外のパスで画面を返す */
  staticRoot?: string;
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  app.route('/auth', createAuthRoutes(deps.auth));
  app.route('/api', createApiRoutes(deps));
  if (deps.staticRoot) {
    app.get('*', serveStaticFiles(deps.staticRoot));
  }

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

/** /api 配下のルート。すべてログインが必要 */
function createApiRoutes(deps: AppDependencies): Hono<AuthEnv> {
  const api = new Hono<AuthEnv>();
  api.use(requireUser(deps.auth));

  api.get('/me', (c) => {
    return c.json({ user: c.get('user'), authEnabled: deps.auth.mode !== 'disabled' });
  });

  api.post('/jobs', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isSubmitBody(body)) {
      return c.json({ message: 'text は必須です' }, 400);
    }
    const job = await deps.submitSummaryJob.execute({
      title: body.title,
      text: body.text,
      createdBy: c.get('user').id,
    });
    return c.json(job.toProps(), 201);
  });

  api.get('/jobs', async (c) => {
    const jobs = await deps.listSummaryJobs.execute();
    return c.json({ jobs: jobs.map((job) => job.toProps()) });
  });

  api.get('/jobs/:id', async (c) => {
    const { job, extraction, summary } = await deps.getSummaryJob.execute(c.req.param('id'));
    return c.json({ job: job.toProps(), extraction, summary });
  });

  return api;
}

function isSubmitBody(body: unknown): body is { title?: string; text: string } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const { title, text } = body as Record<string, unknown>;
  return typeof text === 'string' && (title === undefined || typeof title === 'string');
}
