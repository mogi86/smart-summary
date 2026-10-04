import type { SummaryJob } from '../../domain/summaryJob';

/** ジョブ 1 回の実行を 1 件のトレースとして記録する */
export interface JobTracer {
  trace(job: SummaryJob, run: () => Promise<SummaryJob>): Promise<SummaryJob>;
}

/** トレースを記録しない */
export const noopJobTracer: JobTracer = {
  trace: (_job, run) => run(),
};
