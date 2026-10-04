import type { Extraction, Summary } from '../src/domain/documents';
import type { SummaryJob } from '../src/domain/summaryJob';
import type { SummaryJobRepository } from '../src/domain/summaryJobRepository';

/** テスト用のインメモリ実装 */
export class InMemorySummaryJobRepository implements SummaryJobRepository {
  readonly jobs = new Map<string, SummaryJob>();
  readonly sourceTexts = new Map<string, string>();
  readonly extractions = new Map<string, Extraction>();
  readonly summaries = new Map<string, Summary>();
  /** save された状態の履歴 */
  readonly statusHistory: string[] = [];

  async save(job: SummaryJob): Promise<void> {
    this.jobs.set(job.id, job);
    this.statusHistory.push(job.status);
  }

  async findById(jobId: string): Promise<SummaryJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async list(limit: number): Promise<SummaryJob[]> {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async saveSourceText(jobId: string, text: string): Promise<void> {
    this.sourceTexts.set(jobId, text);
  }

  async findSourceText(jobId: string): Promise<string | null> {
    return this.sourceTexts.get(jobId) ?? null;
  }

  async saveExtraction(jobId: string, extraction: Extraction): Promise<void> {
    this.extractions.set(jobId, extraction);
  }

  async findExtraction(jobId: string): Promise<Extraction | null> {
    return this.extractions.get(jobId) ?? null;
  }

  async saveSummary(jobId: string, summary: Summary): Promise<void> {
    this.summaries.set(jobId, summary);
  }

  async findSummary(jobId: string): Promise<Summary | null> {
    return this.summaries.get(jobId) ?? null;
  }
}
