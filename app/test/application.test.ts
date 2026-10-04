import { describe, expect, it } from 'vitest';
import { InvalidInputError, JobNotFoundError } from '../src/application/errors';
import type { JobDispatcher } from '../src/application/ports/jobDispatcher';
import type { Extractor, Summarizer } from '../src/application/ports/llm';
import { GetSummaryJob } from '../src/application/querySummaryJobs';
import { RunSummaryJob } from '../src/application/runSummaryJob';
import { SubmitSummaryJob } from '../src/application/submitSummaryJob';
import { InMemorySummaryJobRepository } from './inMemorySummaryJobRepository';

class RecordingDispatcher implements JobDispatcher {
  readonly dispatched: string[] = [];
  async dispatch(jobId: string): Promise<void> {
    this.dispatched.push(jobId);
  }
}

class FakeLlm implements Extractor, Summarizer {
  extractCount = 0;
  failOnSummarize = false;

  async extract(text: string): Promise<string[]> {
    this.extractCount += 1;
    return text.split('\n');
  }

  async summarize(title: string, keyPoints: string[]): Promise<string> {
    if (this.failOnSummarize) {
      throw new Error('LLM エラー');
    }
    return `${title}: ${keyPoints.join(',')}`;
  }
}

async function submit(repository: InMemorySummaryJobRepository, text: string) {
  const dispatcher = new RecordingDispatcher();
  const job = await new SubmitSummaryJob(repository, dispatcher, () => 'job-1').execute({
    text,
    createdBy: 'cli',
  });
  return { job, dispatcher };
}

describe('SubmitSummaryJob', () => {
  it('入力を保存し、ジョブを登録して実行を依頼する', async () => {
    const repository = new InMemorySummaryJobRepository();
    const { job, dispatcher } = await submit(repository, '見出し\n本文');

    expect(job.status).toBe('pending');
    expect(job.title).toBe('見出し');
    expect(await repository.findSourceText('job-1')).toBe('見出し\n本文');
    expect(dispatcher.dispatched).toEqual(['job-1']);
  });

  it('空の入力は拒否する', async () => {
    await expect(submit(new InMemorySummaryJobRepository(), '  \n ')).rejects.toThrow(
      InvalidInputError,
    );
  });
});

describe('RunSummaryJob', () => {
  it('入力全文から要点を抽出して要約し、中間生成物と最終生成物を保存する', async () => {
    const repository = new InMemorySummaryJobRepository();
    await submit(repository, '見出し\n本文');
    const llm = new FakeLlm();

    const job = await new RunSummaryJob(repository, llm, llm).execute('job-1');

    expect(job.status).toBe('completed');
    expect(repository.statusHistory).toEqual(['pending', 'extracting', 'summarizing', 'completed']);
    const detail = await new GetSummaryJob(repository).execute('job-1');
    expect(detail.extraction?.keyPoints).toEqual(['見出し', '本文']);
    expect(detail.summary?.text).toBe('見出し: 見出し,本文');
  });

  it('要約で失敗したらジョブを failed にし、再実行では抽出をやり直さない', async () => {
    const repository = new InMemorySummaryJobRepository();
    await submit(repository, '見出し\n本文');
    const llm = new FakeLlm();
    llm.failOnSummarize = true;
    const runSummaryJob = new RunSummaryJob(repository, llm, llm);

    const failed = await runSummaryJob.execute('job-1');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('LLM エラー');
    expect(await repository.findSummary('job-1')).toBeNull();

    llm.failOnSummarize = false;
    const retried = await runSummaryJob.execute('job-1');
    expect(retried.status).toBe('completed');
    expect(llm.extractCount).toBe(1);
  });

  it('存在しないジョブは JobNotFoundError になる', async () => {
    const llm = new FakeLlm();
    await expect(
      new RunSummaryJob(new InMemorySummaryJobRepository(), llm, llm).execute('missing'),
    ).rejects.toThrow(JobNotFoundError);
  });
});
