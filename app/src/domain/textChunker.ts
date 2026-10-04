import type { SourceChunk } from './documents';

export const DEFAULT_MAX_CHUNK_LENGTH = 8000;

/**
 * テキストを最大長以下のチャンクに分割する。
 * 段落（空行区切り）の境界を優先し、1 段落が最大長を超える場合のみ途中で分割する。
 */
export function splitIntoChunks(
  text: string,
  maxLength: number = DEFAULT_MAX_CHUNK_LENGTH,
): SourceChunk[] {
  if (maxLength < 1) {
    throw new RangeError('maxLength は 1 以上である必要があります');
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .flatMap((paragraph) => splitByLength(paragraph, maxLength));

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const joined = current === '' ? paragraph : `${current}\n\n${paragraph}`;
    if (joined.length <= maxLength) {
      current = joined;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current !== '') {
    chunks.push(current);
  }

  return chunks.map((chunkText, index) => ({ index, text: chunkText }));
}

function splitByLength(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += maxLength) {
    parts.push(text.slice(start, start + maxLength));
  }
  return parts;
}
