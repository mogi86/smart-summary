import type { Extraction } from '../domain/documents';
import type { SummaryJob } from '../domain/summaryJob';
import type { SummaryJobRepository } from '../domain/summaryJobRepository';
import { JobNotFoundError } from './errors';
import type { Extractor, Summarizer } from './ports/llm';

/** ジョブを実行する（入力からの要点抽出 → 要点からの要約） */
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
      const extraction = await this.extract(jobId);

      job = job.startSummarizing(this.now());
      await this.repository.save(job);

      const text = await this.summarizer.summarize(job.title, extraction.keyPoints);
      await this.repository.saveSummary(jobId, { text, createdAt: this.now().toISOString() });

      job = job.complete(this.now());
      await this.repository.save(job);
    } catch (error) {
      job = job.fail(error instanceof Error ? error.message : String(error), this.now());
      await this.repository.save(job);
    }
    return job;
  }

  /** 抽出済みの場合は再利用するため、失敗したジョブの再実行では要約から再開される */
  private async extract(jobId: string): Promise<Extraction> {
    const existing = await this.repository.findExtraction(jobId);
    if (existing) {
      return existing;
    }

    const sourceText = await this.repository.findSourceText(jobId);
    if (sourceText === null) {
      throw new Error('入力テキストが保存されていません');
    }
    const extraction: Extraction = {
      keyPoints: await this.extractor.extract(sourceText),
      createdAt: this.now().toISOString(),
    };
    await this.repository.saveExtraction(jobId, extraction);
    return extraction;
  }
}
