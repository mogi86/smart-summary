export interface AppConfig {
  geminiModel: string;
  /** DynamoDB Local を使う場合のみ指定する */
  dynamoEndpoint?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
  };
}

/** LLM を呼ぶ処理でのみ必要になるため、他の設定とは分けて読み込む */
export function loadGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.GEMINI_API_KEY;
  if (!value) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }
  return value;
}
