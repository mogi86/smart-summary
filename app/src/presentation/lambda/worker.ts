import type { RunSummaryJob } from '../../application/runSummaryJob';
import { composeWorker } from './composition';

let initialized: Promise<RunSummaryJob> | undefined;

/** Web Lambda から非同期で呼び出され、ジョブ（抽出 → 要約）を実行する */
export const handler = async (event: { jobId?: unknown }): Promise<void> => {
  if (typeof event.jobId !== 'string') {
    throw new Error('jobId が指定されていません');
  }
  initialized ??= composeWorker();
  const job = await (await initialized).execute(event.jobId);
  console.log(`ジョブ ${job.id} は ${job.status} で終了しました`);
};
