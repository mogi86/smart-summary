import { composeWorker } from './composition';

let initialized: ReturnType<typeof composeWorker> | undefined;

/** Web Lambda から非同期で呼び出され、ジョブ（抽出 → 要約）を実行する */
export const handler = async (event: { jobId?: unknown }): Promise<void> => {
  if (typeof event.jobId !== 'string') {
    throw new Error('jobId が指定されていません');
  }
  initialized ??= composeWorker();
  const { runSummaryJob, tracing } = await initialized;
  try {
    const job = await runSummaryJob.execute(event.jobId);
    console.log(`ジョブ ${job.id} は ${job.status} で終了しました`);
  } finally {
    // ハンドラが返ると実行環境が凍結されるため、その前にトレースを送り切る
    await tracing.flush();
  }
};
