import { GetSummaryJob, ListSummaryJobs } from '../application/querySummaryJobs';
import { RunSummaryJob } from '../application/runSummaryJob';
import { SubmitSummaryJob } from '../application/submitSummaryJob';
import { loadConfig, loadGeminiApiKey } from '../infrastructure/config';
import {
  BackgroundJobDispatcher,
  InProcessJobDispatcher,
} from '../infrastructure/dispatcher/inProcessJobDispatcher';
import { createDocumentClient, LOCAL_DYNAMODB_ENDPOINT } from '../infrastructure/dynamodb/client';
import { DynamoSummaryJobRepository } from '../infrastructure/dynamodb/dynamoSummaryJobRepository';
import { GeminiLlm } from '../infrastructure/gemini/geminiLlm';

/**
 * local 実行（CLI・API サーバ）用の依存の組み立て。
 * dispatch: 'wait' はジョブの完了まで待ち、'background' は登録後すぐに返す。
 */
export function composeLocal(dispatch: 'wait' | 'background') {
  const config = loadConfig();
  // local 専用のため、接続先が未設定でも実 AWS には接続しない
  const repository = new DynamoSummaryJobRepository(
    createDocumentClient(config.dynamoEndpoint ?? LOCAL_DYNAMODB_ENDPOINT),
  );

  return {
    getSummaryJob: new GetSummaryJob(repository),
    listSummaryJobs: new ListSummaryJobs(repository),
    /** Gemini API キーが必要になるため、使うときに組み立てる */
    createSubmitSummaryJob(): SubmitSummaryJob {
      const llm = new GeminiLlm(loadGeminiApiKey(), config.geminiModel);
      const runSummaryJob = new RunSummaryJob(repository, llm, llm);
      const dispatcher =
        dispatch === 'wait'
          ? new InProcessJobDispatcher(runSummaryJob)
          : new BackgroundJobDispatcher(runSummaryJob);
      return new SubmitSummaryJob(repository, dispatcher);
    },
  };
}
