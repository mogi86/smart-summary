import { describe, expect, it } from 'vitest';
import { AuthenticateUser } from '../src/application/authenticateUser';
import type {
  AuthorizationRequest,
  AuthorizationResponse,
  IdentityProvider,
} from '../src/application/ports/identityProvider';
import { GetSummaryJob, ListSummaryJobs } from '../src/application/querySummaryJobs';
import { SubmitSummaryJob } from '../src/application/submitSummaryJob';
import type { AuthenticatedUser } from '../src/domain/user';
import { createApp } from '../src/presentation/http/app';
import { SessionTokens } from '../src/presentation/http/session';
import { InMemorySummaryJobRepository } from './inMemorySummaryJobRepository';

const ALLOWED_TEAM = 'T_ALLOWED';
const ORIGIN = 'https://app.example.com';

/** 認可コードに対応する利用者を返すだけの ID プロバイダ */
class FakeIdentityProvider implements IdentityProvider {
  lastResponse: AuthorizationResponse | null = null;

  constructor(private readonly users: Record<string, AuthenticatedUser>) {}

  buildAuthorizationUrl(request: AuthorizationRequest): string {
    return `https://idp.example.com/authorize?${new URLSearchParams({ ...request })}`;
  }

  async authenticate(response: AuthorizationResponse): Promise<AuthenticatedUser> {
    this.lastResponse = response;
    const user = this.users[response.code];
    if (!user) {
      throw new Error('invalid code');
    }
    return user;
  }
}

function newApp() {
  const repository = new InMemorySummaryJobRepository();
  const identityProvider = new FakeIdentityProvider({
    'code-allowed': { id: 'U1', teamId: ALLOWED_TEAM, name: 'Alice' },
    'code-other': { id: 'U2', teamId: 'T_OTHER', name: 'Mallory' },
  });
  const app = createApp({
    submitSummaryJob: new SubmitSummaryJob(repository, { dispatch: async () => {} }),
    getSummaryJob: new GetSummaryJob(repository),
    listSummaryJobs: new ListSummaryJobs(repository),
    auth: {
      mode: 'slack',
      identityProvider,
      authenticateUser: new AuthenticateUser(identityProvider, ALLOWED_TEAM),
      sessionTokens: new SessionTokens('test-secret'),
    },
  });
  return { app, identityProvider };
}

/** Set-Cookie ヘッダから、次のリクエストで送る Cookie ヘッダを作る */
function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function startLogin(app: ReturnType<typeof newApp>['app']) {
  const response = await app.request(`${ORIGIN}/auth/slack/login`);
  const location = new URL(response.headers.get('Location')!);
  return {
    response,
    cookie: cookiesFrom(response),
    state: location.searchParams.get('state')!,
    nonce: location.searchParams.get('nonce')!,
    redirectUri: location.searchParams.get('redirectUri')!,
  };
}

describe('Slack 認証', () => {
  it('未ログインでは API を利用できない', async () => {
    const { app } = newApp();
    expect((await app.request(`${ORIGIN}/api/me`)).status).toBe(401);
    expect((await app.request(`${ORIGIN}/api/jobs`)).status).toBe(401);
  });

  it('ログイン開始で ID プロバイダへリダイレクトする', async () => {
    const { app } = newApp();
    const login = await startLogin(app);

    expect(login.response.status).toBe(302);
    expect(login.redirectUri).toBe(`${ORIGIN}/auth/slack/callback`);
    expect(login.response.headers.getSetCookie()[0]).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });

  it('許可されたワークスペースの利用者はログインでき、API を利用できる', async () => {
    const { app, identityProvider } = newApp();
    const login = await startLogin(app);

    const callback = await app.request(
      `${ORIGIN}/auth/slack/callback?code=code-allowed&state=${login.state}`,
      { headers: { Cookie: login.cookie } },
    );
    expect(callback.headers.get('Location')).toBe('/');
    expect(identityProvider.lastResponse).toEqual({
      code: 'code-allowed',
      nonce: login.nonce,
      redirectUri: login.redirectUri,
    });

    const session = cookiesFrom(callback);
    const me = await app.request(`${ORIGIN}/api/me`, { headers: { Cookie: session } });
    expect(await me.json()).toEqual({ user: { id: 'U1', name: 'Alice' }, authEnabled: true });

    const created = await app.request(`${ORIGIN}/api/jobs`, {
      method: 'POST',
      headers: { Cookie: session, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '本文' }),
    });
    expect(((await created.json()) as { createdBy: string }).createdBy).toBe('U1');
  });

  it('許可されていないワークスペースの利用者はログインできない', async () => {
    const { app } = newApp();
    const login = await startLogin(app);

    const callback = await app.request(
      `${ORIGIN}/auth/slack/callback?code=code-other&state=${login.state}`,
      { headers: { Cookie: login.cookie } },
    );
    expect(callback.headers.get('Location')).toBe('/?error=forbidden_workspace');
    expect(cookiesFrom(callback)).toBe('');
  });

  it('state が一致しない、またはログイン開始の Cookie が無い場合は拒否する', async () => {
    const { app, identityProvider } = newApp();
    const login = await startLogin(app);

    const wrongState = await app.request(
      `${ORIGIN}/auth/slack/callback?code=code-allowed&state=wrong`,
      { headers: { Cookie: login.cookie } },
    );
    expect(wrongState.headers.get('Location')).toBe('/?error=login_failed');

    const noCookie = await app.request(
      `${ORIGIN}/auth/slack/callback?code=code-allowed&state=${login.state}`,
    );
    expect(noCookie.headers.get('Location')).toBe('/?error=login_failed');
    expect(identityProvider.lastResponse).toBeNull();
  });

  it('改ざんされたセッションや、ログイン開始用のトークンではログイン扱いにならない', async () => {
    const { app } = newApp();
    const login = await startLogin(app);
    const loginToken = login.cookie.split('=')[1];
    const forged = await new SessionTokens('other-secret').issueSession({ id: 'U1', name: 'A' });

    for (const token of [loginToken, forged, 'broken']) {
      const response = await app.request(`${ORIGIN}/api/me`, {
        headers: { Cookie: `session=${token}` },
      });
      expect(response.status).toBe(401);
    }
  });

  it('ログアウトするとセッションが削除される', async () => {
    const { app } = newApp();
    const response = await app.request(`${ORIGIN}/auth/logout`, { method: 'POST' });
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()[0]).toMatch(/^session=;/);
  });
});
