function IdentifierUploadPanel({
  convertIsbn,
  onConvertChange,
  onFileChange,
  fileName,
  parseMessage,
  identifiers,
  previewIdentifiers,
  uploadCardClassName,
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={convertIsbn}
          onChange={(event) => onConvertChange(event.target.checked)}
        />
        Auto-convert ISBNs to URNs
      </label>

      <div className={uploadCardClassName}>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={onFileChange}
          />
          <span className="rounded-full border border-slate-300 bg-white px-4 py-2">
            Upload CSV/XLSX
          </span>
          <span className="text-xs text-slate-500">
            {fileName || "No file selected yet."}
          </span>
        </label>
        {parseMessage && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            {parseMessage}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Identifier preview</p>
        {identifiers.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Upload a file to see the parsed identifiers here.
          </p>
        )}
        <ul className="mt-3 space-y-2 text-xs text-slate-600">
          {previewIdentifiers.map((id) => (
            <li
              key={id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono"
            >
              {id}
            </li>
          ))}
        </ul>
        {identifiers.length > previewIdentifiers.length && (
          <p className="mt-3 text-xs text-slate-500">
            + {identifiers.length - previewIdentifiers.length} more
          </p>
        )}
      </div>
    </>
  );
}

export default IdentifierUploadPanel;
