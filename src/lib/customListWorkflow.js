const postForm = async ({ url, csrfToken, payload }) => {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRF-Token": csrfToken,
    },
    credentials: "include",
    body: payload.toString(),
  });
};

export const shouldRetryWithoutCollections = (message) => {
  const lowered = String(message || "").toLowerCase();
  return (
    lowered.includes("specified collection does not exist") ||
    lowered.includes("collection does not exist")
  );
};

export const isCustomListAlreadyExistsError = (message) => {
  return String(message || "").toLowerCase().includes("already has a custom list");
};

export const parseApiErrorMessage = async (response, fallbackPrefix) => {
  let errorMessage = `${fallbackPrefix} with ${response.status}`;
  const contentType = response.headers.get("content-type") || "";

  if (
    contentType.includes("application/json") ||
    contentType.includes("application/api-problem+json")
  ) {
    const json = await response.json();
    errorMessage = json.detail || json.title || errorMessage;
  } else {
    const text = await response.text();
    if (text) {
      errorMessage = `${errorMessage}. ${text.slice(0, 300)}`.trim();
    }
  }

  return errorMessage;
};

export const createCustomListWithFallback = async ({
  apiBase,
  csrfToken,
  name,
  collections,
}) => {
  let activeCollections = [...collections];

  const submitCreate = async (collectionsForRequest) => {
    const createPayload = new URLSearchParams();
    createPayload.set("name", name);
    createPayload.set("entries", JSON.stringify([]));
    createPayload.set("collections", JSON.stringify(collectionsForRequest));

    const response = await postForm({
      url: `${apiBase}/admin/custom_lists`,
      csrfToken,
      payload: createPayload,
    });

    if (!response.ok) {
      const errorMessage = await parseApiErrorMessage(
        response,
        "Create list failed"
      );
      throw new Error(errorMessage);
    }

    return response.text();
  };

  try {
    const listId = await submitCreate(activeCollections);
    return { listId, collectionIds: activeCollections, fallbackApplied: false };
  } catch (error) {
    if (activeCollections.length > 0 && shouldRetryWithoutCollections(error.message)) {
      activeCollections = [];
      const listId = await submitCreate(activeCollections);
      return { listId, collectionIds: activeCollections, fallbackApplied: true };
    }
    throw error;
  }
};

export const updateCustomListChunkWithFallback = async ({
  apiBase,
  csrfToken,
  listId,
  name,
  entries,
  deletedEntries = [],
  collections,
  errorPrefix,
  includeId = true,
}) => {
  let activeCollections = [...collections];

  const submitUpdate = async (collectionsForRequest) => {
    const updatePayload = new URLSearchParams();
    if (includeId) {
      updatePayload.set("id", String(listId));
    }
    updatePayload.set("name", name);
    updatePayload.set("entries", JSON.stringify(entries));
    updatePayload.set("deletedEntries", JSON.stringify(deletedEntries));
    updatePayload.set("collections", JSON.stringify(collectionsForRequest));

    return postForm({
      url: `${apiBase}/admin/custom_list/${listId}`,
      csrfToken,
      payload: updatePayload,
    });
  };

  const response = await submitUpdate(activeCollections);
  if (response.ok) {
    return { collectionIds: activeCollections, fallbackApplied: false };
  }

  const errorMessage = await parseApiErrorMessage(response, errorPrefix);
  if (activeCollections.length > 0 && shouldRetryWithoutCollections(errorMessage)) {
    activeCollections = [];
    const retryResponse = await submitUpdate(activeCollections);
    if (!retryResponse.ok) {
      throw new Error(errorMessage);
    }
    return { collectionIds: activeCollections, fallbackApplied: true };
  }

  throw new Error(errorMessage);
};

export const buildEntriesPayload = ({ identifiers, normalizeIdentifier, isValid }) => {
  const normalized = identifiers.map((value) => normalizeIdentifier(value).trim());

  const duplicates = [];
  const seen = new Set();
  const unique = [];

  normalized.forEach((value) => {
    if (!value) return;
    if (seen.has(value)) {
      duplicates.push(value);
      return;
    }
    seen.add(value);
    unique.push(value);
  });

  const invalid = unique.filter((value) => !isValid(value));

  return {
    entriesPayload: unique.map((id) => ({ id })),
    invalid,
    duplicates,
  };
};
