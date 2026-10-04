import { DomainError } from './errors';

export const JOB_STATUSES = [
  'pending',
  'extracting',
  'summarizing',
  'completed',
  'failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface SummaryJobProps {
  id: string;
  title: string;
  status: JobStatus;
  /** 入力を分割したチャンク数 */
  chunkCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

/** 要約ジョブ。抽出→要約の進行状態を管理する */
export class SummaryJob {
  private constructor(private readonly props: SummaryJobProps) {}

  static create(params: {
    id: string;
    title: string;
    chunkCount: number;
    createdBy: string;
    now: Date;
  }): SummaryJob {
    if (params.chunkCount < 1) {
      throw new DomainError('入力テキストが空です');
    }
    const timestamp = params.now.toISOString();
    return new SummaryJob({
      id: params.id,
      title: params.title,
      status: 'pending',
      chunkCount: params.chunkCount,
      createdBy: params.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  /** 永続化された値から復元する */
  static reconstruct(props: SummaryJobProps): SummaryJob {
    return new SummaryJob({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get title(): string {
    return this.props.title;
  }
  get status(): JobStatus {
    return this.props.status;
  }
  get chunkCount(): number {
    return this.props.chunkCount;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): string {
    return this.props.createdAt;
  }
  get updatedAt(): string {
    return this.props.updatedAt;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }

  /** 抽出を開始する。失敗したジョブの再実行も許可する */
  startExtracting(now: Date): SummaryJob {
    return this.transition(['pending', 'failed'], 'extracting', now);
  }

  startSummarizing(now: Date): SummaryJob {
    return this.transition(['extracting'], 'summarizing', now);
  }

  complete(now: Date): SummaryJob {
    return this.transition(['summarizing'], 'completed', now);
  }

  fail(errorMessage: string, now: Date): SummaryJob {
    return this.transition(['pending', 'extracting', 'summarizing'], 'failed', now, errorMessage);
  }

  toProps(): SummaryJobProps {
    return { ...this.props };
  }

  private transition(
    allowedFrom: JobStatus[],
    to: JobStatus,
    now: Date,
    errorMessage?: string,
  ): SummaryJob {
    if (!allowedFrom.includes(this.props.status)) {
      throw new DomainError(`状態 ${this.props.status} から ${to} へは遷移できません`);
    }
    return new SummaryJob({
      ...this.props,
      status: to,
      updatedAt: now.toISOString(),
      errorMessage,
    });
  }
}
