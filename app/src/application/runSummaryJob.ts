import type { SummaryJob } from '../domain/summaryJob';
import type { SummaryJobRepository } from '../domain/summaryJobRepository';
import { JobNotFoundError } from './errors';
import type { Extractor, Summarizer } from './ports/llm';

/** 抽出を同時に実行するチャンク数 */
const EXTRACTION_CONCURRENCY = 3;

/** ジョブを実行する（チャンクごとの抽出 → 抽出結果からの要約） */
export class RunSummaryJob {
  constructor(
    private readonly repository: SummaryJobRepository,
    private readonly extractor: Extractor,
    private readonly summarizer: Summarizer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 処理中の失敗は例外にせず、ジョブを failed にして返す */
  async execute(jobId: string): Promise<SummaryJob> {
    const found = await this.repository.findById(jobId);
    if (!found) {
      throw new JobNotFoundError(jobId);
    }

    let job = found.startExtracting(this.now());
    await this.repository.save(job);

    try {
      await this.extractAll(jobId);

      job = job.startSummarizing(this.now());
      await this.repository.save(job);

      const extractions = await this.repository.findExtractions(jobId);
      const text = await this.summarizer.summarize(job.title, extractions);
      await this.repository.saveSummary(jobId, { text, createdAt: this.now().toISOString() });

      job = job.complete(this.now());
      await this.repository.save(job);
    } catch (error) {
      job = job.fail(error instanceof Error ? error.message : String(error), this.now());
      await this.repository.save(job);
    }
    return job;
  }

  /** 抽出済みのチャンクは飛ばすため、失敗したジョブの再実行では途中から再開される */
  private async extractAll(jobId: string): Promise<void> {
    const chunks = await this.repository.findSourceChunks(jobId);
    const extracted = await this.repository.findExtractions(jobId);
    const done = new Set(extracted.map((extraction) => extraction.chunkIndex));
    const pending = chunks.filter((chunk) => !done.has(chunk.index));

    for (let start = 0; start < pending.length; start += EXTRACTION_CONCURRENCY) {
      const batch = pending.slice(start, start + EXTRACTION_CONCURRENCY);
      await Promise.all(
        batch.map(async (chunk) => {
          const keyPoints = await this.extractor.extract(chunk);
          await this.repository.saveExtraction(jobId, { chunkIndex: chunk.index, keyPoints });
        }),
      );
    }
  }
}
