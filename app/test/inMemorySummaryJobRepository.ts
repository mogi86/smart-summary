import type { Extraction, SourceChunk, Summary } from '../src/domain/documents';
import type { SummaryJob } from '../src/domain/summaryJob';
import type { SummaryJobRepository } from '../src/domain/summaryJobRepository';

/** テスト用のインメモリ実装 */
export class InMemorySummaryJobRepository implements SummaryJobRepository {
  readonly jobs = new Map<string, SummaryJob>();
  readonly chunks = new Map<string, SourceChunk[]>();
  readonly extractions = new Map<string, Extraction[]>();
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

  async saveSourceChunks(jobId: string, chunks: SourceChunk[]): Promise<void> {
    this.chunks.set(jobId, chunks);
  }

  async findSourceChunks(jobId: string): Promise<SourceChunk[]> {
    return this.chunks.get(jobId) ?? [];
  }

  async saveExtraction(jobId: string, extraction: Extraction): Promise<void> {
    const others = (this.extractions.get(jobId) ?? []).filter(
      (existing) => existing.chunkIndex !== extraction.chunkIndex,
    );
    this.extractions.set(
      jobId,
      [...others, extraction].sort((a, b) => a.chunkIndex - b.chunkIndex),
    );
  }

  async findExtractions(jobId: string): Promise<Extraction[]> {
    return this.extractions.get(jobId) ?? [];
  }

  async saveSummary(jobId: string, summary: Summary): Promise<void> {
    this.summaries.set(jobId, summary);
  }

  async findSummary(jobId: string): Promise<Summary | null> {
    return this.summaries.get(jobId) ?? null;
  }
}
