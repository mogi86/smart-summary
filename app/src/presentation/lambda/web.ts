import { join } from 'node:path';
import { handle } from 'hono/aws-lambda';
import { createApp } from '../http/app';
import { composeWeb } from './composition';

type WebHandler = ReturnType<typeof handle>;

// 画面のビルド成果物は、デプロイ時にハンドラと同じディレクトリの public/ に配置される
const STATIC_ROOT = join(__dirname, 'public');

let initialized: Promise<WebHandler> | undefined;

async function initialize(): Promise<WebHandler> {
  return handle(createApp(await composeWeb(STATIC_ROOT)));
}

/** Function URL から呼び出される。API と画面の両方を返す */
export const handler: WebHandler = async (event, lambdaContext) => {
  initialized ??= initialize();
  return (await initialized)(event, lambdaContext);
};
