import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Extraction, Summary } from '../../domain/documents';
import { SummaryJob, type SummaryJobProps } from '../../domain/summaryJob';
import type { SummaryJobRepository } from '../../domain/summaryJobRepository';

/**
 * 単一テーブル設計。
 *   PK = JOB#<jobId>
 *   SK = META | INPUT | EXTRACT | SUMMARY
 * ジョブ一覧は GSI1（GSI1PK = JOBS, GSI1SK = <createdAt>#<jobId>）で引く。
 */
export const TABLE_NAME = 'smart-summary';
export const JOB_LIST_INDEX = 'GSI1';
const JOB_LIST_PK = 'JOBS';

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

  async saveSourceText(jobId: string, text: string): Promise<void> {
    await this.client.send(
      new PutCommand({ TableName: TABLE_NAME, Item: { PK: jobKey(jobId), SK: 'INPUT', text } }),
    );
  }

  async findSourceText(jobId: string): Promise<string | null> {
    const item = await this.getItem(jobId, 'INPUT');
    return item ? (item.text as string) : null;
  }

  async saveExtraction(jobId: string, extraction: Extraction): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: jobKey(jobId), SK: 'EXTRACT', ...extraction },
      }),
    );
  }

  async findExtraction(jobId: string): Promise<Extraction | null> {
    const item = await this.getItem(jobId, 'EXTRACT');
    return item
      ? { keyPoints: item.keyPoints as string[], createdAt: item.createdAt as string }
      : null;
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
}

function jobKey(jobId: string): string {
  return `JOB#${jobId}`;
}

function toJob(item: Record<string, unknown>): SummaryJob {
  const props: SummaryJobProps = {
    id: item.id as string,
    title: item.title as string,
    status: item.status as SummaryJobProps['status'],
    createdBy: item.createdBy as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    errorMessage: item.errorMessage as string | undefined,
  };
  return SummaryJob.reconstruct(props);
}
