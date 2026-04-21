# Palace Lists (Bulk Custom List Builder)

This is a React + Tailwind app that helps librarians create Palace Manager custom lists by uploading a spreadsheet of identifiers.

## What It Does
- Signs in to Palace Manager with admin credentials.
- Loads collections the admin can access.
- Parses CSV or XLSX identifiers.
- Creates a custom list via `POST /admin/custom_lists`.

## Quick Start

1. Install dependencies

```bash
npm install
```

2. (Optional) Configure local endpoints

Copy `.env.example` to `.env` and adjust values if needed:

```
VITE_API_BASE=/cm
VITE_FEED_BASE=/public
VITE_CHUNK_SIZE=10
```

3. Run the dev server

```bash
npm run dev
```

The Vite dev server proxies `/cm` and `/public` to `http://localhost:6500` by default so cookies and CSRF work without CORS issues.

Custom list writes are batched in groups of 10 publications per request because the backend only handles 10 at a time.

## Configuration Notes

- The base URL field defaults to `/cm` for local development.
- If you deploy this app separately from Palace Manager, use a reverse proxy so the UI and the API share the same domain. Otherwise, the session cookie and CSRF token may not be available to the browser.

## Spreadsheet Format

The app looks for a column named `identifier`, `id`, `urn`, or `isbn`. If no header matches, it reads the first column. XLSX support is limited to `.xlsx` files (not `.xls`).

## Security

This tool uses admin credentials and requires a CSRF token cookie. Use it only on trusted networks and accounts.
