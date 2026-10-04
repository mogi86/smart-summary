import type { JobDispatcher } from '../../application/ports/jobDispatcher';
import type { RunSummaryJob } from '../../application/runSummaryJob';

/** 同一プロセス内でジョブを実行し、完了まで待つ（local 用） */
export class InProcessJobDispatcher implements JobDispatcher {
  constructor(private readonly runSummaryJob: RunSummaryJob) {}

  async dispatch(jobId: string): Promise<void> {
    await this.runSummaryJob.execute(jobId);
  }
}
