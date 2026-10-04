import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { SummaryJobDetail } from '../../application/querySummaryJobs';
import { composeLocal } from '../localComposition';

const USAGE = `使い方:
  npm run cli -- summarize <file> [--title <title>]   ファイルを要約する
  npm run cli -- jobs                                 ジョブ一覧を表示する
  npm run cli -- show <jobId>                         抽出した要点と要約を表示する`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { title: { type: 'string' } },
  });
  const [command, target] = positionals;

  const { getSummaryJob, listSummaryJobs, createSubmitSummaryJob } = composeLocal('wait');

  switch (command) {
    case 'summarize': {
      if (!target) break;
      // npm 経由で実行すると cwd が app/ になるため、呼び出し元のディレクトリを基準にする
      const filePath = resolve(process.env.INIT_CWD ?? process.cwd(), target);
      const text = await readFile(filePath, 'utf8');

      const submitSummaryJob = createSubmitSummaryJob();

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
      const jobs = await listSummaryJobs.execute();
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
  { job, extraction, summary }: SummaryJobDetail,
  withExtraction: boolean,
): void {
  console.log(`ジョブID : ${job.id}`);
  console.log(`タイトル : ${job.title}`);
  console.log(`状態     : ${job.status}`);
  if (job.errorMessage) {
    console.log(`エラー   : ${job.errorMessage}`);
  }

  if (withExtraction && extraction) {
    console.log('\n--- 抽出した要点 ---');
    for (const keyPoint of extraction.keyPoints) {
      console.log(`- ${keyPoint}`);
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
  if (error instanceof Error && error.name === 'ResourceNotFoundException') {
    console.error('DynamoDB のテーブルが見つかりません。npm run db:init を実行してください');
  }
  process.exitCode = 1;
}
