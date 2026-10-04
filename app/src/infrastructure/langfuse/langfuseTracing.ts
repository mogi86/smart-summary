import { LangfuseSpanProcessor } from '@langfuse/otel';
import { startActiveObservation } from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { JobTracer } from '../../application/ports/jobTracer';

export interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
}

export interface LangfuseTracing {
  /** 未送信のトレースを送る。Lambda のようにプロセスが凍結される環境では、処理の最後に呼ぶ */
  flush(): Promise<void>;
  /** 未送信のトレースを送って終了する。CLI のようにすぐ終了するプロセスでは、終了前に呼ぶ */
  shutdown(): Promise<void>;
}

/**
 * Langfuse へのトレース送信を開始する。
 * credentials を省略した場合、キーは環境変数（LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY）から読まれる。
 * 接続先（LANGFUSE_BASE_URL）と環境名（LANGFUSE_TRACING_ENVIRONMENT）は常に環境変数から読まれる。
 */
export function startLangfuseTracing(credentials?: LangfuseCredentials): LangfuseTracing {
  const processor = new LangfuseSpanProcessor(credentials);
  const sdk = new NodeSDK({
    serviceName: 'smart-summary',
    // 既定ではホスト名・OS ユーザー名・コマンドライン引数などが検出されてトレースに付くため、送らない
    autoDetectResources: false,
    spanProcessors: [processor],
  });
  sdk.start();
  return {
    flush: () => processor.forceFlush(),
    shutdown: () => sdk.shutdown(),
  };
}

/** ジョブを Langfuse のトレースとして記録する。LLM の呼び出しはこのトレースの配下に入る */
export class LangfuseJobTracer implements JobTracer {
  trace: JobTracer['trace'] = (job, run) =>
    startActiveObservation('summary-job', async (span) => {
      span.update({ input: { title: job.title }, metadata: { jobId: job.id } });
      const result = await run();
      span.update({
        output: { status: result.status },
        ...(result.status === 'failed' && {
          level: 'ERROR' as const,
          statusMessage: result.errorMessage,
        }),
      });
      return result;
    });
}
