import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthenticateUser } from '../../application/authenticateUser';
import { WorkspaceNotAllowedError } from '../../application/errors';
import type { IdentityProvider } from '../../application/ports/identityProvider';
import {
  LOGIN_ATTEMPT_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  type SessionTokens,
  type SessionUser,
} from './session';

export type AuthConfig =
  /** 認証を行わず、常に固定の利用者として扱う（local 専用） */
  | { mode: 'disabled'; user: SessionUser }
  | {
      mode: 'slack';
      identityProvider: IdentityProvider;
      authenticateUser: AuthenticateUser;
      sessionTokens: SessionTokens;
    };

export type AuthEnv = { Variables: { user: SessionUser } };

const SESSION_COOKIE = 'session';
const LOGIN_COOKIE = 'login';
const CALLBACK_PATH = '/auth/slack/callback';

/** ログイン済みの利用者だけを通す。未ログインの場合は 401 を返す */
export function requireUser(auth: AuthConfig): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const user =
      auth.mode === 'disabled'
        ? auth.user
        : await auth.sessionTokens.verifySession(getCookie(c, SESSION_COOKIE));
    if (!user) {
      return c.json({ message: 'ログインが必要です' }, 401);
    }
    c.set('user', user);
    await next();
  };
}

/** /auth 配下のルート（ログイン開始・コールバック・ログアウト） */
export function createAuthRoutes(auth: AuthConfig): Hono {
  const routes = new Hono();
  if (auth.mode === 'disabled') {
    return routes;
  }
  const { identityProvider, authenticateUser, sessionTokens } = auth;

  routes.get('/slack/login', async (c) => {
    const attempt = { state: randomUUID(), nonce: randomUUID() };
    setCookie(c, LOGIN_COOKIE, await sessionTokens.issueLoginAttempt(attempt), {
      ...cookieOptions(c),
      maxAge: LOGIN_ATTEMPT_MAX_AGE_SECONDS,
    });
    return c.redirect(
      identityProvider.buildAuthorizationUrl({ ...attempt, redirectUri: redirectUri(c) }),
    );
  });

  routes.get('/slack/callback', async (c) => {
    const attempt = await sessionTokens.verifyLoginAttempt(getCookie(c, LOGIN_COOKIE));
    deleteCookie(c, LOGIN_COOKIE, { path: '/' });

    const code = c.req.query('code');
    if (!attempt || !code || c.req.query('state') !== attempt.state) {
      return c.redirect('/?error=login_failed');
    }

    try {
      const user = await authenticateUser.execute({
        code,
        nonce: attempt.nonce,
        redirectUri: redirectUri(c),
      });
      setCookie(c, SESSION_COOKIE, await sessionTokens.issueSession(user), {
        ...cookieOptions(c),
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
      return c.redirect('/');
    } catch (error) {
      if (error instanceof WorkspaceNotAllowedError) {
        console.warn(`許可されていないワークスペースからのログインを拒否しました: ${error.teamId}`);
        return c.redirect('/?error=forbidden_workspace');
      }
      console.error('ログインに失敗しました', error);
      return c.redirect('/?error=login_failed');
    }
  });

  routes.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  return routes;
}

function redirectUri(c: Context): string {
  return new URL(CALLBACK_PATH, c.req.url).toString();
}

function cookieOptions(c: Context) {
  return {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
  } as const;
}
