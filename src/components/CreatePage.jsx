import CollectionChecklist from "./CollectionChecklist";
import IdentifierUploadPanel from "./IdentifierUploadPanel";

function CreatePage({
  onBackToExports,
  collections,
  selectedCollections,
  onToggleCollection,
  listName,
  onListNameChange,
  convertIsbn,
  onConvertChange,
  onFileChange,
  fileName,
  parseMessage,
  identifiers,
  previewIdentifiers,
  validationIssues,
  onSubmitCreate,
  createWorking,
  isLoggedIn,
  listExistsError,
  onSubmitAddExisting,
  existingListId,
  onExistingListIdChange,
  createMessage,
  createError,
  chunkProgress,
  createDebug,
  createNotice,
  createdListId,
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onBackToExports}
          >
            Back to exports
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="accent-title text-2xl font-semibold text-slate-900">Create List</h2>
        <p className="mt-2 text-sm text-slate-600">
          Give the list a name, then send the identifiers to Palace Manager.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <CollectionChecklist
            collections={collections}
            selectedCollections={selectedCollections}
            onToggleCollection={onToggleCollection}
          />
        </div>

        <form className="mt-6 grid gap-4" onSubmit={onSubmitCreate}>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            List name
            <input
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              value={listName}
              onChange={(event) => onListNameChange(event.target.value)}
              placeholder="Spring Staff Picks"
            />
          </label>

          {listName.trim() ? (
            <>
              <IdentifierUploadPanel
                convertIsbn={convertIsbn}
                onConvertChange={onConvertChange}
                onFileChange={onFileChange}
                fileName={fileName}
                parseMessage={parseMessage}
                identifiers={identifiers}
                previewIdentifiers={previewIdentifiers}
                uploadCardClassName="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6"
              />

              {validationIssues && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                  <p>Invalid identifiers: {validationIssues.invalidCount}</p>
                  <p>Sample invalid: {validationIssues.invalid.join(", ")}</p>
                  {validationIssues.duplicateCount > 0 && (
                    <p>Duplicate identifiers removed: {validationIssues.duplicateCount}</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                disabled={createWorking || !isLoggedIn || identifiers.length === 0}
              >
                {createWorking ? "Creating list..." : "Create custom list"}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-500">Enter a list name to upload a CSV.</p>
          )}
        </form>

        {listExistsError && (
          <form
            className="mt-6 grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
            onSubmit={onSubmitAddExisting}
          >
            <p className="text-sm font-semibold text-amber-900">
              List already exists. Add titles to it:
            </p>
            <label className="grid gap-2 text-sm font-medium text-amber-900">
              Existing list ID
              <input
                className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                value={existingListId}
                onChange={(event) => onExistingListIdChange(event.target.value)}
                placeholder="14"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
              disabled={createWorking || !isLoggedIn || identifiers.length === 0}
            >
              {createWorking ? "Adding titles..." : "Add titles to existing list"}
            </button>
          </form>
        )}

        {createMessage && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
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
            {createError && createDebug && (
              <div className="mt-2 text-xs text-rose-800">
                <p>Entries sent: {createDebug.count}</p>
                <p>Sample URNs: {createDebug.sample.join(", ")}</p>
                <p>
                  Collection IDs sent: {JSON.stringify(createDebug.collectionIdsPayload || [])}
                </p>
                {createDebug.collectionFallbackApplied && (
                  <p>Collection fallback applied: retried with []</p>
                )}
              </div>
            )}
            {createdListId && (
              <p className="mt-1 text-xs text-emerald-800">New list ID: {createdListId}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default CreatePage;
