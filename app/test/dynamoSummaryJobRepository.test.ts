import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SummaryJob } from '../src/domain/summaryJob';
import { createDocumentClient } from '../src/infrastructure/dynamodb/client';
import { DynamoSummaryJobRepository } from '../src/infrastructure/dynamodb/dynamoSummaryJobRepository';

const endpoint = process.env.DYNAMODB_ENDPOINT;

// DynamoDB Local を起動し、DYNAMODB_ENDPOINT を指定した場合のみ実行する
describe.skipIf(!endpoint)('DynamoSummaryJobRepository', () => {
  const repository = new DynamoSummaryJobRepository(createDocumentClient(endpoint));

  it('ジョブ・input・中間生成物・最終生成物を保存して読み出せる', async () => {
    const jobId = randomUUID();
    const job = SummaryJob.create({
      id: jobId,
      title: 'テスト',
      createdBy: 'test',
      now: new Date(),
    });
    const extraction = { keyPoints: ['a', 'b'], createdAt: job.createdAt };
    const summary = { text: '要約', createdAt: job.createdAt };

    await repository.saveSourceText(jobId, '入力テキスト');
    await repository.save(job);
    await repository.saveExtraction(jobId, extraction);
    await repository.saveSummary(jobId, summary);

    expect((await repository.findById(jobId))?.toProps()).toEqual(job.toProps());
    expect(await repository.findSourceText(jobId)).toBe('入力テキスト');
    expect(await repository.findExtraction(jobId)).toEqual(extraction);
    expect(await repository.findSummary(jobId)).toEqual(summary);
    expect((await repository.list(5)).map((listed) => listed.id)).toContain(jobId);
  });

  it('存在しないジョブは null を返す', async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
    expect(await repository.findSourceText(randomUUID())).toBeNull();
    expect(await repository.findExtraction(randomUUID())).toBeNull();
    expect(await repository.findSummary(randomUUID())).toBeNull();
  });
});
