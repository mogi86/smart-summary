import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors';
import { SummaryJob } from '../src/domain/summaryJob';

const now = new Date('2026-10-04T00:00:00.000Z');

function newJob(): SummaryJob {
  return SummaryJob.create({ id: 'job-1', title: 't', createdBy: 'cli', now });
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
});
