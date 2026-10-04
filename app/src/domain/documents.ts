/** 入力テキストを分割した 1 チャンク（input） */
export interface SourceChunk {
  index: number;
  text: string;
}

/** チャンクから抽出した要点（中間生成物） */
export interface Extraction {
  chunkIndex: number;
  keyPoints: string[];
}

/** 最終的な要約（最終生成物） */
export interface Summary {
  text: string;
  createdAt: string;
}
