import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Handler } from 'hono';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** 画面のビルド成果物を返す */
export function serveStaticFiles(root: string): Handler {
  const rootDir = resolve(root);

  return async (c) => {
    const filePath = resolve(rootDir, `.${c.req.path}`);
    const insideRoot = filePath === rootDir || filePath.startsWith(rootDir + sep);
    const isAsset = extname(filePath) !== '';
    const content = insideRoot && isAsset ? await tryRead(filePath) : null;
    if (content) {
      return c.body(content, 200, {
        'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        // ビルド成果物のファイル名にはハッシュが付くため長期キャッシュできる
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    }

    // 画面内の遷移先（拡張子なしのパス）にだけ index.html を返す
    const index = isAsset ? null : await tryRead(resolve(rootDir, 'index.html'));
    if (!index) {
      return c.notFound();
    }
    return c.body(index, 200, {
      'Content-Type': CONTENT_TYPES['.html'],
      'Cache-Control': 'no-cache',
    });
  };
}

async function tryRead(filePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(filePath));
  } catch {
    return null;
  }
}
