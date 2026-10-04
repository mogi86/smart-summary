import type { AuthenticatedUser } from '../../domain/user';

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  redirectUri: string;
}

export interface AuthorizationResponse {
  code: string;
  /** 認可リクエストで送った nonce。ID トークンの nonce と照合する */
  nonce: string;
  redirectUri: string;
}

/** OpenID Connect の ID プロバイダ */
export interface IdentityProvider {
  buildAuthorizationUrl(request: AuthorizationRequest): string;
  /** 認可コードを検証済みの利用者情報に交換する。検証に失敗した場合は例外を投げる */
  authenticate(response: AuthorizationResponse): Promise<AuthenticatedUser>;
}
