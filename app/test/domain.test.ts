import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors';
import { SummaryJob } from '../src/domain/summaryJob';
import { splitIntoChunks } from '../src/domain/textChunker';

const now = new Date('2026-10-04T00:00:00.000Z');

function newJob(): SummaryJob {
  return SummaryJob.create({ id: 'job-1', title: 't', chunkCount: 2, createdBy: 'cli', now });
}

describe('SummaryJob', () => {
  it('pending → extracting → summarizing → completed と遷移できる', () => {
    const job = newJob().startExtracting(now).startSummarizing(now).complete(now);
    expect(job.status).toBe('completed');
  });

  it('許可されていない遷移は拒否する', () => {
    expect(() => newJob().complete(now)).toThrow(DomainError);
    expect(() => newJob().startSummarizing(now)).toThrow(DomainError);
  });

  it('失敗したジョブは再実行でき、エラーメッセージが消える', () => {
    const failed = newJob().startExtracting(now).fail('boom', now);
    expect(failed.errorMessage).toBe('boom');

    const retried = failed.startExtracting(now);
    expect(retried.status).toBe('extracting');
    expect(retried.errorMessage).toBeUndefined();
  });

  it('チャンク数 0 では作成できない', () => {
    expect(() =>
      SummaryJob.create({ id: 'x', title: 't', chunkCount: 0, createdBy: 'cli', now }),
    ).toThrow(DomainError);
  });
});

describe('splitIntoChunks', () => {
  it('空白のみのテキストはチャンクなしになる', () => {
    expect(splitIntoChunks(' \n\n \n')).toEqual([]);
  });

  it('最大長に収まる段落は 1 チャンクにまとめる', () => {
    expect(splitIntoChunks('aaa\n\nbbb', 10)).toEqual([{ index: 0, text: 'aaa\n\nbbb' }]);
  });

  it('最大長を超える場合は段落の境界で分割する', () => {
    const chunks = splitIntoChunks('aaaa\n\nbbbb\n\ncccc', 10);
    expect(chunks.map((chunk) => chunk.text)).toEqual(['aaaa\n\nbbbb', 'cccc']);
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
  });

  it('最大長を超える段落は途中で分割する', () => {
    const chunks = splitIntoChunks('a'.repeat(25), 10);
    expect(chunks.map((chunk) => chunk.text.length)).toEqual([10, 10, 5]);
  });
});
