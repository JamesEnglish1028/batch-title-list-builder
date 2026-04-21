import { useMemo, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";

const DEFAULT_BASE_URL = "/cm";
const DEFAULT_FEED_BASE = "/public";
const IDENTIFIER_COLUMNS = [
  "identifier",
  "id",
  "urn",
  "isbn",
  "identifier_urn",
  "work_id",
  "workid",
  "primary_identifier",
];

const STATUS_IDLE = "idle";
const STATUS_WORKING = "working";
const STATUS_SUCCESS = "success";
const STATUS_ERROR = "error";

const PAGE_LOGIN = "login";
const PAGE_EXPORT = "export";
const PAGE_CREATE = "create";
const PAGE_UPDATE = "update";

const CHUNK_SIZE = 10;

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isTruthy = (value) => value !== null && value !== undefined && value !== "";

const extractCsrfToken = (html) => {
  if (!html) return "";
  const match = html.match(/csrfToken:\s*"([^"]+)"/);
  return match ? match[1] : "";
};

const cleanIsbn = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");

const looksLikeIsbn = (value) => {
  const cleaned = cleanIsbn(value);
  if (cleaned.length === 10) {
    return /^[0-9]{9}[0-9X]$/.test(cleaned);
  }
  if (cleaned.length === 13) {
    return /^[0-9]{13}$/.test(cleaned);
  }
  return false;
};

const maybeUrnifyIsbn = (value, enable) => {
  if (!enable) return value;
  if (looksLikeIsbn(value)) {
    return `urn:isbn:${cleanIsbn(value)}`;
  }
  return value;
};

const normalizeDoi = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed;
};

const uniqueNonEmpty = (values) => {
  const seen = new Set();
  const cleaned = [];
  values.forEach((value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    cleaned.push(trimmed);
  });
  return cleaned;
};

const isLikelyIdentifier = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("urn:")) return true;
  if (/^https?:\/\/(dx\.)?doi\.org\/.+/i.test(trimmed)) return true;
  if (
    trimmed.startsWith("http://www.gutenberg.org/ebooks/") ||
    trimmed.startsWith("https://www.gutenberg.org/ebooks/")
  ) {
    return true;
  }
  return false;
};

const chunkArray = (values, size) => {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
};

const toPositiveInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
};

const resolveCollectionApiId = (collection) => {
  const candidates = [
    collection?.collection_id,
    collection?.collectionId,
    collection?.collection?.id,
    collection?.settings?.collection_id,
    collection?.settings?.collectionId,
    collection?.id,
  ];

  for (const candidate of candidates) {
    const parsed = toPositiveInteger(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

const resolveSelectedCollectionApiIds = (allCollections, selectedUiIds) => {
  const selectedSet = new Set(selectedUiIds.map((value) => String(value)));
  const resolved = [];

  allCollections.forEach((collection) => {
    if (!selectedSet.has(String(collection.id))) return;
    const apiId = resolveCollectionApiId(collection);
    if (apiId !== null) {
      resolved.push(apiId);
    }
  });

  return Array.from(new Set(resolved));
};

const shouldRetryWithoutCollections = (message) => {
  const lowered = String(message || "").toLowerCase();
  return (
    lowered.includes("specified collection does not exist") ||
    lowered.includes("collection does not exist")
  );
};

const DEFAULT_REDIRECT = "/admin/web";

function App() {
  const baseUrl = DEFAULT_BASE_URL;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [libraryShortName, setLibraryShortName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [loginStatus, setLoginStatus] = useState(STATUS_IDLE);
  const [loginMessage, setLoginMessage] = useState("");
  const [page, setPage] = useState(PAGE_LOGIN);

  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [collectionsStatus, setCollectionsStatus] = useState(STATUS_IDLE);
  const [, setCollectionsMessage] = useState("");
  const [customLists, setCustomLists] = useState([]);
  const [customListsStatus, setCustomListsStatus] = useState(STATUS_IDLE);
  const [customListsMessage, setCustomListsMessage] = useState("");
  const [selectedUpdateListId, setSelectedUpdateListId] = useState("");

  const [listName, setListName] = useState("");
  const [identifiers, setIdentifiers] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [convertIsbn, setConvertIsbn] = useState(false);

  const [exportCollectionId, setExportCollectionId] = useState("");
  const [exportStatus, setExportStatus] = useState(STATUS_IDLE);
  const [exportMessage, setExportMessage] = useState("");
  const [exportCount, setExportCount] = useState(0);
  const [exportPagesFetched, setExportPagesFetched] = useState(0);
  const [exportInProgressCount, setExportInProgressCount] = useState(0);
  const [exportFeedUrl, setExportFeedUrl] = useState("");

  const [createStatus, setCreateStatus] = useState(STATUS_IDLE);
  const [createMessage, setCreateMessage] = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [createdListId, setCreatedListId] = useState("");
  const [createDebug, setCreateDebug] = useState(null);
  const [validationIssues, setValidationIssues] = useState(null);
  const [chunkProgress, setChunkProgress] = useState(null);
  const [existingListId, setExistingListId] = useState("");
  const [listExistsError, setListExistsError] = useState(false);
  const [logoutStatus, setLogoutStatus] = useState(STATUS_IDLE);

  const apiBase = baseUrl.replace(/\/$/, "");
  const feedBase = DEFAULT_FEED_BASE.replace(/\/$/, "");
  const isLoggedIn = Boolean(csrfToken);

  const previewIdentifiers = useMemo(() => identifiers.slice(0, 8), [identifiers]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginStatus(STATUS_WORKING);
    setLoginMessage("");
    setCsrfToken("");

    try {
      const payload = new URLSearchParams();
      payload.set("email", email);
      payload.set("password", password);
      payload.set("redirect", DEFAULT_REDIRECT);

      if (!libraryShortName.trim()) {
        throw new Error("Please provide the library short name.");
      }

      const response = await fetch(`${apiBase}/admin/sign_in_with_password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        credentials: "include",
        redirect: "manual",
        body: payload.toString(),
      });

      if (!response.ok && response.status !== 302 && response.status !== 0) {
        throw new Error(`Login failed with ${response.status}`);
      }

      const adminViewResponse = await fetch(
        `${apiBase}/admin/web/collection/${encodeURIComponent(
          libraryShortName.trim()
        )}`,
        {
          method: "GET",
          credentials: "include",
        }
      );
      if (!adminViewResponse.ok) {
        throw new Error(
          `Unable to load admin view for library '${libraryShortName}'.`
        );
      }
      const adminHtml = await adminViewResponse.text();
      const token = extractCsrfToken(adminHtml);
      if (!token) {
        throw new Error(
          "Logged in, but no CSRF token was found in /admin/web. Check server settings."
        );
      }

      setCsrfToken(token);
      setAdminEmail(email);
      setLoginStatus(STATUS_SUCCESS);
      setLoginMessage("Signed in. CSRF token loaded.");
      await handleFetchCollections(token);
      setPage(PAGE_EXPORT);
    } catch (error) {
      setLoginStatus(STATUS_ERROR);
      setLoginMessage(error.message || "Login failed.");
    }
  };

  const handleFetchCollections = async (tokenOverride) => {
    setCollectionsStatus(STATUS_WORKING);
    setCollectionsMessage("");

    try {
      const token = tokenOverride || csrfToken;
      const response = await fetch(`${apiBase}/admin/collections`, {
        method: "GET",
        headers: {
          "X-CSRF-Token": token,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Collections request failed with ${response.status}`);
      }

      const data = await response.json();
      const nextCollections = (data.collections || []).map((collection, index) => {
        const fallbackId = `collection-${index + 1}`;
        return {
          ...collection,
          id: String(collection.id ?? collection.collection_id ?? fallbackId),
          apiId: resolveCollectionApiId(collection),
          name: collection.name || "Unnamed collection",
          protocol: collection.protocol || "unknown",
          libraries: collection.libraries || [],
        };
      });

      setCollections(nextCollections);
      if (!exportCollectionId && nextCollections.length > 0) {
        setExportCollectionId(nextCollections[0].id);
      }
      setCollectionsStatus(STATUS_SUCCESS);
      setCollectionsMessage(`Loaded ${nextCollections.length} collections.`);
    } catch (error) {
      setCollectionsStatus(STATUS_ERROR);
      setCollectionsMessage(error.message || "Unable to load collections.");
    }
  };

  const handleFetchCustomLists = async (tokenOverride) => {
    setCustomListsStatus(STATUS_WORKING);
    setCustomListsMessage("");

    try {
      const token = tokenOverride || csrfToken;
      const response = await fetch(`${apiBase}/admin/custom_lists`, {
        method: "GET",
        headers: {
          "X-CSRF-Token": token,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Lists request failed with ${response.status}`);
      }

      const data = await response.json();
      const lists = data.custom_lists || [];
      setCustomLists(lists);
      if (!selectedUpdateListId && lists.length > 0) {
        setSelectedUpdateListId(String(lists[0].id));
      }
      setCustomListsStatus(STATUS_SUCCESS);
      setCustomListsMessage(`Loaded ${lists.length} lists.`);
    } catch (error) {
      setCustomListsStatus(STATUS_ERROR);
      setCustomListsMessage(error.message || "Unable to load lists.");
    }
  };

  const handleLogout = async () => {
    setLogoutStatus(STATUS_WORKING);
    try {
      await fetch(`${apiBase}/admin/sign_out`, {
        method: "GET",
        credentials: "include",
      });
    } catch {
      // ignore network errors; still clear local state
    }

    setCsrfToken("");
    setAdminEmail("");
    setCollections([]);
    setSelectedCollections([]);
    setExportCollectionId("");
    setIdentifiers([]);
    setFileName("");
    setParseMessage("");
    setCreateMessage("");
    setCreateNotice("");
    setCreatedListId("");
    setCreateDebug(null);
    setPage(PAGE_LOGIN);
    setLogoutStatus(STATUS_SUCCESS);
  };

  const normalizeFeedUrl = (href, base) => {
    if (!href) return "";
    if (href.startsWith(base)) return href;
    if (href.startsWith("/")) return `${base}${href}`;
    try {
      const parsed = new URL(href);
      return `${base}${parsed.pathname}${parsed.search}`;
    } catch {
      return href;
    }
  };

  const extractWorkId = (rawId) => {
    if (!rawId) return "";
    const trimmed = rawId.trim();
    if (trimmed.startsWith("urn:")) return trimmed;
    const match = trimmed.match(/\/works\/(.+)$/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return trimmed;
  };

  const parseOpds2Publication = (publication) => {
    const metadata = publication?.metadata || {};
    const title = metadata.title || "";
    const authors =
      Array.isArray(metadata.author) && metadata.author.length > 0
        ? metadata.author
            .map((author) => author?.name || author)
            .filter(Boolean)
            .join("; ")
        : "";
    const identifier = metadata.identifier || "";

    let urn = "";
    if (typeof identifier === "string") {
      urn = identifier;
    } else if (Array.isArray(identifier) && identifier.length > 0) {
      const idValue = identifier.find((item) => typeof item === "string") || "";
      urn = idValue;
    } else if (publication?.links?.length) {
      const workLink = publication.links.find((link) =>
        (link.rel || "").includes("self")
      );
      if (workLink?.href) {
        urn = extractWorkId(workLink.href);
      }
    }

    return {
      title,
      author: authors,
      urn: extractWorkId(urn),
    };
  };

  const parseOpds2Feed = (data) => {
    const publications = Array.isArray(data?.publications)
      ? data.publications
      : [];
    const items = publications.map(parseOpds2Publication);
    const nextLink =
      Array.isArray(data?.links) &&
      data.links.find((link) => (link.rel || "").includes("next"));
    return { items, nextHref: nextLink?.href || "" };
  };

  const normalizeName = (value) =>
    String(value || "").trim().toLowerCase();

  const collectOpdsLinks = (data) => {
    const links = [];
    if (Array.isArray(data?.links)) {
      links.push(...data.links);
    }
    if (Array.isArray(data?.navigation)) {
      links.push(...data.navigation);
    }
    if (Array.isArray(data?.groups)) {
      data.groups.forEach((group) => {
        const groupTitle = group?.metadata?.title || group?.metadata?.name || "";
        if (Array.isArray(group?.links)) {
          group.links.forEach((link) => {
            links.push({
              ...link,
              title: link?.title || groupTitle,
            });
          });
        }
      });
    }
    if (Array.isArray(data?.facets)) {
      data.facets.forEach((facet) => {
        if (Array.isArray(facet?.links)) {
          links.push(...facet.links);
        }
      });
    }
    return links;
  };

  const resolveCollectionFeedUrl = async (collectionName) => {
    const libraryPath = `/${encodeURIComponent(libraryShortName.trim())}/crawlable`;
    const libraryUrl = encodeURI(normalizeFeedUrl(libraryPath, feedBase));
    const response = await fetch(libraryUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/opds+json, application/json",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Library feed request failed with ${response.status}.`
      );
    }
    const data = await response.json();
    const links = collectOpdsLinks(data);
    const targetName = normalizeName(collectionName);
    const candidates = links.filter((link) => {
      const title = normalizeName(link?.title || link?.metadata?.title || "");
      const href = String(link?.href || "");
      return (
        title === targetName ||
        (title && targetName && title.includes(targetName)) ||
        href.includes("/collections/")
      );
    });
    const best =
      candidates.find((link) =>
        normalizeName(link?.title || "") === targetName
      ) || candidates[0];
    if (!best?.href) {
      throw new Error(
        "Could not find a collection feed link in the library OPDS feed."
      );
    }
    return encodeURI(normalizeFeedUrl(best.href, feedBase));
  };

  const fetchOpdsEntries = async (feedUrl, accumulator = []) => {
    const response = await fetch(feedUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/opds+json, application/json, application/atom+xml",
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      const snippet = errorText ? errorText.slice(0, 300) : "";
      throw new Error(
        `Feed request failed with ${response.status}. ${snippet}`.trim()
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      const data = await response.json();
      const { items, nextHref } = parseOpds2Feed(data);
      items.forEach((item) => accumulator.push(item));
      setExportPagesFetched((prev) => prev + 1);
      setExportInProgressCount(accumulator.length);

      if (nextHref) {
        const nextUrl = normalizeFeedUrl(nextHref, feedBase);
        return fetchOpdsEntries(nextUrl, accumulator);
      }
      return accumulator;
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    const entries = Array.from(doc.getElementsByTagName("entry"));
    entries.forEach((entry) => {
      const titleEl = entry.getElementsByTagName("title")[0];
      const idEl = entry.getElementsByTagName("id")[0];
      const authorEls = Array.from(entry.getElementsByTagName("author"));
      const authorNames = authorEls
        .map((author) => author.getElementsByTagName("name")[0])
        .filter(Boolean)
        .map((nameEl) => nameEl.textContent || "")
        .filter(Boolean);

      accumulator.push({
        title: titleEl?.textContent || "",
        author: authorNames.join("; "),
        urn: extractWorkId(idEl?.textContent || ""),
      });
    });
    setExportPagesFetched((prev) => prev + 1);
    setExportInProgressCount(accumulator.length);

    const nextLink = Array.from(doc.getElementsByTagName("link")).find((link) =>
      link.getAttribute("rel")?.includes("next")
    );
    const nextHref = nextLink?.getAttribute("href");
    if (nextHref) {
      const nextUrl = normalizeFeedUrl(nextHref, feedBase);
      return fetchOpdsEntries(nextUrl, accumulator);
    }
    return accumulator;
  };

  const handleExport = async () => {
    setExportStatus(STATUS_WORKING);
    setExportMessage("");
    setExportCount(0);
    setExportPagesFetched(0);
    setExportInProgressCount(0);
    setExportFeedUrl("");

    try {
      const collection = collections.find(
        (item) => String(item.id) === String(exportCollectionId)
      );
      if (!collection) {
        throw new Error("Select a collection to export.");
      }

      const feedPath = `/collections/${encodeURIComponent(
        collection.name
      )}/crawlable`;
      const feedUrl = normalizeFeedUrl(feedPath, feedBase);
      const safeFeedUrl = encodeURI(feedUrl);
      setExportFeedUrl(safeFeedUrl);
      let entries = [];
      try {
        entries = await fetchOpdsEntries(safeFeedUrl, []);
      } catch {
        const resolvedUrl = await resolveCollectionFeedUrl(collection.name);
        setExportFeedUrl(resolvedUrl);
        entries = await fetchOpdsEntries(resolvedUrl, []);
      }
      setExportCount(entries.length);

      const header = ["Title", "Author", "URN"];
      const rows = entries.map((entry) => [
        entry.title,
        entry.author,
        entry.urn,
      ]);
      const csv =
        [header, ...rows]
          .map((row) =>
            row
              .map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`)
              .join(",")
          )
          .join("\n") + "\n";

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${collection.name}-titles.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setExportStatus(STATUS_SUCCESS);
      setExportMessage(
        `Exported ${entries.length} titles from ${collection.name}.`
      );
    } catch (error) {
      setExportStatus(STATUS_ERROR);
      const message = error.message ? `Export failed. ${error.message}` : "Export failed.";
      setExportMessage(message);
    }
  };

  const handleDownloadSample = () => {
    const header = ["Title", "Author", "URN"];
    const rows = [
      ["Sample Book One", "Ada Lovelace", "urn:isbn:9781234567897"],
      ["Sample Book Two", "Octavia Butler", "urn:uuid:04377e87-ab69-41c8-a2a4-812d55dc0952"],
    ];
    const csv =
      [header, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "palace-list-sample.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const toggleCollection = (collectionId) => {
    setSelectedCollections((current) => {
      if (current.includes(collectionId)) {
        return current.filter((id) => id !== collectionId);
      }
      return [...current, collectionId];
    });
  };

  const parseIdentifiersFromRows = (rows, headers) => {
    const normalizedHeaders = headers.map(normalizeHeader);
    const headerIndex = normalizedHeaders.findIndex((header) =>
      IDENTIFIER_COLUMNS.includes(header)
    );

    const useIndex = headerIndex === -1 ? 0 : headerIndex;
    return rows
      .map((row) => (Array.isArray(row) ? row[useIndex] : row))
      .filter(isTruthy);
  };

  const parseCsv = async (file) => {
    const text = await file.text();
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
      throw new Error(parsed.errors[0].message || "CSV parse error");
    }

    const rawFields = parsed.meta?.fields || [];
    const headers = rawFields.map(normalizeHeader);
    const rows = parsed.data || [];

    if (!rawFields.length) {
      const fallback = Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
      });
      return parseIdentifiersFromRows(fallback.data || [], ["value"]);
    }

    const headerIndex = headers.findIndex((header) =>
      IDENTIFIER_COLUMNS.includes(header)
    );
    const idColumn =
      headerIndex === -1 ? rawFields[0] : rawFields[headerIndex];
    return rows.map((row) => row[idColumn]).filter(isTruthy);
  };

  const parseXlsx = async (file) => {
    const rows = await readXlsxFile(file);

    if (!rows.length) return [];
    const headers = rows[0].map(normalizeHeader);
    const hasHeader = headers.some((header) =>
      IDENTIFIER_COLUMNS.includes(header)
    );

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const headerRow = hasHeader ? headers : ["value"];
    return parseIdentifiersFromRows(dataRows, headerRow);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseMessage("");
    setFileName(file.name);

    try {
      let values = [];
      if (file.name.endsWith(".csv")) {
        values = await parseCsv(file);
      } else if (file.name.endsWith(".xlsx")) {
        values = await parseXlsx(file);
      } else {
        throw new Error("Unsupported file type. Use CSV or XLSX.");
      }

      const cleaned = uniqueNonEmpty(
        values.map((value) => maybeUrnifyIsbn(value, convertIsbn))
      );
      setIdentifiers(cleaned);
      setParseMessage(`Loaded ${cleaned.length} identifiers.`);
    } catch (error) {
      setIdentifiers([]);
      setParseMessage(error.message || "Unable to parse file.");
    }
  };

  const handleCreateList = async (event) => {
    event.preventDefault();
    setCreateStatus(STATUS_WORKING);
    setCreateMessage("");
    setCreateNotice("");
    setCreatedListId("");
    setValidationIssues(null);
    setChunkProgress(null);
    setListExistsError(false);

    try {
      if (!listName.trim()) {
        throw new Error("Please enter a list name.");
      }
      if (!selectedCollections.length) {
        throw new Error("Select at least one collection.");
      }

      if (!identifiers.length) {
        throw new Error("Upload a CSV with identifiers before creating the list.");
      }

      const trimmedIds = identifiers.map((id) =>
        normalizeDoi(maybeUrnifyIsbn(id, convertIsbn)).trim()
      );
      const duplicates = [];
      const seen = new Set();
      const uniqueIds = [];
      trimmedIds.forEach((id) => {
        if (!id) return;
        if (seen.has(id)) {
          duplicates.push(id);
          return;
        }
        seen.add(id);
        uniqueIds.push(id);
      });

      const invalidIds = uniqueIds.filter((id) => !isLikelyIdentifier(id));
      if (invalidIds.length > 0) {
        setValidationIssues({
          invalid: invalidIds.slice(0, 5),
          invalidCount: invalidIds.length,
          duplicateCount: duplicates.length,
        });
        throw new Error(
          "Some identifiers are invalid. Fix them or remove them before creating the list."
        );
      }

      const entriesPayload = uniqueIds.map((id) => ({ id }));
      const collectionIdsPayload = resolveSelectedCollectionApiIds(
        collections,
        selectedCollections
      );
      let activeCollectionIdsPayload = collectionIdsPayload;
      setCreateDebug({
        count: entriesPayload.length,
        sample: entriesPayload.slice(0, 5).map((item) => item.id),
        selectedCollections,
        collectionIdsPayload: activeCollectionIdsPayload,
      });

      const submitCreate = async (collectionsForRequest) => {
        const createPayload = new URLSearchParams();
        createPayload.set("name", listName.trim());
        createPayload.set("entries", JSON.stringify([]));
        createPayload.set("collections", JSON.stringify(collectionsForRequest));

        const response = await fetch(`${apiBase}/admin/custom_lists`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: createPayload.toString(),
        });

        if (!response.ok) {
          let errorMessage = `Create list failed with ${response.status}`;
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
          if (errorMessage.toLowerCase().includes("already has a custom list")) {
            setListExistsError(true);
          }
          throw new Error(errorMessage);
        }

        return response.text();
      };

      let listId = "";
      try {
        listId = await submitCreate(activeCollectionIdsPayload);
      } catch (createError) {
        if (
          activeCollectionIdsPayload.length > 0 &&
          shouldRetryWithoutCollections(createError.message)
        ) {
          activeCollectionIdsPayload = [];
          setCreateDebug((current) =>
            current
              ? {
                  ...current,
                  collectionIdsPayload: activeCollectionIdsPayload,
                  collectionFallbackApplied: true,
                }
              : current
          );
          setCreateNotice(
            "Selected collection IDs were not accepted by Palace. Retried with no explicit collection mapping."
          );
          listId = await submitCreate(activeCollectionIdsPayload);
        } else {
          throw createError;
        }
      }

      setCreatedListId(listId);

      const chunks = chunkArray(entriesPayload, CHUNK_SIZE);
      setChunkProgress({ total: chunks.length, completed: 0 });
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const updatePayload = new URLSearchParams();
        updatePayload.set("name", listName.trim());
        updatePayload.set("entries", JSON.stringify(chunk));
        updatePayload.set("collections", JSON.stringify(activeCollectionIdsPayload));

        const updateResponse = await fetch(
          `${apiBase}/admin/custom_list/${listId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRF-Token": csrfToken,
            },
            credentials: "include",
            body: updatePayload.toString(),
          }
        );

        if (!updateResponse.ok) {
          let errorMessage = `Add titles failed with ${updateResponse.status}`;
          const contentType = updateResponse.headers.get("content-type") || "";
          if (
            contentType.includes("application/json") ||
            contentType.includes("application/api-problem+json")
          ) {
            const json = await updateResponse.json();
            errorMessage = json.detail || json.title || errorMessage;
          } else {
            const text = await updateResponse.text();
            if (text) {
              errorMessage = `${errorMessage}. ${text.slice(0, 300)}`.trim();
            }
          }
          throw new Error(errorMessage);
        }

        setChunkProgress({ total: chunks.length, completed: i + 1 });
      }

      setCreateStatus(STATUS_SUCCESS);
      setCreateMessage(
        `Created list ${listId} with ${entriesPayload.length} titles.`
      );
    } catch (error) {
      setCreateStatus(STATUS_ERROR);
      setCreateMessage(error.message || "Unable to create list.");
    }
  };

  const handleAddToExistingList = async (event) => {
    event.preventDefault();
    setCreateStatus(STATUS_WORKING);
    setCreateMessage("");
    setCreateNotice("");
    setChunkProgress(null);

    try {
      if (!existingListId.trim()) {
        throw new Error("Enter the existing list ID.");
      }
      if (!identifiers.length) {
        throw new Error("Upload a CSV with identifiers before updating the list.");
      }

      const trimmedIds = identifiers.map((id) =>
        normalizeDoi(maybeUrnifyIsbn(id, convertIsbn)).trim()
      );
      const duplicates = [];
      const seen = new Set();
      const uniqueIds = [];
      trimmedIds.forEach((id) => {
        if (!id) return;
        if (seen.has(id)) {
          duplicates.push(id);
          return;
        }
        seen.add(id);
        uniqueIds.push(id);
      });

      const invalidIds = uniqueIds.filter((id) => !isLikelyIdentifier(id));
      if (invalidIds.length > 0) {
        setValidationIssues({
          invalid: invalidIds.slice(0, 5),
          invalidCount: invalidIds.length,
          duplicateCount: duplicates.length,
        });
        throw new Error(
          "Some identifiers are invalid. Fix them or remove them before updating the list."
        );
      }

      const entriesPayload = uniqueIds.map((id) => ({ id }));
      const collectionIdsPayload = resolveSelectedCollectionApiIds(
        collections,
        selectedCollections
      );
      let activeCollectionIdsPayload = collectionIdsPayload;
      setCreateDebug({
        count: entriesPayload.length,
        sample: entriesPayload.slice(0, 5).map((item) => item.id),
        selectedCollections,
        collectionIdsPayload: activeCollectionIdsPayload,
      });

      const chunks = chunkArray(entriesPayload, CHUNK_SIZE);
      setChunkProgress({ total: chunks.length, completed: 0 });

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const updatePayload = new URLSearchParams();
        updatePayload.set("id", existingListId.trim());
        updatePayload.set("name", listName.trim());
        updatePayload.set("entries", JSON.stringify(chunk));
        updatePayload.set("deletedEntries", JSON.stringify([]));
        updatePayload.set("collections", JSON.stringify(activeCollectionIdsPayload));

        const updateResponse = await fetch(
          `${apiBase}/admin/custom_list/${existingListId.trim()}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRF-Token": csrfToken,
            },
            credentials: "include",
            body: updatePayload.toString(),
          }
        );

        if (!updateResponse.ok) {
          let errorMessage = `Add titles failed with ${updateResponse.status}`;
          const contentType = updateResponse.headers.get("content-type") || "";
          if (
            contentType.includes("application/json") ||
            contentType.includes("application/api-problem+json")
          ) {
            const json = await updateResponse.json();
            errorMessage = json.detail || json.title || errorMessage;
          } else {
            const text = await updateResponse.text();
            if (text) {
              errorMessage = `${errorMessage}. ${text.slice(0, 300)}`.trim();
            }
          }
          if (
            activeCollectionIdsPayload.length > 0 &&
            shouldRetryWithoutCollections(errorMessage)
          ) {
            activeCollectionIdsPayload = [];
            setCreateDebug((current) =>
              current
                ? {
                    ...current,
                    collectionIdsPayload: activeCollectionIdsPayload,
                    collectionFallbackApplied: true,
                  }
                : current
            );
            setCreateNotice(
              "Selected collection IDs were not accepted by Palace. Retried with no explicit collection mapping."
            );

            const retryPayload = new URLSearchParams();
            retryPayload.set("id", existingListId.trim());
            retryPayload.set("name", listName.trim());
            retryPayload.set("entries", JSON.stringify(chunk));
            retryPayload.set("deletedEntries", JSON.stringify([]));
            retryPayload.set("collections", JSON.stringify(activeCollectionIdsPayload));

            const retryResponse = await fetch(
              `${apiBase}/admin/custom_list/${existingListId.trim()}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "X-CSRF-Token": csrfToken,
                },
                credentials: "include",
                body: retryPayload.toString(),
              }
            );

            if (!retryResponse.ok) {
              throw new Error(errorMessage);
            }
          } else {
            throw new Error(errorMessage);
          }
        }

        setChunkProgress({ total: chunks.length, completed: i + 1 });
      }

      setCreateStatus(STATUS_SUCCESS);
      setCreateMessage(
        `Added ${entriesPayload.length} titles to list ${existingListId.trim()}.`
      );
    } catch (error) {
      setCreateStatus(STATUS_ERROR);
      setCreateMessage(error.message || "Unable to update list.");
    }
  };

  const handleUpdateListSubmit = async (event) => {
    event.preventDefault();
    setCreateStatus(STATUS_WORKING);
    setCreateMessage("");
    setCreateNotice("");
    setChunkProgress(null);

    try {
      if (!selectedUpdateListId) {
        throw new Error("Select a list to update.");
      }
      if (!selectedCollections.length) {
        throw new Error("Select at least one collection.");
      }
      if (!identifiers.length) {
        throw new Error("Upload a CSV with identifiers before updating the list.");
      }

      const trimmedIds = identifiers.map((id) =>
        normalizeDoi(maybeUrnifyIsbn(id, convertIsbn)).trim()
      );
      const duplicates = [];
      const seen = new Set();
      const uniqueIds = [];
      trimmedIds.forEach((id) => {
        if (!id) return;
        if (seen.has(id)) {
          duplicates.push(id);
          return;
        }
        seen.add(id);
        uniqueIds.push(id);
      });

      const invalidIds = uniqueIds.filter((id) => !isLikelyIdentifier(id));
      if (invalidIds.length > 0) {
        setValidationIssues({
          invalid: invalidIds.slice(0, 5),
          invalidCount: invalidIds.length,
          duplicateCount: duplicates.length,
        });
        throw new Error(
          "Some identifiers are invalid. Fix them or remove them before updating the list."
        );
      }

      const entriesPayload = uniqueIds.map((id) => ({ id }));
      const collectionIdsPayload = resolveSelectedCollectionApiIds(
        collections,
        selectedCollections
      );
      let activeCollectionIdsPayload = collectionIdsPayload;
      setCreateDebug({
        count: entriesPayload.length,
        sample: entriesPayload.slice(0, 5).map((item) => item.id),
        selectedCollections,
        collectionIdsPayload: activeCollectionIdsPayload,
      });

      const selectedList = customLists.find(
        (list) => String(list.id) === String(selectedUpdateListId)
      );
      const updateName =
        selectedList?.name?.trim() || listName.trim() || "Updated List";

      const chunks = chunkArray(entriesPayload, CHUNK_SIZE);
      setChunkProgress({ total: chunks.length, completed: 0 });

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const updatePayload = new URLSearchParams();
        updatePayload.set("id", selectedUpdateListId);
        updatePayload.set("name", updateName);
        updatePayload.set("entries", JSON.stringify(chunk));
        updatePayload.set("deletedEntries", JSON.stringify([]));
        updatePayload.set("collections", JSON.stringify(activeCollectionIdsPayload));

        const updateResponse = await fetch(
          `${apiBase}/admin/custom_list/${selectedUpdateListId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRF-Token": csrfToken,
            },
            credentials: "include",
            body: updatePayload.toString(),
          }
        );

        if (!updateResponse.ok) {
          let errorMessage = `Update failed with ${updateResponse.status}`;
          const contentType = updateResponse.headers.get("content-type") || "";
          if (
            contentType.includes("application/json") ||
            contentType.includes("application/api-problem+json")
          ) {
            const json = await updateResponse.json();
            errorMessage = json.detail || json.title || errorMessage;
          } else {
            const text = await updateResponse.text();
            if (text) {
              errorMessage = `${errorMessage}. ${text.slice(0, 300)}`.trim();
            }
          }
          if (
            activeCollectionIdsPayload.length > 0 &&
            shouldRetryWithoutCollections(errorMessage)
          ) {
            activeCollectionIdsPayload = [];
            setCreateDebug((current) =>
              current
                ? {
                    ...current,
                    collectionIdsPayload: activeCollectionIdsPayload,
                    collectionFallbackApplied: true,
                  }
                : current
            );
            setCreateNotice(
              "Selected collection IDs were not accepted by Palace. Retried with no explicit collection mapping."
            );

            const retryPayload = new URLSearchParams();
            retryPayload.set("id", selectedUpdateListId);
            retryPayload.set("name", updateName);
            retryPayload.set("entries", JSON.stringify(chunk));
            retryPayload.set("deletedEntries", JSON.stringify([]));
            retryPayload.set("collections", JSON.stringify(activeCollectionIdsPayload));

            const retryResponse = await fetch(
              `${apiBase}/admin/custom_list/${selectedUpdateListId}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "X-CSRF-Token": csrfToken,
                },
                credentials: "include",
                body: retryPayload.toString(),
              }
            );

            if (!retryResponse.ok) {
              throw new Error(errorMessage);
            }
          } else {
            throw new Error(errorMessage);
          }
        }

        setChunkProgress({ total: chunks.length, completed: i + 1 });
      }

      setCreateStatus(STATUS_SUCCESS);
      setCreateMessage(
        `Updated list ${selectedUpdateListId} with ${entriesPayload.length} titles.`
      );
    } catch (error) {
      setCreateStatus(STATUS_ERROR);
      setCreateMessage(error.message || "Unable to update list.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                <img
                  src="/palace-logo.png"
                  alt="Palace logo"
                  className="h-8 w-8"
                />
                <span>Palace Manager Tooling</span>
              </div>
              <h1 className="accent-title mt-3 text-4xl font-semibold text-slate-900 md:text-5xl">
                Batch Title List Builder
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                Upload a spreadsheet of titles and IDs to create or update Palace
                Manager custom lists.
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
                    onClick={handleLogout}
                    disabled={logoutStatus === STATUS_WORKING}
                  >
                    {logoutStatus === STATUS_WORKING ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {page === PAGE_LOGIN && (
          <div className="grid gap-6 lg:grid-cols-[1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="accent-title text-2xl font-semibold text-slate-900">
              1. Sign In
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Use an admin account with librarian permissions for the target library.
            </p>

            <form className="mt-6 grid gap-4" onSubmit={handleLogin}>
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
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.org"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Library short name
                <input
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  value={libraryShortName}
                  onChange={(event) => setLibraryShortName(event.target.value)}
                  placeholder="lib1"
                />
              </label>
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                disabled={loginStatus === STATUS_WORKING}
              >
                {loginStatus === STATUS_WORKING ? "Signing in..." : "Sign in"}
              </button>
              {loginMessage && (
                <div
                  className={`rounded-xl px-4 py-3 text-sm ${
                    loginStatus === STATUS_ERROR
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
        )}

        {page === PAGE_EXPORT && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="accent-title text-2xl font-semibold text-slate-900">
                  Collections & Exports
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Choose a collection and download a CSV of Title, Author, and
                  Work URN.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                onClick={handleFetchCollections}
                disabled={collectionsStatus === STATUS_WORKING}
              >
                Refresh collections
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-semibold text-slate-700">
                  Select a collection
                </p>
                <div className="mt-4 grid gap-3">
                  {collections.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No collections loaded yet.
                    </p>
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
                        <span className="ml-2 text-xs text-slate-500">
                          ID {collection.id}
                        </span>
                      </span>
                      <input
                        type="radio"
                        name="export-collection"
                        className="h-4 w-4"
                        checked={
                          String(exportCollectionId) === String(collection.id)
                        }
                        onChange={() => setExportCollectionId(collection.id)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-sm font-semibold text-slate-700">
                  Export titles
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  The export pulls all titles in the selected collection and
                  downloads a CSV.
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  onClick={handleExport}
                  disabled={exportStatus === STATUS_WORKING}
                >
                  {exportStatus === STATUS_WORKING
                    ? "Building CSV..."
                    : "Download CSV"}
                </button>
                {exportFeedUrl && (
                  <p className="mt-2 text-xs text-slate-500">
                    Feed: {exportFeedUrl}
                  </p>
                )}
                {exportStatus === STATUS_WORKING && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <p>Pages fetched: {exportPagesFetched}</p>
                    <p>Entries collected: {exportInProgressCount}</p>
                  </div>
                )}
                {exportMessage && (
                  <div
                    className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                      exportStatus === STATUS_ERROR
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <p>{exportMessage}</p>
                    {exportCount > 0 && (
                      <p className="mt-1 text-xs text-emerald-800">
                        {exportCount} rows exported.
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={handleDownloadSample}
                >
                  Download sample CSV
                </button>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    onClick={() => setPage(PAGE_CREATE)}
                  >
                    Create new list
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    onClick={() => {
                      handleFetchCustomLists();
                      setPage(PAGE_UPDATE);
                    }}
                  >
                    Update existing list
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {page === PAGE_CREATE && (
          <div className="grid gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setPage(PAGE_EXPORT)}
                >
                  Back to exports
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="accent-title text-2xl font-semibold text-slate-900">
                Create List
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Give the list a name, then send the identifiers to Palace Manager.
              </p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
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
                        onChange={() => toggleCollection(collection.id)}
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
              </div>

              <form className="mt-6 grid gap-4" onSubmit={handleCreateList}>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  List name
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                    value={listName}
                    onChange={(event) => setListName(event.target.value)}
                    placeholder="Spring Staff Picks"
                  />
                </label>

                {listName.trim() ? (
                  <>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={convertIsbn}
                        onChange={(event) => setConvertIsbn(event.target.checked)}
                      />
                      Auto-convert ISBNs to URNs
                    </label>
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-700">
                        <input
                          type="file"
                          accept=".csv,.xlsx"
                          className="hidden"
                          onChange={handleFileChange}
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
                      <p className="text-sm font-semibold text-slate-700">
                        Identifier preview
                      </p>
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

                    {validationIssues && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                        <p>
                          Invalid identifiers: {validationIssues.invalidCount}
                        </p>
                        <p>
                          Sample invalid: {validationIssues.invalid.join(", ")}
                        </p>
                        {validationIssues.duplicateCount > 0 && (
                          <p>
                            Duplicate identifiers removed:{" "}
                            {validationIssues.duplicateCount}
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      disabled={
                        createStatus === STATUS_WORKING ||
                        !isLoggedIn ||
                        identifiers.length === 0
                      }
                    >
                      {createStatus === STATUS_WORKING
                        ? "Creating list..."
                        : "Create custom list"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Enter a list name to upload a CSV.
                  </p>
                )}
              </form>

              {listExistsError && (
                <form
                  className="mt-6 grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  onSubmit={handleAddToExistingList}
                >
                  <p className="text-sm font-semibold text-amber-900">
                    List already exists. Add titles to it:
                  </p>
                  <label className="grid gap-2 text-sm font-medium text-amber-900">
                    Existing list ID
                    <input
                      className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                      value={existingListId}
                      onChange={(event) => setExistingListId(event.target.value)}
                      placeholder="14"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
                    disabled={
                      createStatus === STATUS_WORKING ||
                      !isLoggedIn ||
                      identifiers.length === 0
                    }
                  >
                    {createStatus === STATUS_WORKING
                      ? "Adding titles..."
                      : "Add titles to existing list"}
                  </button>
                </form>
              )}

              {createMessage && (
                <div
                  className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                    createStatus === STATUS_ERROR
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  <p>{createMessage}</p>
                  {chunkProgress && (
                    <p className="mt-1 text-xs text-slate-500">
                      Chunks processed: {chunkProgress.completed} /{" "}
                      {chunkProgress.total}
                    </p>
                  )}
                  {createDebug && (
                    <p className="mt-1 text-xs text-slate-500">
                      Collections submitted: {JSON.stringify(createDebug.collectionIdsPayload || [])}
                    </p>
                  )}
                  {createNotice && createStatus !== STATUS_ERROR && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      {createNotice}
                    </p>
                  )}
                  {createStatus === STATUS_ERROR && createDebug && (
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
                    <p className="mt-1 text-xs text-emerald-800">
                      New list ID: {createdListId}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {page === PAGE_UPDATE && (
          <div className="grid gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setPage(PAGE_EXPORT)}
                >
                  Back to exports
                </button>
              </div>
              <h2 className="accent-title text-2xl font-semibold text-slate-900">
                Update Existing List
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Choose a list, select collections, then upload a CSV to append
                titles.
              </p>

              <div className="mt-6 grid gap-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={handleFetchCustomLists}
                  disabled={customListsStatus === STATUS_WORKING}
                >
                  {customListsStatus === STATUS_WORKING
                    ? "Loading lists..."
                    : "Load lists"}
                </button>
                {customListsMessage && (
                  <div
                    className={`rounded-xl px-4 py-3 text-sm ${
                      customListsStatus === STATUS_ERROR
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
                  <p className="text-sm text-slate-500">
                    Load lists to choose one.
                  </p>
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
                      <span className="ml-2 text-xs text-slate-500">
                        ID {list.id}
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="update-list"
                      className="h-4 w-4"
                      checked={String(selectedUpdateListId) === String(list.id)}
                      onChange={() => setSelectedUpdateListId(String(list.id))}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">
                Collections and CSV
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Select the collections the list should be associated with, then
                upload a CSV to add titles.
              </p>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
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
                        onChange={() => toggleCollection(collection.id)}
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
              </div>

              <div className="mt-6 grid gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={convertIsbn}
                    onChange={(event) => setConvertIsbn(event.target.checked)}
                  />
                  Auto-convert ISBNs to URNs
                </label>

                <div className="rounded-2xl border border-slate-300 bg-slate-50 p-6">
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-700">
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={handleFileChange}
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
                  <p className="text-sm font-semibold text-slate-700">
                    Identifier preview
                  </p>
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

                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  onClick={handleUpdateListSubmit}
                  disabled={
                    createStatus === STATUS_WORKING ||
                    !isLoggedIn ||
                    identifiers.length === 0 ||
                    !selectedUpdateListId
                  }
                >
                  {createStatus === STATUS_WORKING
                    ? "Updating list..."
                    : "Update list"}
                </button>

                {createMessage && (
                  <div
                    className={`rounded-xl px-4 py-3 text-sm ${
                      createStatus === STATUS_ERROR
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <p>{createMessage}</p>
                    {chunkProgress && (
                      <p className="mt-1 text-xs text-slate-500">
                        Chunks processed: {chunkProgress.completed} /{" "}
                        {chunkProgress.total}
                      </p>
                    )}
                    {createDebug && (
                      <p className="mt-1 text-xs text-slate-500">
                        Collections submitted: {JSON.stringify(createDebug.collectionIdsPayload || [])}
                      </p>
                    )}
                    {createNotice && createStatus !== STATUS_ERROR && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {createNotice}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="text-center text-xs text-slate-500">
          Ensure Palace Manager is running and that this app can access it via the
          configured base URL. You may need a reverse proxy in production.
        </footer>
      </div>
    </div>
  );
}

export default App;
