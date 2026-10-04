import { randomUUID } from 'node:crypto';
import { SummaryJob } from '../domain/summaryJob';
import type { SummaryJobRepository } from '../domain/summaryJobRepository';
import { InvalidInputError } from './errors';
import type { JobDispatcher } from './ports/jobDispatcher';

export interface SubmitSummaryJobInput {
  title?: string;
  text: string;
  createdBy: string;
}

const MAX_TITLE_LENGTH = 100;

/** 入力テキストを保存してジョブを登録し、実行を依頼する */
export class SubmitSummaryJob {
  constructor(
    private readonly repository: SummaryJobRepository,
    private readonly dispatcher: JobDispatcher,
    private readonly generateId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SubmitSummaryJobInput): Promise<SummaryJob> {
    const text = input.text.trim();
    if (text === '') {
      throw new InvalidInputError('入力テキストが空です');
    }

    const job = SummaryJob.create({
      id: this.generateId(),
      title: resolveTitle(input.title, text),
      createdBy: input.createdBy,
      now: this.now(),
    });

    await this.repository.saveSourceText(job.id, text);
    await this.repository.save(job);
    await this.dispatcher.dispatch(job.id);
    return job;
  }
}

/** タイトル未指定の場合は本文の 1 行目を使う */
function resolveTitle(title: string | undefined, text: string): string {
  const candidate = title?.trim() || text.split('\n')[0].trim();
  return candidate.slice(0, MAX_TITLE_LENGTH);
}
