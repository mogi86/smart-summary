import type { JobDispatcher } from '../../application/ports/jobDispatcher';
import type { RunSummaryJob } from '../../application/runSummaryJob';

/** 同一プロセス内でジョブを実行し、完了まで待つ（CLI 用） */
export class InProcessJobDispatcher implements JobDispatcher {
  constructor(private readonly runSummaryJob: RunSummaryJob) {}

  async dispatch(jobId: string): Promise<void> {
    await this.runSummaryJob.execute(jobId);
  }
}

/** 同一プロセス内でジョブを開始し、完了を待たずに返す（local の API サーバ用） */
export class BackgroundJobDispatcher implements JobDispatcher {
  constructor(private readonly runSummaryJob: RunSummaryJob) {}

  async dispatch(jobId: string): Promise<void> {
    void this.runSummaryJob.execute(jobId).catch((error: unknown) => {
      console.error(`ジョブの実行に失敗しました: ${jobId}`, error);
    });
  }
}
