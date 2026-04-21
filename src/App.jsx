import { useMemo, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import AppFooter from "./components/AppFooter";
import AppHeader from "./components/AppHeader";
import CreatePage from "./components/CreatePage";
import ExportPage from "./components/ExportPage";
import LoginPage from "./components/LoginPage";
import UpdatePage from "./components/UpdatePage";
import {
  buildEntriesPayload,
  createCustomListWithFallback,
  isCustomListAlreadyExistsError,
  updateCustomListChunkWithFallback,
} from "./lib/customListWorkflow";

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

  const showCollectionsFallbackNotice = () => {
    setCreateNotice(
      "Selected collection IDs were not accepted by Palace. Retried with no explicit collection mapping."
    );
  };

  const prepareEntriesForListMutation = (mode) => {
    const result = buildEntriesPayload({
      identifiers,
      normalizeIdentifier: (id) =>
        normalizeDoi(maybeUrnifyIsbn(id, convertIsbn)),
      isValid: isLikelyIdentifier,
    });

    if (result.invalid.length > 0) {
      setValidationIssues({
        invalid: result.invalid.slice(0, 5),
        invalidCount: result.invalid.length,
        duplicateCount: result.duplicates.length,
      });
      throw new Error(
        `Some identifiers are invalid. Fix them or remove them before ${mode} the list.`
      );
    }

    return result.entriesPayload;
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

      const entriesPayload = prepareEntriesForListMutation("creating");
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

      let listId = "";
      try {
        const createResult = await createCustomListWithFallback({
          apiBase,
          csrfToken,
          name: listName.trim(),
          collections: activeCollectionIdsPayload,
        });
        listId = createResult.listId;
        activeCollectionIdsPayload = createResult.collectionIds;

        if (createResult.fallbackApplied) {
          setCreateDebug((current) =>
            current
              ? {
                  ...current,
                  collectionIdsPayload: activeCollectionIdsPayload,
                  collectionFallbackApplied: true,
                }
              : current
          );
          showCollectionsFallbackNotice();
        }
      } catch (createError) {
        if (isCustomListAlreadyExistsError(createError.message)) {
          setListExistsError(true);
        }
        throw createError;
      }

      setCreatedListId(listId);

      const chunks = chunkArray(entriesPayload, CHUNK_SIZE);
      setChunkProgress({ total: chunks.length, completed: 0 });
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const updateResult = await updateCustomListChunkWithFallback({
          apiBase,
          csrfToken,
          listId,
          name: listName.trim(),
          entries: chunk,
          collections: activeCollectionIdsPayload,
          errorPrefix: "Add titles failed",
          includeId: false,
        });

        if (updateResult.fallbackApplied) {
          activeCollectionIdsPayload = updateResult.collectionIds;
          setCreateDebug((current) =>
            current
              ? {
                  ...current,
                  collectionIdsPayload: activeCollectionIdsPayload,
                  collectionFallbackApplied: true,
                }
              : current
          );
          showCollectionsFallbackNotice();
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

      const entriesPayload = prepareEntriesForListMutation("updating");
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
        const updateResult = await updateCustomListChunkWithFallback({
          apiBase,
          csrfToken,
          listId: existingListId.trim(),
          name: listName.trim(),
          entries: chunk,
          deletedEntries: [],
          collections: activeCollectionIdsPayload,
          errorPrefix: "Add titles failed",
        });

        if (updateResult.fallbackApplied) {
          activeCollectionIdsPayload = updateResult.collectionIds;
          setCreateDebug((current) =>
            current
              ? {
                  ...current,
                  collectionIdsPayload: activeCollectionIdsPayload,
                  collectionFallbackApplied: true,
                }
              : current
          );
          showCollectionsFallbackNotice();
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

      const entriesPayload = prepareEntriesForListMutation("updating");
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
        const updateResult = await updateCustomListChunkWithFallback({
          apiBase,
          csrfToken,
          listId: selectedUpdateListId,
          name: updateName,
          entries: chunk,
          deletedEntries: [],
          collections: activeCollectionIdsPayload,
          errorPrefix: "Update failed",
        });

        if (updateResult.fallbackApplied) {
          activeCollectionIdsPayload = updateResult.collectionIds;
          setCreateDebug((current) =>
            current
              ? {
                  ...current,
                  collectionIdsPayload: activeCollectionIdsPayload,
                  collectionFallbackApplied: true,
                }
              : current
          );
          showCollectionsFallbackNotice();
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
        <AppHeader
          adminEmail={adminEmail}
          onLogout={handleLogout}
          logoutWorking={logoutStatus === STATUS_WORKING}
        />

        {page === PAGE_LOGIN && (
          <LoginPage
            email={email}
            onEmailChange={setEmail}
            password={password}
            onPasswordChange={setPassword}
            libraryShortName={libraryShortName}
            onLibraryShortNameChange={setLibraryShortName}
            onSubmit={handleLogin}
            loginWorking={loginStatus === STATUS_WORKING}
            loginError={loginStatus === STATUS_ERROR}
            loginMessage={loginMessage}
          />
        )}

        {page === PAGE_EXPORT && (
          <ExportPage
            collections={collections}
            exportCollectionId={exportCollectionId}
            onSelectExportCollection={setExportCollectionId}
            onRefreshCollections={handleFetchCollections}
            collectionsLoading={collectionsStatus === STATUS_WORKING}
            onExport={handleExport}
            exportWorking={exportStatus === STATUS_WORKING}
            exportFeedUrl={exportFeedUrl}
            exportPagesFetched={exportPagesFetched}
            exportInProgressCount={exportInProgressCount}
            exportMessage={exportMessage}
            exportError={exportStatus === STATUS_ERROR}
            exportCount={exportCount}
            onDownloadSample={handleDownloadSample}
            onGoToCreate={() => setPage(PAGE_CREATE)}
            onGoToUpdate={() => {
              handleFetchCustomLists();
              setPage(PAGE_UPDATE);
            }}
          />
        )}

        {page === PAGE_CREATE && (
          <CreatePage
            onBackToExports={() => setPage(PAGE_EXPORT)}
            collections={collections}
            selectedCollections={selectedCollections}
            onToggleCollection={toggleCollection}
            listName={listName}
            onListNameChange={setListName}
            convertIsbn={convertIsbn}
            onConvertChange={setConvertIsbn}
            onFileChange={handleFileChange}
            fileName={fileName}
            parseMessage={parseMessage}
            identifiers={identifiers}
            previewIdentifiers={previewIdentifiers}
            validationIssues={validationIssues}
            onSubmitCreate={handleCreateList}
            createWorking={createStatus === STATUS_WORKING}
            isLoggedIn={isLoggedIn}
            listExistsError={listExistsError}
            onSubmitAddExisting={handleAddToExistingList}
            existingListId={existingListId}
            onExistingListIdChange={setExistingListId}
            createMessage={createMessage}
            createError={createStatus === STATUS_ERROR}
            chunkProgress={chunkProgress}
            createDebug={createDebug}
            createNotice={createNotice}
            createdListId={createdListId}
          />
        )}

        {page === PAGE_UPDATE && (
          <UpdatePage
            onBackToExports={() => setPage(PAGE_EXPORT)}
            onLoadLists={handleFetchCustomLists}
            customListsLoading={customListsStatus === STATUS_WORKING}
            customListsMessage={customListsMessage}
            customListsError={customListsStatus === STATUS_ERROR}
            customLists={customLists}
            selectedUpdateListId={selectedUpdateListId}
            onSelectUpdateList={setSelectedUpdateListId}
            collections={collections}
            selectedCollections={selectedCollections}
            onToggleCollection={toggleCollection}
            convertIsbn={convertIsbn}
            onConvertChange={setConvertIsbn}
            onFileChange={handleFileChange}
            fileName={fileName}
            parseMessage={parseMessage}
            identifiers={identifiers}
            previewIdentifiers={previewIdentifiers}
            onSubmitUpdate={handleUpdateListSubmit}
            createWorking={createStatus === STATUS_WORKING}
            isLoggedIn={isLoggedIn}
            createMessage={createMessage}
            createError={createStatus === STATUS_ERROR}
            chunkProgress={chunkProgress}
            createDebug={createDebug}
            createNotice={createNotice}
          />
        )}

        <AppFooter />
      </div>
    </div>
  );
}

export default App;
