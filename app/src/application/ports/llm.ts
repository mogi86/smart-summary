/** 入力テキストから要点を抽出する（1 段目） */
export interface Extractor {
  extract(text: string): Promise<string[]>;
}

/** 抽出した要点から要約を生成する（2 段目） */
export interface Summarizer {
  summarize(title: string, keyPoints: string[]): Promise<string>;
}
