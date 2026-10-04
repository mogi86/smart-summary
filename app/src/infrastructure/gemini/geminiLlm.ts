import { GoogleGenAI } from '@google/genai';
import { startObservation } from '@langfuse/tracing';
import type { Extractor, Summarizer } from '../../application/ports/llm';

const EXTRACTION_INSTRUCTION = `あなたは長文から要点を抽出するアシスタントです。
与えられた文章から、後段の要約に必要な要点を、文章の流れに沿って抽出してください。
- 事実・主張・結論・数値・固有名詞・因果関係を漏らさないこと
- 各要点は、それ単体で意味が通じる 1 文にすること
- 文章に書かれていない内容を補わないこと
- 文章と同じ言語で書くこと`;

const SUMMARY_INSTRUCTION = `あなたは要約を作成するアシスタントです。
長文から抽出された要点の一覧をもとに、文章全体の要約を作成してください。
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

  async extract(text: string): Promise<string[]> {
    const outputText = await this.generate('extract', EXTRACTION_INSTRUCTION, text, () =>
      this.client.interactions.create({
        model: this.model,
        system_instruction: EXTRACTION_INSTRUCTION,
        input: text,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: EXTRACTION_SCHEMA,
        },
      }),
    );
    return parseKeyPoints(outputText);
  }

  async summarize(title: string, keyPoints: string[]): Promise<string> {
    const keyPointList = keyPoints.map((keyPoint) => `- ${keyPoint}`).join('\n');
    const input = `タイトル: ${title}\n\n要点一覧:\n${keyPointList}`;
    const outputText = await this.generate('summarize', SUMMARY_INSTRUCTION, input, () =>
      this.client.interactions.create({
        model: this.model,
        system_instruction: SUMMARY_INSTRUCTION,
        input,
      }),
    );
    return outputText.trim();
  }

  /** LLM を呼び出し、入出力とトークン使用量を Langfuse の generation として記録する */
  private async generate(
    name: string,
    instruction: string,
    input: string,
    call: () => Promise<InteractionResult>,
  ): Promise<string> {
    const generation = startObservation(
      name,
      {
        model: this.model,
        input: [
          { role: 'system', content: instruction },
          { role: 'user', content: input },
        ],
      },
      { asType: 'generation' },
    );
    try {
      const interaction = await call();
      const outputText = requireOutput(interaction.output_text);
      generation.update({
        output: outputText,
        usageDetails: toUsageDetails(interaction.usage),
      });
      return outputText;
    } catch (error) {
      generation.update({
        level: 'ERROR',
        statusMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      generation.end();
    }
  }
}

interface InteractionResult {
  output_text?: string;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_tokens?: number;
  };
}

function toUsageDetails(usage: InteractionResult['usage']): Record<string, number> {
  const details: Record<string, number> = {};
  if (usage?.total_input_tokens !== undefined) details.input = usage.total_input_tokens;
  if (usage?.total_output_tokens !== undefined) details.output = usage.total_output_tokens;
  if (usage?.total_tokens !== undefined) details.total = usage.total_tokens;
  return details;
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
