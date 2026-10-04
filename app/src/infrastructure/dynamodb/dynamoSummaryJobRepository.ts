import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Extraction, SourceChunk, Summary } from '../../domain/documents';
import { SummaryJob, type SummaryJobProps } from '../../domain/summaryJob';
import type { SummaryJobRepository } from '../../domain/summaryJobRepository';

/**
 * 単一テーブル設計。
 *   PK = JOB#<jobId>
 *   SK = META | INPUT#<連番> | EXTRACT#<連番> | SUMMARY
 * ジョブ一覧は GSI1（GSI1PK = JOBS, GSI1SK = <createdAt>#<jobId>）で引く。
 */
export const TABLE_NAME = 'smart-summary';
export const JOB_LIST_INDEX = 'GSI1';
const JOB_LIST_PK = 'JOBS';
const PUT_CONCURRENCY = 10;

export class DynamoSummaryJobRepository implements SummaryJobRepository {
  constructor(private readonly client: DynamoDBDocumentClient) {}

  async save(job: SummaryJob): Promise<void> {
    const props = job.toProps();
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: jobKey(props.id),
          SK: 'META',
          GSI1PK: JOB_LIST_PK,
          GSI1SK: `${props.createdAt}#${props.id}`,
          ...props,
        },
      }),
    );
  }

  async findById(jobId: string): Promise<SummaryJob | null> {
    const item = await this.getItem(jobId, 'META');
    return item ? toJob(item) : null;
  }

  async list(limit: number): Promise<SummaryJob[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: JOB_LIST_INDEX,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': JOB_LIST_PK },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map(toJob);
  }

  async saveSourceChunks(jobId: string, chunks: SourceChunk[]): Promise<void> {
    for (let start = 0; start < chunks.length; start += PUT_CONCURRENCY) {
      await Promise.all(
        chunks.slice(start, start + PUT_CONCURRENCY).map((chunk) =>
          this.client.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                PK: jobKey(jobId),
                SK: `INPUT#${sequence(chunk.index)}`,
                index: chunk.index,
                text: chunk.text,
              },
            }),
          ),
        ),
      );
    }
  }

  async findSourceChunks(jobId: string): Promise<SourceChunk[]> {
    const items = await this.queryByPrefix(jobId, 'INPUT#');
    return items.map((item) => ({ index: item.index as number, text: item.text as string }));
  }

  async saveExtraction(jobId: string, extraction: Extraction): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: jobKey(jobId),
          SK: `EXTRACT#${sequence(extraction.chunkIndex)}`,
          chunkIndex: extraction.chunkIndex,
          keyPoints: extraction.keyPoints,
        },
      }),
    );
  }

  async findExtractions(jobId: string): Promise<Extraction[]> {
    const items = await this.queryByPrefix(jobId, 'EXTRACT#');
    return items.map((item) => ({
      chunkIndex: item.chunkIndex as number,
      keyPoints: item.keyPoints as string[],
    }));
  }

  async saveSummary(jobId: string, summary: Summary): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: jobKey(jobId), SK: 'SUMMARY', ...summary },
      }),
    );
  }

  async findSummary(jobId: string): Promise<Summary | null> {
    const item = await this.getItem(jobId, 'SUMMARY');
    return item ? { text: item.text as string, createdAt: item.createdAt as string } : null;
  }

  private async getItem(jobId: string, sortKey: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: jobKey(jobId), SK: sortKey } }),
    );
    return result.Item ?? null;
  }

  /** SK の前方一致で全件取得する（SK 昇順 = 連番順） */
  private async queryByPrefix(jobId: string, prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': jobKey(jobId), ':prefix': prefix },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return items;
  }
}

function jobKey(jobId: string): string {
  return `JOB#${jobId}`;
}

/** SK の辞書順と連番順を一致させるためゼロ埋めする */
function sequence(index: number): string {
  return String(index).padStart(6, '0');
}

function toJob(item: Record<string, unknown>): SummaryJob {
  const props: SummaryJobProps = {
    id: item.id as string,
    title: item.title as string,
    status: item.status as SummaryJobProps['status'],
    chunkCount: item.chunkCount as number,
    createdBy: item.createdBy as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    errorMessage: item.errorMessage as string | undefined,
  };
  return SummaryJob.reconstruct(props);
}
