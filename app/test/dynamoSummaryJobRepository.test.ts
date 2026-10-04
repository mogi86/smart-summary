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
      chunkCount: 12,
      createdBy: 'test',
      now: new Date(),
    });
    const chunks = Array.from({ length: 12 }, (_, index) => ({ index, text: `chunk-${index}` }));

    await repository.saveSourceChunks(jobId, chunks);
    await repository.save(job);
    await repository.saveExtraction(jobId, { chunkIndex: 1, keyPoints: ['b'] });
    await repository.saveExtraction(jobId, { chunkIndex: 0, keyPoints: ['a'] });
    await repository.saveSummary(jobId, { text: '要約', createdAt: job.createdAt });

    expect((await repository.findById(jobId))?.toProps()).toEqual(job.toProps());
    expect(await repository.findSourceChunks(jobId)).toEqual(chunks);
    expect(await repository.findExtractions(jobId)).toEqual([
      { chunkIndex: 0, keyPoints: ['a'] },
      { chunkIndex: 1, keyPoints: ['b'] },
    ]);
    expect(await repository.findSummary(jobId)).toEqual({ text: '要約', createdAt: job.createdAt });
    expect((await repository.list(5)).map((listed) => listed.id)).toContain(jobId);
  });

  it('存在しないジョブは null を返す', async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
    expect(await repository.findSummary(randomUUID())).toBeNull();
  });
});
