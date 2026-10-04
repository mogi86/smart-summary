/** 入力テキストから抽出した要点（中間生成物） */
export interface Extraction {
  keyPoints: string[];
  createdAt: string;
}

/** 最終的な要約（最終生成物） */
export interface Summary {
  text: string;
  createdAt: string;
}
