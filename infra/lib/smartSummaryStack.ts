import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAMBDA_ENTRY_DIR = join(REPOSITORY_ROOT, 'app', 'src', 'presentation', 'lambda');

/** シークレットを置く SSM パラメータの接頭辞。値は README の手順で登録する */
const PARAMETER_PREFIX = '/smart-summary';

export class SmartSummaryStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // キー構成は app/src/infrastructure/dynamodb/createLocalTable.ts と揃えること
    const table = new Table(this, 'Table', {
      tableName: 'smart-summary',
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
    });

    const commonProps: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_24_X,
      projectRoot: REPOSITORY_ROOT,
      depsLockFilePath: join(REPOSITORY_ROOT, 'package-lock.json'),
      memorySize: 512,
    };

    // 抽出 → 要約を実行する。Web から非同期で呼び出されるだけで、外部には公開しない
    const worker = new NodejsFunction(this, 'Worker', {
      ...commonProps,
      entry: join(LAMBDA_ENTRY_DIR, 'worker.ts'),
      timeout: Duration.minutes(5),
      // ジョブの失敗は状態として記録するため、Lambda 側では再試行しない
      retryAttempts: 0,
    });

    // API と画面を返す
    const web = new NodejsFunction(this, 'Web', {
      ...commonProps,
      entry: join(LAMBDA_ENTRY_DIR, 'web.ts'),
      timeout: Duration.seconds(30),
      environment: { WORKER_FUNCTION_NAME: worker.functionName },
      bundling: {
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // 画面のビルド成果物（npm run build で生成）を同梱する
          afterBundling: (inputDir, outputDir) => [
            `cp -r "${inputDir}/web/dist" "${outputDir}/public"`,
          ],
        },
      },
    });

    for (const fn of [worker, web]) {
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['ssm:GetParameters'],
          resources: [
            this.formatArn({ service: 'ssm', resource: `parameter${PARAMETER_PREFIX}/*` }),
          ],
        }),
      );
    }
    worker.grantInvoke(web);

    // URL 自体は公開し、アプリ側の Slack 認証でアクセスを制御する
    const url = web.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
    new CfnOutput(this, 'Url', { value: url.url });
  }
}
