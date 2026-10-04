import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type {
  AuthorizationRequest,
  AuthorizationResponse,
  IdentityProvider,
} from '../../application/ports/identityProvider';
import type { AuthenticatedUser } from '../../domain/user';

// https://docs.slack.dev/authentication/sign-in-with-slack/
const ISSUER = 'https://slack.com';
const AUTHORIZATION_ENDPOINT = 'https://slack.com/openid/connect/authorize';
const TOKEN_ENDPOINT = 'https://slack.com/api/openid.connect.token';
const JWKS_URI = 'https://slack.com/openid/connect/keys';
const TEAM_ID_CLAIM = 'https://slack.com/team_id';

export interface SlackIdentityProviderOptions {
  clientId: string;
  clientSecret: string;
  /** 認可画面で選択させるワークスペース */
  teamId: string;
  /** テスト用の差し替え */
  fetch?: typeof fetch;
  keySet?: JWTVerifyGetKey;
}

/** Sign in with Slack（OpenID Connect）による認証 */
export class SlackIdentityProvider implements IdentityProvider {
  private readonly fetch: typeof fetch;
  private readonly keySet: JWTVerifyGetKey;

  constructor(private readonly options: SlackIdentityProviderOptions) {
    this.fetch = options.fetch ?? fetch;
    this.keySet = options.keySet ?? createRemoteJWKSet(new URL(JWKS_URI));
  }

  buildAuthorizationUrl(request: AuthorizationRequest): string {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
      response_type: 'code',
      scope: 'openid profile email',
      client_id: this.options.clientId,
      state: request.state,
      nonce: request.nonce,
      team: this.options.teamId,
      redirect_uri: request.redirectUri,
    }).toString();
    return url.toString();
  }

  async authenticate(response: AuthorizationResponse): Promise<AuthenticatedUser> {
    const idToken = await this.exchangeCode(response);

    // 署名・発行者・対象・有効期限を検証する
    const { payload } = await jwtVerify(idToken, this.keySet, {
      issuer: ISSUER,
      audience: this.options.clientId,
      algorithms: ['RS256'],
    });
    if (payload.nonce !== response.nonce) {
      throw new Error('ID トークンの nonce が一致しません');
    }

    const teamId = payload[TEAM_ID_CLAIM];
    if (typeof payload.sub !== 'string' || typeof teamId !== 'string') {
      throw new Error('ID トークンに利用者またはワークスペースの情報がありません');
    }
    return {
      id: payload.sub,
      teamId,
      name: typeof payload.name === 'string' ? payload.name : payload.sub,
    };
  }

  private async exchangeCode(response: AuthorizationResponse): Promise<string> {
    const result = await this.fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: response.code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: response.redirectUri,
      }),
    });
    const body = (await result.json()) as { ok?: boolean; id_token?: string; error?: string };
    if (!body.ok || !body.id_token) {
      throw new Error(`Slack のトークン取得に失敗しました: ${body.error ?? result.status}`);
    }
    return body.id_token;
  }
}
