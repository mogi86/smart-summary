const ERROR_MESSAGES: Record<string, string> = {
  forbidden_workspace: '許可されていないワークスペースです。',
  login_failed: 'ログインに失敗しました。もう一度お試しください。',
};

export function Login() {
  const errorCode = new URLSearchParams(window.location.search).get('error');
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.login_failed) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">smart-summary</h1>
        <p className="mt-2 text-sm text-slate-500">長文を抽出 → 要約の 2 段階で要約します。</p>

        {error && (
          <p role="alert" className="mt-6 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <a
          href="/auth/slack/login"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-900 transition-colors hover:bg-slate-50"
        >
          <SlackLogo />
          Sign in with Slack
        </a>
      </div>
    </div>
  );
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 122.8 122.8" className="size-5" aria-hidden="true">
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.700 0 77.600s5.800-12.900 12.900-12.900h12.900v12.900zm6.500 0c0-7.100 5.800-12.900 12.900-12.900s12.900 5.800 12.900 12.900v32.300c0 7.100-5.800 12.900-12.900 12.900s-12.900-5.800-12.900-12.900V77.600z"
        fill="#e01e5a"
      />
      <path
        d="M45.200 25.800c-7.100 0-12.900-5.800-12.900-12.900S38.100 0 45.200 0s12.900 5.800 12.900 12.900v12.900H45.200zm0 6.500c7.100 0 12.900 5.800 12.900 12.900s-5.800 12.900-12.900 12.900H12.900C5.800 58.100 0 52.300 0 45.200s5.800-12.900 12.900-12.900h32.300z"
        fill="#36c5f0"
      />
      <path
        d="M97 45.200c0-7.100 5.800-12.900 12.900-12.900s12.900 5.800 12.900 12.900-5.800 12.900-12.900 12.900H97V45.200zm-6.500 0c0 7.100-5.800 12.900-12.900 12.900s-12.900-5.800-12.900-12.900V12.900C64.700 5.800 70.500 0 77.600 0s12.900 5.800 12.900 12.900v32.300z"
        fill="#2eb67d"
      />
      <path
        d="M77.600 97c7.100 0 12.900 5.800 12.900 12.900s-5.800 12.900-12.900 12.900-12.900-5.800-12.900-12.900V97h12.900zm0-6.500c-7.100 0-12.900-5.800-12.900-12.900s5.800-12.900 12.900-12.900h32.300c7.100 0 12.900 5.800 12.900 12.900s-5.800 12.900-12.900 12.900H77.600z"
        fill="#ecb22e"
      />
    </svg>
  );
}
