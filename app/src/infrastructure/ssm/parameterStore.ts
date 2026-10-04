import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

/** SSM Parameter Store から SecureString を含むパラメータをまとめて取得する */
export async function loadParameters<Name extends string>(
  names: readonly Name[],
): Promise<Record<Name, string>> {
  const result = await new SSMClient({}).send(
    new GetParametersCommand({ Names: [...names], WithDecryption: true }),
  );
  if (result.InvalidParameters?.length) {
    throw new Error(`SSM パラメータが見つかりません: ${result.InvalidParameters.join(', ')}`);
  }
  const values = Object.fromEntries(
    (result.Parameters ?? []).map((parameter) => [parameter.Name, parameter.Value]),
  );
  return values as Record<Name, string>;
}
