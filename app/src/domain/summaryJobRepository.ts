import type { Extraction, SourceChunk, Summary } from './documents';
import type { SummaryJob } from './summaryJob';

/** ジョブと、それに紐づく input・中間生成物・最終生成物の永続化 */
export interface SummaryJobRepository {
  save(job: SummaryJob): Promise<void>;
  findById(jobId: string): Promise<SummaryJob | null>;
  /** 作成日時の新しい順に返す */
  list(limit: number): Promise<SummaryJob[]>;

  saveSourceChunks(jobId: string, chunks: SourceChunk[]): Promise<void>;
  findSourceChunks(jobId: string): Promise<SourceChunk[]>;

  saveExtraction(jobId: string, extraction: Extraction): Promise<void>;
  findExtractions(jobId: string): Promise<Extraction[]>;

  saveSummary(jobId: string, summary: Summary): Promise<void>;
  findSummary(jobId: string): Promise<Summary | null>;
}
