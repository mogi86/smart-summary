import type { Extraction, SourceChunk } from '../../domain/documents';

/** チャンクから要点を抽出する（1 段目） */
export interface Extractor {
  extract(chunk: SourceChunk): Promise<string[]>;
}

/** 抽出結果から要約を生成する（2 段目） */
export interface Summarizer {
  summarize(title: string, extractions: Extraction[]): Promise<string>;
}
