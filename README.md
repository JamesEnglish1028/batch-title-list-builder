# Palace Lists (Bulk Custom List Builder)

This is a React + Tailwind app that helps librarians create Palace Manager custom lists by uploading a spreadsheet of identifiers.

## What It Does
- Signs in to Palace Manager with admin credentials.
- Loads collections the admin can access.
- Parses CSV or XLSX identifiers.
- Creates a custom list via `POST /admin/custom_lists`.

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Run the dev server

```bash
npm run dev
```

The Vite dev server proxies `/cm` to `http://localhost:6500` by default so cookies and CSRF work without CORS issues.

## Configuration Notes

- The base URL field defaults to `/cm` for local development.
- If you deploy this app separately from Palace Manager, use a reverse proxy so the UI and the API share the same domain. Otherwise, the session cookie and CSRF token may not be available to the browser.

## Spreadsheet Format

The app looks for a column named `identifier`, `id`, `urn`, or `isbn`. If no header matches, it reads the first column. XLSX support is limited to `.xlsx` files (not `.xls`).

## Security

This tool uses admin credentials and requires a CSRF token cookie. Use it only on trusted networks and accounts.
