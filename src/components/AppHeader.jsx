function AppHeader({ adminEmail, onLogout, logoutWorking }) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            <img src="/palace-logo.png" alt="Palace logo" className="h-8 w-8" />
            <span>Palace Manager Tooling</span>
          </div>
          <h1 className="accent-title mt-3 text-4xl font-semibold text-slate-900 md:text-5xl">
            Batch Title List Builder
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">
            Upload a spreadsheet of titles and IDs to create or update Palace Manager
            custom lists.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
          <p className="font-semibold">Default connection</p>
          <p className="mt-1">`/cm` (proxied to localhost:6500)</p>
          <p className="mt-1">`/public` (proxied to localhost:6500)</p>
          {adminEmail && (
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>Signed in as {adminEmail}</span>
              <button
                type="button"
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                onClick={onLogout}
                disabled={logoutWorking}
              >
                {logoutWorking ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
