import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { JobDispatcher } from '../../application/ports/jobDispatcher';

/** Worker Lambda を非同期で呼び出してジョブを実行する（AWS 用） */
export class LambdaJobDispatcher implements JobDispatcher {
  private readonly client = new LambdaClient({});

  constructor(private readonly functionName: string) {}

  async dispatch(jobId: string): Promise<void> {
    await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'Event',
        Payload: JSON.stringify({ jobId }),
      }),
    );
  }
}
