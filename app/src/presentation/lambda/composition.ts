import { AuthenticateUser } from '../../application/authenticateUser';
import { GetSummaryJob, ListSummaryJobs } from '../../application/querySummaryJobs';
import { RunSummaryJob } from '../../application/runSummaryJob';
import { SubmitSummaryJob } from '../../application/submitSummaryJob';
import { loadConfig } from '../../infrastructure/config';
import { LambdaJobDispatcher } from '../../infrastructure/dispatcher/lambdaJobDispatcher';
import { createDocumentClient } from '../../infrastructure/dynamodb/client';
import { DynamoSummaryJobRepository } from '../../infrastructure/dynamodb/dynamoSummaryJobRepository';
import { GeminiLlm } from '../../infrastructure/gemini/geminiLlm';
import {
  LangfuseJobTracer,
  startLangfuseTracing,
  type LangfuseTracing,
} from '../../infrastructure/langfuse/langfuseTracing';
import { SlackIdentityProvider } from '../../infrastructure/slack/slackIdentityProvider';
import { loadParameters } from '../../infrastructure/ssm/parameterStore';
import type { AppDependencies } from '../http/app';
import { SessionTokens } from '../http/session';

/** シークレットを置く SSM パラメータ名。値は README の手順で登録する */
const PARAMETERS = {
  geminiApiKey: '/smart-summary/gemini-api-key',
  langfusePublicKey: '/smart-summary/langfuse/public-key',
  langfuseSecretKey: '/smart-summary/langfuse/secret-key',
  slackClientId: '/smart-summary/slack/client-id',
  slackClientSecret: '/smart-summary/slack/client-secret',
  slackAllowedTeamId: '/smart-summary/slack/allowed-team-id',
  sessionSecret: '/smart-summary/session-secret',
} as const;

function createRepository(): DynamoSummaryJobRepository {
  return new DynamoSummaryJobRepository(createDocumentClient());
}

/** Web Lambda 用の依存の組み立て。認証は常に有効 */
export async function composeWeb(staticRoot: string): Promise<AppDependencies> {
  const workerFunctionName = process.env.WORKER_FUNCTION_NAME;
  if (!workerFunctionName) {
    throw new Error('環境変数 WORKER_FUNCTION_NAME が設定されていません');
  }
  const secrets = await loadParameters([
    PARAMETERS.slackClientId,
    PARAMETERS.slackClientSecret,
    PARAMETERS.slackAllowedTeamId,
    PARAMETERS.sessionSecret,
  ]);
  const allowedTeamId = secrets[PARAMETERS.slackAllowedTeamId];

  const repository = createRepository();
  const identityProvider = new SlackIdentityProvider({
    clientId: secrets[PARAMETERS.slackClientId],
    clientSecret: secrets[PARAMETERS.slackClientSecret],
    teamId: allowedTeamId,
  });

  return {
    submitSummaryJob: new SubmitSummaryJob(repository, new LambdaJobDispatcher(workerFunctionName)),
    getSummaryJob: new GetSummaryJob(repository),
    listSummaryJobs: new ListSummaryJobs(repository),
    auth: {
      mode: 'slack',
      identityProvider,
      authenticateUser: new AuthenticateUser(identityProvider, allowedTeamId),
      sessionTokens: new SessionTokens(secrets[PARAMETERS.sessionSecret]),
    },
    staticRoot,
  };
}

/** Worker Lambda 用の依存の組み立て */
export async function composeWorker(): Promise<{
  runSummaryJob: RunSummaryJob;
  tracing: LangfuseTracing;
}> {
  const secrets = await loadParameters([
    PARAMETERS.geminiApiKey,
    PARAMETERS.langfusePublicKey,
    PARAMETERS.langfuseSecretKey,
  ]);
  const tracing = startLangfuseTracing({
    publicKey: secrets[PARAMETERS.langfusePublicKey],
    secretKey: secrets[PARAMETERS.langfuseSecretKey],
  });
  const llm = new GeminiLlm(secrets[PARAMETERS.geminiApiKey], loadConfig().geminiModel);
  return {
    runSummaryJob: new RunSummaryJob(createRepository(), llm, llm, new LangfuseJobTracer()),
    tracing,
  };
}
