import { GoogleGenAI } from '@google/genai';
import type { Extractor, Summarizer } from '../../application/ports/llm';
import type { Extraction, SourceChunk } from '../../domain/documents';

const EXTRACTION_INSTRUCTION = `あなたは長文から要点を抽出するアシスタントです。
与えられた文章の一部分から、後段の要約に必要な要点を抽出してください。
- 事実・主張・結論・数値・固有名詞・因果関係を漏らさないこと
- 各要点は、それ単体で意味が通じる 1 文にすること
- 文章に書かれていない内容を補わないこと
- 文章と同じ言語で書くこと`;

const SUMMARY_INSTRUCTION = `あなたは要約を作成するアシスタントです。
長文から順番に抽出された要点の一覧をもとに、文章全体の要約を作成してください。
- 冒頭に全体の結論を 2〜3 文で述べ、その後に主要な論点を整理すること
- 重複する要点は統合すること
- 要点に書かれていない内容を補わないこと
- 要点と同じ言語で、Markdown 形式で書くこと`;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    key_points: {
      type: 'array',
      items: { type: 'string' },
      description: '抽出した要点の一覧',
    },
  },
  required: ['key_points'],
};

/** Gemini による抽出・要約の実装 */
export class GeminiLlm implements Extractor, Summarizer {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async extract(chunk: SourceChunk): Promise<string[]> {
    const interaction = await this.client.interactions.create({
      model: this.model,
      system_instruction: EXTRACTION_INSTRUCTION,
      input: chunk.text,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: EXTRACTION_SCHEMA,
      },
    });
    return parseKeyPoints(requireOutput(interaction.output_text));
  }

  async summarize(title: string, extractions: Extraction[]): Promise<string> {
    const keyPoints = extractions
      .flatMap((extraction) => extraction.keyPoints)
      .map((keyPoint) => `- ${keyPoint}`)
      .join('\n');
    const interaction = await this.client.interactions.create({
      model: this.model,
      system_instruction: SUMMARY_INSTRUCTION,
      input: `タイトル: ${title}\n\n要点一覧:\n${keyPoints}`,
    });
    return requireOutput(interaction.output_text).trim();
  }
}

function requireOutput(outputText: string | undefined): string {
  if (!outputText) {
    throw new Error('Gemini から出力が返りませんでした');
  }
  return outputText;
}

function parseKeyPoints(outputText: string): string[] {
  const parsed: unknown = JSON.parse(outputText);
  const keyPoints = (parsed as { key_points?: unknown }).key_points;
  if (!Array.isArray(keyPoints) || !keyPoints.every((item) => typeof item === 'string')) {
    throw new Error('Gemini の抽出結果が想定した形式ではありません');
  }
  return keyPoints;
}
