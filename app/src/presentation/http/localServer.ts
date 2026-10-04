import { serve } from '@hono/node-server';
import { composeLocal } from '../localComposition';
import { createApp } from './app';

/** local 用の API サーバ。画面は Vite の開発サーバから /api をプロキシして使う */
const { getSummaryJob, listSummaryJobs, createSubmitSummaryJob } = composeLocal('background');
const app = createApp({
  submitSummaryJob: createSubmitSummaryJob(),
  getSummaryJob,
  listSummaryJobs,
});

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`API サーバを起動しました: http://localhost:${port}`);
});
