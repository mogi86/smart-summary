import { App } from 'aws-cdk-lib';
import { SmartSummaryStack } from '../lib/smartSummaryStack';

const app = new App();

new SmartSummaryStack(app, 'SmartSummaryStack', {
  // アカウント ID はコードに書かず、デプロイ時の認証情報から解決する
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-1' },
});
