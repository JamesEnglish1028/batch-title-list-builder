function ExportPage({
  collections,
  exportCollectionId,
  onSelectExportCollection,
  onRefreshCollections,
  collectionsLoading,
  onExport,
  exportWorking,
  exportFeedUrl,
  exportPagesFetched,
  exportInProgressCount,
  exportMessage,
  exportError,
  exportCount,
  onDownloadSample,
  onGoToCreate,
  onGoToUpdate,
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="accent-title text-2xl font-semibold text-slate-900">
            Collections & Exports
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Choose a collection and download a CSV of Title, Author, and Work URN.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          onClick={onRefreshCollections}
          disabled={collectionsLoading}
        >
          Refresh collections
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm font-semibold text-slate-700">Select a collection</p>
          <div className="mt-4 grid gap-3">
            {collections.length === 0 && (
              <p className="text-sm text-slate-500">No collections loaded yet.</p>
            )}
            {collections.map((collection) => (
              <label
                key={collection.id}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                  String(exportCollectionId) === String(collection.id)
                    ? "border-blue-600 bg-white"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <span>
                  <span className="font-semibold">{collection.name}</span>
                  <span className="ml-2 text-xs text-slate-500">ID {collection.id}</span>
                </span>
                <input
                  type="radio"
                  name="export-collection"
                  className="h-4 w-4"
                  checked={String(exportCollectionId) === String(collection.id)}
                  onChange={() => onSelectExportCollection(collection.id)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-700">Export titles</p>
          <p className="mt-2 text-xs text-slate-500">
            The export pulls all titles in the selected collection and downloads a CSV.
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={onExport}
            disabled={exportWorking}
          >
            {exportWorking ? "Building CSV..." : "Download CSV"}
          </button>
          {exportFeedUrl && <p className="mt-2 text-xs text-slate-500">Feed: {exportFeedUrl}</p>}
          {exportWorking && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <p>Pages fetched: {exportPagesFetched}</p>
              <p>Entries collected: {exportInProgressCount}</p>
            </div>
          )}
          {exportMessage && (
            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                exportError
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <p>{exportMessage}</p>
              {exportCount > 0 && (
                <p className="mt-1 text-xs text-emerald-800">{exportCount} rows exported.</p>
              )}
            </div>
          )}
          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onDownloadSample}
          >
            Download sample CSV
          </button>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              onClick={onGoToCreate}
            >
              Create new list
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              onClick={onGoToUpdate}
            >
              Update existing list
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ExportPage;
