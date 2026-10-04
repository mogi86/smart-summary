import type { Extraction, Summary } from '../domain/documents';
import type { SummaryJob } from '../domain/summaryJob';
import type { SummaryJobRepository } from '../domain/summaryJobRepository';
import { JobNotFoundError } from './errors';

export interface SummaryJobDetail {
  job: SummaryJob;
  extractions: Extraction[];
  summary: Summary | null;
}

/** ジョブと、その中間生成物・最終生成物を取得する */
export class GetSummaryJob {
  constructor(private readonly repository: SummaryJobRepository) {}

  async execute(jobId: string): Promise<SummaryJobDetail> {
    const job = await this.repository.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }
    const [extractions, summary] = await Promise.all([
      this.repository.findExtractions(jobId),
      this.repository.findSummary(jobId),
    ]);
    return { job, extractions, summary };
  }
}

export class ListSummaryJobs {
  constructor(private readonly repository: SummaryJobRepository) {}

  async execute(limit = 20): Promise<SummaryJob[]> {
    return this.repository.list(limit);
  }
}
