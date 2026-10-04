import { jwtVerify, SignJWT } from 'jose';

export interface SessionUser {
  id: string;
  name: string;
}

/** ログイン開始からコールバックまで保持する値 */
export interface LoginAttempt {
  state: string;
  nonce: string;
}

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const LOGIN_ATTEMPT_MAX_AGE_SECONDS = 10 * 60;

/** Cookie に入れる値を署名付きトークン（HS256）として発行・検証する */
export class SessionTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issueSession(user: SessionUser): Promise<string> {
    return this.sign({ kind: 'session', ...user }, SESSION_MAX_AGE_SECONDS);
  }

  async verifySession(token: string | undefined): Promise<SessionUser | null> {
    const payload = await this.verify(token, 'session');
    if (!payload || typeof payload.id !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    return { id: payload.id, name: payload.name };
  }

  issueLoginAttempt(attempt: LoginAttempt): Promise<string> {
    return this.sign({ kind: 'login', ...attempt }, LOGIN_ATTEMPT_MAX_AGE_SECONDS);
  }

  async verifyLoginAttempt(token: string | undefined): Promise<LoginAttempt | null> {
    const payload = await this.verify(token, 'login');
    if (!payload || typeof payload.state !== 'string' || typeof payload.nonce !== 'string') {
      return null;
    }
    return { state: payload.state, nonce: payload.nonce };
  }

  private sign(payload: Record<string, string>, maxAgeSeconds: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${maxAgeSeconds}s`)
      .sign(this.key);
  }

  /** 署名・有効期限・用途が正しい場合だけペイロードを返す */
  private async verify(
    token: string | undefined,
    kind: string,
  ): Promise<Record<string, unknown> | null> {
    if (!token) {
      return null;
    }
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      return payload.kind === kind ? payload : null;
    } catch {
      return null;
    }
  }
}
