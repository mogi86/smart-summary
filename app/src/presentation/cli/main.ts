import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  GetSummaryJob,
  ListSummaryJobs,
  type SummaryJobDetail,
} from '../../application/querySummaryJobs';
import { RunSummaryJob } from '../../application/runSummaryJob';
import { SubmitSummaryJob } from '../../application/submitSummaryJob';
import { loadConfig, loadGeminiApiKey } from '../../infrastructure/config';
import { InProcessJobDispatcher } from '../../infrastructure/dispatcher/inProcessJobDispatcher';
import { createDocumentClient } from '../../infrastructure/dynamodb/client';
import { DynamoSummaryJobRepository } from '../../infrastructure/dynamodb/dynamoSummaryJobRepository';
import { GeminiLlm } from '../../infrastructure/gemini/geminiLlm';

const USAGE = `使い方:
  npm run cli -- summarize <file> [--title <title>]   ファイルを要約する
  npm run cli -- jobs                                 ジョブ一覧を表示する
  npm run cli -- show <jobId>                         抽出結果と要約を表示する`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { title: { type: 'string' } },
  });
  const [command, target] = positionals;

  const config = loadConfig();
  const repository = new DynamoSummaryJobRepository(createDocumentClient(config.dynamoEndpoint));
  const getSummaryJob = new GetSummaryJob(repository);

  switch (command) {
    case 'summarize': {
      if (!target) break;
      // npm 経由で実行すると cwd が app/ になるため、呼び出し元のディレクトリを基準にする
      const filePath = resolve(process.env.INIT_CWD ?? process.cwd(), target);
      const text = await readFile(filePath, 'utf8');

      const llm = new GeminiLlm(loadGeminiApiKey(), config.geminiModel);
      const runSummaryJob = new RunSummaryJob(repository, llm, llm);
      const submitSummaryJob = new SubmitSummaryJob(
        repository,
        new InProcessJobDispatcher(runSummaryJob),
      );

      console.log('抽出→要約を実行しています...');
      const submitted = await submitSummaryJob.execute({
        title: values.title ?? basename(filePath),
        text,
        createdBy: 'cli',
      });
      const detail = await getSummaryJob.execute(submitted.id);
      printDetail(detail, false);
      if (detail.job.status !== 'completed') {
        process.exitCode = 1;
      }
      return;
    }
    case 'jobs': {
      const jobs = await new ListSummaryJobs(repository).execute();
      for (const job of jobs) {
        console.log(`${job.id}  ${job.status.padEnd(11)}  ${job.createdAt}  ${job.title}`);
      }
      return;
    }
    case 'show': {
      if (!target) break;
      printDetail(await getSummaryJob.execute(target), true);
      return;
    }
  }

  console.error(USAGE);
  process.exitCode = 1;
}

function printDetail(
  { job, extractions, summary }: SummaryJobDetail,
  withExtractions: boolean,
): void {
  console.log(`ジョブID : ${job.id}`);
  console.log(`タイトル : ${job.title}`);
  console.log(`状態     : ${job.status}`);
  console.log(`チャンク : ${extractions.length} / ${job.chunkCount} 抽出済み`);
  if (job.errorMessage) {
    console.log(`エラー   : ${job.errorMessage}`);
  }

  if (withExtractions) {
    for (const extraction of extractions) {
      console.log(`\n--- 抽出結果 (チャンク ${extraction.chunkIndex + 1}) ---`);
      for (const keyPoint of extraction.keyPoints) {
        console.log(`- ${keyPoint}`);
      }
    }
  }

  if (summary) {
    console.log('\n--- 要約 ---');
    console.log(summary.text);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
