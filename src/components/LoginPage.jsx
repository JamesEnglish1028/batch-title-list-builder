function LoginPage({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  libraryShortName,
  onLibraryShortNameChange,
  onSubmit,
  loginWorking,
  loginError,
  loginMessage,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="accent-title text-2xl font-semibold text-slate-900">1. Sign In</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use an admin account with librarian permissions for the target library.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2 text-sm font-medium text-slate-700">
            Palace Manager base URL
            <div className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-600">
              /cm (proxied to localhost:6500)
            </div>
            <p className="text-xs text-slate-500">
              Locked to avoid CORS issues in local development.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Username or email
            <input
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="admin@example.org"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="••••••••"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Library short name
            <input
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              value={libraryShortName}
              onChange={(event) => onLibraryShortNameChange(event.target.value)}
              placeholder="lib1"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            disabled={loginWorking}
          >
            {loginWorking ? "Signing in..." : "Sign in"}
          </button>
          {loginMessage && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                loginError
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {loginMessage}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
