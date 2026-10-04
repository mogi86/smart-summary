import { CreateTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { createDynamoClient, LOCAL_DYNAMODB_ENDPOINT } from './client';
import { JOB_LIST_INDEX, TABLE_NAME } from './dynamoSummaryJobRepository';

/**
 * DynamoDB Local にテーブルを作成する（local 専用）。
 * AWS 上のテーブルは infra/ の CDK で定義するため、キー構成を変える場合は両方を揃えること。
 */
async function main(): Promise<void> {
  // 接続先が未設定でも実 AWS にはテーブルを作らない
  const endpoint = process.env.DYNAMODB_ENDPOINT || LOCAL_DYNAMODB_ENDPOINT;

  try {
    await createDynamoClient(endpoint).send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: JOB_LIST_INDEX,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    );
    console.log(`テーブルを作成しました: ${TABLE_NAME}`);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`テーブルは作成済みです: ${TABLE_NAME}`);
      return;
    }
    throw error;
  }
}

await main();
