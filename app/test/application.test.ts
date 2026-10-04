import { describe, expect, it } from 'vitest';
import { InvalidInputError, JobNotFoundError } from '../src/application/errors';
import type { JobDispatcher } from '../src/application/ports/jobDispatcher';
import type { Extractor, Summarizer } from '../src/application/ports/llm';
import { GetSummaryJob } from '../src/application/querySummaryJobs';
import { RunSummaryJob } from '../src/application/runSummaryJob';
import { SubmitSummaryJob } from '../src/application/submitSummaryJob';
import type { Extraction, SourceChunk } from '../src/domain/documents';
import { InMemorySummaryJobRepository } from './inMemorySummaryJobRepository';

class RecordingDispatcher implements JobDispatcher {
  readonly dispatched: string[] = [];
  async dispatch(jobId: string): Promise<void> {
    this.dispatched.push(jobId);
  }
}

class FakeLlm implements Extractor, Summarizer {
  readonly extractedChunks: number[] = [];
  failOnChunk: number | null = null;

  async extract(chunk: SourceChunk): Promise<string[]> {
    if (chunk.index === this.failOnChunk) {
      throw new Error('LLM エラー');
    }
    this.extractedChunks.push(chunk.index);
    return [`point-${chunk.index}`];
  }

  async summarize(title: string, extractions: Extraction[]): Promise<string> {
    return `${title}: ${extractions.flatMap((extraction) => extraction.keyPoints).join(',')}`;
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

/** 既定の最大長を超える段落 3 つ（3 チャンクになる） */
const threeChunkText = ['a', 'b', 'c'].map((char) => char.repeat(5000)).join('\n\n');

describe('SubmitSummaryJob', () => {
  it('入力をチャンクとして保存し、ジョブを登録して実行を依頼する', async () => {
    const repository = new InMemorySummaryJobRepository();
    const { job, dispatcher } = await submit(repository, '見出し\n本文');

    expect(job.status).toBe('pending');
    expect(job.title).toBe('見出し');
    expect(await repository.findSourceChunks('job-1')).toHaveLength(1);
    expect(dispatcher.dispatched).toEqual(['job-1']);
  });

  it('空の入力は拒否する', async () => {
    await expect(submit(new InMemorySummaryJobRepository(), '  \n ')).rejects.toThrow(
      InvalidInputError,
    );
  });
});

describe('RunSummaryJob', () => {
  it('全チャンクを抽出して要約し、中間生成物と最終生成物を保存する', async () => {
    const repository = new InMemorySummaryJobRepository();
    await submit(repository, threeChunkText);
    const llm = new FakeLlm();

    const job = await new RunSummaryJob(repository, llm, llm).execute('job-1');

    expect(job.status).toBe('completed');
    expect(repository.statusHistory).toEqual(['pending', 'extracting', 'summarizing', 'completed']);
    const detail = await new GetSummaryJob(repository).execute('job-1');
    expect(detail.extractions.map((extraction) => extraction.keyPoints)).toEqual([
      ['point-0'],
      ['point-1'],
      ['point-2'],
    ]);
    expect(detail.summary?.text).toBe(`${job.title}: point-0,point-1,point-2`);
  });

  it('LLM が失敗したらジョブを failed にし、再実行では未抽出のチャンクだけ処理する', async () => {
    const repository = new InMemorySummaryJobRepository();
    await submit(repository, threeChunkText);
    const llm = new FakeLlm();
    llm.failOnChunk = 1;
    const runSummaryJob = new RunSummaryJob(repository, llm, llm);

    const failed = await runSummaryJob.execute('job-1');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('LLM エラー');
    expect(await repository.findSummary('job-1')).toBeNull();

    llm.failOnChunk = null;
    llm.extractedChunks.length = 0;
    const retried = await runSummaryJob.execute('job-1');
    expect(retried.status).toBe('completed');
    expect(llm.extractedChunks).toEqual([1]);
  });

  it('存在しないジョブは JobNotFoundError になる', async () => {
    const llm = new FakeLlm();
    await expect(
      new RunSummaryJob(new InMemorySummaryJobRepository(), llm, llm).execute('missing'),
    ).rejects.toThrow(JobNotFoundError);
  });
});
