function CollectionChecklist({ collections, selectedCollections, onToggleCollection }) {
  return (
    <>
      <p className="text-sm font-semibold text-slate-700">
        Choose collections for the list
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {collections.map((collection) => (
          <label
            key={collection.id}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              checked={selectedCollections.includes(collection.id)}
              onChange={() => onToggleCollection(collection.id)}
            />
            <span className="flex flex-col">
              <span className="font-semibold">{collection.name}</span>
              <span className="text-xs text-slate-500">
                ID {collection.id} · {collection.protocol}
              </span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

export default CollectionChecklist;
