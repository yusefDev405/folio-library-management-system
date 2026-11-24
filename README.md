# Folio — Library Management System

A lightweight, zero-Docker Library Management System handling the full lifecycle of a physical collection: cataloguing books, tracking individual copies by barcode, checking books out and in, renewals, FIFO reservation queues, overdue fines, operational reports, and trigger-written audit logs.

## Zero-Heavy-Install Architecture
- **Runtime**: Node.js (`>= 22.13`, tested on v24.15) + Express 5
- **Database**: Node's built-in `node:sqlite` (SQLite 3.51.3 with FTS5 full-text search, `STORED` generated columns, `CHECK` constraints, `ON DELETE RESTRICT`, views, and audit triggers) — **no Docker, no external database daemon, and no native C++ addons**
- **MySQL 8 Reference**: Complete MySQL 8 schema, `DELIMITER $$` stored procedures, triggers, events, `EXPLAIN ANALYZE` queries, and `mysqldump` scripts in `db/mysql/`
- **Security**: `node:crypto` `scrypt` password hashing, short-lived JWT access tokens + rotating `HttpOnly; SameSite=Strict` refresh cookies with reuse revocation, Zod input validation, Helmet CSP, rate limiting, RBAC, and ownership checks
- **Frontend**: Vanilla semantic HTML5, modern CSS (`@container` queries, `:user-invalid`, `light-dark()`, native `<dialog>`, `[popover]`, sortable `aria-sort` tables), and ES modules served directly from Express
- **Features**:
  - **Member Portal**: Catalogue search, reader reviews & ratings, APA/MLA/BibTeX citations, personal Reading List shelves, `.ics` due-date reminders, in-app Notification Inbox, printable SVG barcode Digital Library Card, password change, and reading theme switcher (`System`, `Light`, `Dark`, `Warm Sepia`)
  - **Librarian & Desk**: Scanner-ready Circulation Desk with optional Web Audio chimes, printable receipts, Lost/Damaged copy settlement, Holds Shelf & FIFO queue manager, Physical Shelf Stocktake audit mode, in-browser Bulk CSV Import, copy loan history, and printable SVG barcode labels
  - **Admin & Analytics**: Usage Analytics dashboard, 1-click CSV exports, Audit Log filters with side-by-side JSON diff modal, Backup snapshot & restore verification panel, and `Ctrl+K` / `/` Command Palette
- **Tests**: Node's built-in `node:test` runner against ephemeral throwaway databases built from migrations

## Quick Start (One-Command Setup)

```bash
cd library-system
npm install
npm run seed
npm start
```

Open:
- **Web App**: http://localhost:3000
- **Swagger API Docs**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/api/v1/health

## Seeded Demo Logins (Small Dataset < 200 KB)

| Role | Email | Password | Notes |
|---|---|---|---|
| **Admin** | `admin@library.local` | `Admin123!` | Users, loan policies, audit log, waive fines |
| **Librarian** | `librarian@library.local` | `Librarian123!` | Circulation desk, books/copies, members, reports |
| **Member (Student)** | `nadia.student@library.local` | `Member123!` | Active + overdue loan, unpaid fine, waiting reservation |
| **Member (Staff)** | `omar.staff@library.local` | `Member123!` | Ready hold waiting on Book 1 (`LIB-000102`) |
| **Member (External)** | `sara.external@library.local` | `Member123!` | Clean account ready for checkout |

## Scripts

- `npm start` — Run server (auto-applies migrations + starts hourly hold-expiry job)
- `npm run dev` — Run server with `node --watch`
- `npm run migrate` — Apply pending `.sql` migrations from `db/migrations/`
- `npm run seed` — Populate tiny demo dataset (`--reset` recreates DB)
- `npm test` — Run all 6 test suites (unit, procedures, API, authorization, constraints, 20-way concurrency)
- `npm run backup` / `npm run restore` — Snapshot backup via `VACUUM INTO` and scratch-restore verification
- `npm run import:csv` — Import legacy books CSV with ISBN-10/13 checksum validation and error report
- `npm run bench` — Run ephemeral `:memory:` benchmark (`LIKE` vs `FTS5` and indexed overdue query)

## Out of Scope
- Online payment gateway processing (fines are settled in person at the desk)
- E-book / digital DRM lending
- Inter-library loan (ILL) networks
- Dedicated barcode scanner hardware drivers (the Circulation Desk accepts keyboard-wedge scanner input directly)

## Documentation
- [OpenAPI 3.0 Spec](docs/openapi.yaml)
- [ER Diagram](docs/er-diagram.svg) & [Schema Notes](docs/er-diagram.md)
- [Design Decisions](docs/design-decisions.md)
- [Security Checklist](docs/security.md)
- [Performance Benchmarks](docs/performance.md)
- [Operations & Backup](docs/operations.md)
- [MySQL vs PostgreSQL vs SQLite](docs/mysql-vs-postgres.md)
- [Postman Collection](docs/postman-collection.json)
