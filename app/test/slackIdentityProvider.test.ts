import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { SlackIdentityProvider } from '../src/infrastructure/slack/slackIdentityProvider';

const CLIENT_ID = 'client-id';
const REDIRECT_URI = 'https://app.example.com/auth/slack/callback';

let privateKey: CryptoKey;
let keySet: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  keySet = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }] });
});

function idToken(claims: Record<string, unknown>, expiresIn = '5m'): Promise<string> {
  return new SignJWT({
    nonce: 'nonce-1',
    name: 'Alice',
    'https://slack.com/team_id': 'T1',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer((claims.iss as string) ?? 'https://slack.com')
    .setAudience((claims.aud as string) ?? CLIENT_ID)
    .setSubject('U1')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

/** トークンエンドポイントの応答を差し替えたプロバイダを作る */
function provider(tokenResponse: unknown) {
  const requests: URLSearchParams[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    requests.push(init?.body as URLSearchParams);
    return Response.json(tokenResponse);
  };
  const identityProvider = new SlackIdentityProvider({
    clientId: CLIENT_ID,
    clientSecret: 'client-secret',
    teamId: 'T1',
    fetch: fakeFetch,
    keySet,
  });
  return { identityProvider, requests };
}

const response = { code: 'code-1', nonce: 'nonce-1', redirectUri: REDIRECT_URI };

describe('SlackIdentityProvider', () => {
  it('認可 URL に OpenID Connect のパラメータを付ける', () => {
    const { identityProvider } = provider({});
    const url = new URL(
      identityProvider.buildAuthorizationUrl({ state: 's', nonce: 'n', redirectUri: REDIRECT_URI }),
    );

    expect(url.origin + url.pathname).toBe('https://slack.com/openid/connect/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      scope: 'openid profile email',
      client_id: CLIENT_ID,
      state: 's',
      nonce: 'n',
      team: 'T1',
      redirect_uri: REDIRECT_URI,
    });
  });

  it('認可コードを交換し、検証済みの ID トークンから利用者を返す', async () => {
    const { identityProvider, requests } = provider({ ok: true, id_token: await idToken({}) });

    expect(await identityProvider.authenticate(response)).toEqual({
      id: 'U1',
      teamId: 'T1',
      name: 'Alice',
    });
    expect(Object.fromEntries(requests[0])).toEqual({
      code: 'code-1',
      client_id: CLIENT_ID,
      client_secret: 'client-secret',
      redirect_uri: REDIRECT_URI,
    });
  });

  it.each([
    ['nonce が一致しない', { nonce: 'other' }],
    ['対象（aud）が別のアプリ', { aud: 'other-client' }],
    ['発行者（iss）が Slack ではない', { iss: 'https://evil.example.com' }],
    ['ワークスペースの情報が無い', { 'https://slack.com/team_id': undefined }],
  ])('%s ID トークンは拒否する', async (_name, claims) => {
    const { identityProvider } = provider({ ok: true, id_token: await idToken(claims) });
    await expect(identityProvider.authenticate(response)).rejects.toThrow();
  });

  it('有効期限切れ、または別の鍵で署名された ID トークンは拒否する', async () => {
    const expired = provider({ ok: true, id_token: await idToken({}, '-1m') });
    await expect(expired.identityProvider.authenticate(response)).rejects.toThrow();

    const other = await generateKeyPair('RS256');
    const forgedToken = await new SignJWT({ nonce: 'nonce-1', 'https://slack.com/team_id': 'T1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://slack.com')
      .setAudience(CLIENT_ID)
      .setSubject('U1')
      .setExpirationTime('5m')
      .sign(other.privateKey);
    const forged = provider({ ok: true, id_token: forgedToken });
    await expect(forged.identityProvider.authenticate(response)).rejects.toThrow();
  });

  it('トークンの取得に失敗した場合は例外にする', async () => {
    const { identityProvider } = provider({ ok: false, error: 'invalid_code' });
    await expect(identityProvider.authenticate(response)).rejects.toThrow('invalid_code');
  });
});
