import CollectionChecklist from "./CollectionChecklist";
import IdentifierUploadPanel from "./IdentifierUploadPanel";

function UpdatePage({
  onBackToExports,
  onLoadLists,
  customListsLoading,
  customListsMessage,
  customListsError,
  customLists,
  selectedUpdateListId,
  onSelectUpdateList,
  collections,
  selectedCollections,
  onToggleCollection,
  convertIsbn,
  onConvertChange,
  onFileChange,
  fileName,
  parseMessage,
  identifiers,
  previewIdentifiers,
  onSubmitUpdate,
  createWorking,
  isLoggedIn,
  createMessage,
  createError,
  chunkProgress,
  createDebug,
  createNotice,
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onBackToExports}
          >
            Back to exports
          </button>
        </div>
        <h2 className="accent-title text-2xl font-semibold text-slate-900">
          Update Existing List
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Choose a list, select collections, then upload a CSV to append titles.
        </p>

        <div className="mt-6 grid gap-4">
          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onLoadLists}
            disabled={customListsLoading}
          >
            {customListsLoading ? "Loading lists..." : "Load lists"}
          </button>
          {customListsMessage && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                customListsError
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {customListsMessage}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3">
          {customLists.length === 0 && (
            <p className="text-sm text-slate-500">Load lists to choose one.</p>
          )}
          {customLists.map((list) => (
            <label
              key={list.id}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                String(selectedUpdateListId) === String(list.id)
                  ? "border-blue-600 bg-white"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <span>
                <span className="font-semibold">{list.name}</span>
                <span className="ml-2 text-xs text-slate-500">ID {list.id}</span>
              </span>
              <input
                type="radio"
                name="update-list"
                className="h-4 w-4"
                checked={String(selectedUpdateListId) === String(list.id)}
                onChange={() => onSelectUpdateList(String(list.id))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Collections and CSV</h3>
        <p className="mt-2 text-sm text-slate-600">
          Select the collections the list should be associated with, then upload a CSV to add
          titles.
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <CollectionChecklist
            collections={collections}
            selectedCollections={selectedCollections}
            onToggleCollection={onToggleCollection}
          />
        </div>

        <div className="mt-6 grid gap-4">
          <IdentifierUploadPanel
            convertIsbn={convertIsbn}
            onConvertChange={onConvertChange}
            onFileChange={onFileChange}
            fileName={fileName}
            parseMessage={parseMessage}
            identifiers={identifiers}
            previewIdentifiers={previewIdentifiers}
            uploadCardClassName="rounded-2xl border border-slate-300 bg-slate-50 p-6"
          />

          <button
            type="button"
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={onSubmitUpdate}
            disabled={
              createWorking || !isLoggedIn || identifiers.length === 0 || !selectedUpdateListId
            }
          >
            {createWorking ? "Updating list..." : "Update list"}
          </button>

          {createMessage && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                createError
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <p>{createMessage}</p>
              {chunkProgress && (
                <p className="mt-1 text-xs text-slate-500">
                  Chunks processed: {chunkProgress.completed} / {chunkProgress.total}
                </p>
              )}
              {createDebug && (
                <p className="mt-1 text-xs text-slate-500">
                  Collections submitted: {JSON.stringify(createDebug.collectionIdsPayload || [])}
                </p>
              )}
              {createNotice && !createError && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {createNotice}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default UpdatePage;
