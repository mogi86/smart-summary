import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** DynamoDB Local の既定の接続先 */
export const LOCAL_DYNAMODB_ENDPOINT = 'http://localhost:8000';

/** endpoint を指定した場合は DynamoDB Local に接続する */
export function createDynamoClient(endpoint?: string): DynamoDBClient {
  if (!endpoint) {
    return new DynamoDBClient({});
  }
  return new DynamoDBClient({
    endpoint,
    region: 'local',
    // DynamoDB Local は認証情報を検証しないためダミー値を渡す
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

export function createDocumentClient(endpoint?: string): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createDynamoClient(endpoint), {
    marshallOptions: { removeUndefinedValues: true },
  });
}
