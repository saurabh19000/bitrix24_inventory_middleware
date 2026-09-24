# Bitrix24 Inventory & Invoice Middleware

A production-ready, full-stack middleware application designed to ingest Excel (`.xlsx`, `.xls`) and `.csv` files, validate records, map column headers, and synchronize product catalogs, prices, stock quantities, and classic CRM invoices into **Bitrix24** via its REST API.

Built with **Node.js, Express, TypeScript, React 18, PostgreSQL, Prisma ORM, Redis, BullMQ, and Docker**.

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Technology Stack](#2-technology-stack)
- [3. Complete Feature & Functional Breakdown](#3-complete-feature--functional-breakdown)
  - [3.1 Authentication & User Management](#31-authentication--user-management)
  - [3.2 Bitrix24 Webhook Configuration & Security](#32-bitrix24-webhook-configuration--security)
  - [3.3 File Ingestion, Parsing & Data Integrity](#33-file-ingestion-parsing--data-integrity)
  - [3.4 Product & Inventory Import Wizard](#34-product--inventory-import-wizard)
  - [3.5 Invoice Import Wizard](#35-invoice-import-wizard)
  - [3.6 Stock Receipt & Product Catalog Synchronization Wizard](#36-stock-receipt--product-catalog-synchronization-wizard)
  - [3.7 BullMQ Asynchronous Processing Pipeline](#37-bullmq-asynchronous-processing-pipeline)
  - [3.8 Import Tracking, Error Reporting & Retry Engine](#38-import-tracking-error-reporting--retry-engine)
  - [3.9 Live Diagnostic Debug Console](#39-live-diagnostic-debug-console)
  - [3.10 Admin Dashboard](#310-admin-dashboard)
- [4. Database Architecture (Prisma Schema)](#4-database-architecture-prisma-schema)
- [5. Bitrix24 REST API Integration Reference](#5-bitrix24-rest-api-integration-reference)
- [6. REST API Endpoints Reference](#6-rest-api-endpoints-reference)
- [7. Configuration & Environment Variables](#7-configuration--environment-variables)
- [8. Deployment & Getting Started](#8-deployment--getting-started)
  - [8.1 Quick Start with Docker](#81-quick-start-with-docker)
  - [8.2 Local Development Setup](#82-local-development-setup)
- [9. Known Platform Considerations & Limitations](#9-known-platform-considerations--limitations)

---

## 1. Architecture Overview

The system strictly decouples the user-facing admin portal from direct Bitrix24 interactions. The frontend talks exclusively to the authenticated Express API. The backend orchestrates asynchronous execution via Redis/BullMQ workers, ensuring large files never time out the HTTP request and Bitrix rate limits are respected.

```
                              ┌────────────────────────────────────────┐
                              │            React Frontend              │
                              │     (Vite + Tailwind + React Router)   │
                              └───────────────────┬────────────────────┘
                                                  │ HTTPS / JSON
                                                  ▼
                              ┌────────────────────────────────────────┐
                              │          Express API Backend           │
                              │    (Auth / Rate Limiting / Multer)     │
                              └───────┬──────────────────────┬─────────┘
                                      │                      │
                     Enqueues Job     │                      │ SQL Queries
                                      ▼                      ▼
                   ┌───────────────────────┐      ┌─────────────────────────┐
                   │     Redis + BullMQ    │      │   PostgreSQL + Prisma   │
                   │    (import-queue)     │      │   (Jobs, Records, Logs) │
                   └──────────┬────────────┘      └─────────────────────────┘
                              │
                    Dequeues  │
                              ▼
                   ┌───────────────────────┐
                   │  Async Import Worker  │
                   │ (Controlled Concurrency)
                   └──────────┬────────────┘
                              │ Bitrix REST API (Rate-limit aware with retries)
                              ▼
                   ┌───────────────────────┐
                   │    Bitrix24 Portal    │
                   │ (Catalog/Price/CRM)   │
                   └───────────────────────┘
```

---

## 2. Technology Stack

### Backend
- **Runtime & Language:** Node.js 20 LTS, TypeScript 5.5
- **Framework:** Express 4.21
- **Database & ORM:** PostgreSQL 15+, Prisma ORM 5.19
- **Job Queue:** BullMQ 5.12 backed by Redis 7
- **Excel & CSV Engine:** ExcelJS 4.4 + custom streaming CSV parser
- **Security & Crypto:** Node `crypto` (AES-256-GCM), bcrypt, jsonwebtoken, Helmet, express-rate-limit
- **Logging:** Pino 9 + Pino-pretty + PostgreSQL-backed `DebugLog` service

### Frontend
- **Framework & Tooling:** React 18, Vite 5, TypeScript 5.5
- **Routing:** React Router DOM v6
- **Styling:** Tailwind CSS 3.4
- **Forms & Validation:** React Hook Form 7, Zod 3.23
- **Notifications & Charts:** React Hot Toast, Recharts 2.12

### Infrastructure & Orchestration
- **Containerization:** Docker & Docker Compose
- **Web Server:** Nginx (frontend reverse proxy and static asset delivery)

---

## 3. Complete Feature & Functional Breakdown

### 3.1 Authentication & User Management
- **JWT Cookie Auth:** Authenticates administrators via secure HTTP-only cookies (`COOKIE_SECURE` flag customizable for production TLS or development plain HTTP).
- **Auto-Provisioning Seed:** On boot, [`backend/src/server.ts`](backend/src/server.ts) automatically hashes and seeds the default administrator account defined in `ADMIN_EMAIL` and `ADMIN_PASSWORD` if it does not already exist.
- **Route Guarding:** Frontend [`ProtectedRoute`](frontend/src/App.tsx) and backend [`authMiddleware`](backend/src/middleware/auth.middleware.ts) guarantee unauthorized callers cannot access APIs or dashboard views.

### 3.2 Bitrix24 Webhook Configuration & Security
- **AES-256-GCM Encryption:** Inbound Bitrix webhooks contain authentication tokens. They are encrypted using `BITRIX_ENCRYPTION_KEY` before saving into the database.
- **Zero Exposure:** Webhook URLs are never returned in plaintext to the frontend or printed into logs. The UI masks the webhook as `******************************`.
- **Live Connection Verification:** The admin can test the webhook connectivity at any time via [`BitrixClient.testConnection`](backend/src/services/bitrix/BitrixClient.ts). It probes the portal's `scope` endpoint, validates status, and stamps `lastTestedAt`.
- **Automatic Throttle Recovery:** If Bitrix returns `QUERY_LIMIT_EXCEEDED` or `OPERATION_LIMIT` (even over HTTP 200), [`BitrixClient`](backend/src/services/bitrix/BitrixClient.ts) intercepts the response, applies exponential backoff, and automatically retries before failing.

### 3.3 File Ingestion, Parsing & Data Integrity
- **Multi-Format Support:** Accepts `.xlsx`, `.xls`, and `.csv` files up to `MAX_FILE_SIZE_MB` (default 10 MB).
- **String Preservation (Leading Zeros):** Identifiers such as SKU `000123` or Barcode `089012345` are read as raw text and never converted into numbers.
- **Robust Quoted CSV Parsing:** [`ExcelService.parseCsv`](backend/src/services/excel/excel.service.ts) features a character-by-character state machine correctly handling commas inside double quotes, escaped quotes, and multi-line rows.
- **Duplicate & Constraint Validation:** [`ExcelValidator`](backend/src/services/excel/excel.validator.ts) inspects records prior to queueing. It flags missing required fields, non-numeric values, negative prices/quantities, and finds duplicate SKUs/Invoice numbers with exact row references.
- **Auto-Mapping Engine:** [`MappingService`](backend/src/services/excel/mapping.service.ts) inspects column names using a comprehensive keyword dictionary and Levenshtein distance fuzzy matching to pre-select mappings.

### 3.4 Product & Inventory Import Wizard (`/inventory/import`)
A 6-step workflow designed for catalog stock and product data:
1. **Upload:** Drag-and-drop or select `.xlsx`, `.xls`, `.csv`.
2. **Preview:** Instant table preview displaying headers, total rows, and the first 50 records.
3. **Map Columns:** Visual field mapping between Excel columns and Bitrix fields (SKU, Product Name, Quantity, Base Price, Barcode).
4. **Confirm & Mode Selection:** Choose import policy:
   - `Create + Update` *(default)*: Updates existing items, creates new items.
   - `Create Only`: Only adds items that do not exist in Bitrix.
   - `Update Only`: Only modifies items that already exist in Bitrix.
5. **Import:** Job is stored in the database, records are initialized as `PENDING`, and the job is enqueued in BullMQ.
6. **Live Progress:** Real-time polling showing processed, successful, failed, and skipped row counters with progress percentage.

### 3.5 Invoice Import Wizard (`/invoices/import`)
A specialized 6-step import pipeline for Bitrix24's classic CRM invoice entity (`crm.invoice.*`):
- **Mapped Fields:**
  - `ACCOUNT_NUMBER`: Invoice reference identifier (match key).
  - `ORDER_TOPIC`: Subject or order description.
  - `CLIENT`: Customer or client company name.
  - `PRICE`: Total invoice amount.
  - `CURRENCY`: 3-letter currency code (e.g. `USD`, `INR`, `EUR`).
  - `STATUS_ID`: Bitrix status (`N` = New, `S` = Sent, `P` = Paid, `D` = Unpaid).
  - `DATE_BILL` & `DATE_PAY_BEFORE`: Issue and due dates (normalized to `YYYY-MM-DD`).
  - `COMMENT`: Notes/remarks.
- **Idempotency:** Matches existing invoices by `ACCOUNT_NUMBER` via `crm.invoice.list`. Existing records are updated with changed fields; new invoices are created via `crm.invoice.add`.
- **Permission Diagnostics:** If the Bitrix webhook lacks CRM Invoices permission, the system captures the failure with an actionable diagnostic message.

### 3.6 Stock Receipt & Product Catalog Synchronization Wizard (`/inventory/stock-receipt`)
A modern, end-to-end import pipeline connecting supplier stock arrival spreadsheets directly to **Bitrix24 Inventory Management Stock Receipts** and the **Product Catalog**:
- **Dynamic Field Discovery:**
  - Calls `GET /api/bitrix/stock-receipt-fields` upon upload to inspect live Bitrix24 document schema (`catalog.document.element.getFields`), catalog product schema (`catalog.product.getFields`), and portal warehouses (`catalog.store.list`).
  - Supports offline/pre-configured environments with robust core schema fallbacks.
- **Stock Receipt Field Mapping:**
  - `PRODUCT_NAME` *(Required)*: Catalog item name (e.g. "iPhone 15 Pro Max 256GB").
  - `SKU` / `CODE`: Product SKU or Part Number for catalog matching.
  - `BARCODE`: Product EAN/UPC barcode (registered in Bitrix catalog).
  - `PURCHASE_PRICE`: Unit cost / purchase price recorded on the arrival document.
  - `SALES_PRICE`: Commercial catalog base selling price (updated via `catalog.price.*`).
  - `QUANTITY_ARRIVED` *(Required)*: Units received in this arrival batch.
  - `WAREHOUSE`: Target destination store (matched by warehouse title or integer ID).
  - `QUANTITY_DESTINATION`: Total current stock level reference.
  - `TOTAL`: Line item total valuation (`Quantity Arrived × Purchase Price`).
- **Synchronized Catalog + Inventory Execution:**
  1. **Product Catalog Sync:** Matches existing products by `CODE`/`XML_ID` or exact `NAME`. In `CREATE_UPDATE` or `CREATE_ONLY` mode, creates missing catalog items with title, barcode, and base sales price.
  2. **Inventory Stock Receipt Document:** Creates an official Bitrix24 Arrival document (`catalog.document.add` with `docType: 'A'`).
  3. **Line Element Registration:** Attaches each arrived line item via `catalog.document.element.add` referencing the catalog product ID, destination warehouse ID (`storeTo`), arrival quantity (`amount`), and unit purchase price (`purchasingPrice`).
  4. **Document Conducting:** Automatically posts/conducts the receipt document via `catalog.document.conduct`, officially crediting real-time inventory balances into the destination warehouse.
  5. **Direct Store Fallback:** If document conduction is restricted by portal permissions, gracefully updates store stock balances via `catalog.storeproduct.update` or `catalog.product.update` so counts are never lost.
- **Mode Selection:** `Create + Update` (recommended), `Create Only`, or `Update Only`.

### 3.7 BullMQ Asynchronous Processing Pipeline
- **Queue Architecture:** [`importQueue`](backend/src/queues/import.queue.ts) offloads long-running processing to an asynchronous worker.
- **Controlled Concurrency:** [`import.worker.ts`](backend/src/services/import/import.worker.ts) executes record syncs using a bounded concurrency pool (default 5 concurrent Bitrix requests) to prevent API throttling.
- **Crash Recovery & Reconciliation:** If the server is abruptly stopped during processing, any records left in `PROCESSING` or `PENDING` are reconciled and marked for retry so no job is stranded.
- **Automatic Upload Cleanup:** When a job completes or fails, the uploaded staging file in `uploads/` is deleted from disk.

### 3.8 Import Tracking, Error Reporting & Retry Engine
- **Import History (`/imports`):** Search, filter by status (`PENDING`, `PROCESSING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`), and view completion timestamps.
- **Import Details (`/imports/:id`):**
  - Summary progress card and status breakdown chart.
  - Displays Bitrix Stock Receipt Document ID with quick reference when available.
  - Detailed errors table listing every failed row number, SKU/Invoice No, and the Bitrix API error message.
- **Excel Error Report Download:** Generates an `.xlsx` file on-the-fly containing `Row | SKU | Product | Status | Error`.
- **One-Click Retry:** The **Retry Failed Records** button resets `FAILED` and `PARTIAL_FAILURE` records back to `PENDING` and re-submits the job to BullMQ without creating duplicates of already successful rows.

### 3.9 Live Diagnostic Debug Console (`/debug`)
- **Internal Audit Logging:** [`DebugLogService`](backend/src/services/debug/debugLog.service.ts) logs operational events into the PostgreSQL `DebugLog` table.
- **Sources Tracked:** `API`, `AUTH`, `SETTINGS`, `BITRIX`, `IMPORT`, `WORKER`, `SYSTEM`.
- **Real-Time Log Stream:** Auto-refreshes every 3 seconds with expandable JSON metadata for payloads, durations, HTTP response codes, and error traces.
- **Log Management:** Text search filter, log level filter (`ERROR`, `WARN`, `INFO`, `DEBUG`), and a "Clear Logs" action.

### 3.10 Admin Dashboard (`/dashboard`)
- **Aggregate KPIs:** Total imports run, total rows processed, successful records, failed records, and skipped records.
- **Bitrix Connection Widget:** Live indicator of current portal integration health and last-tested timestamp.
- **Recent Imports Table:** Quick-access list showing the latest 10 import jobs with real-time status badges.

---

## 4. Database Architecture (Prisma Schema)

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│              User               │       │       BitrixConfiguration       │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id: UUID (PK)                   │       │ id: UUID (PK)                   │
│ email: String (Unique)          │       │ portalUrl: String               │
│ passwordHash: String            │       │ webhookUrlEncrypted: String     │
│ role: String                    │       │ isActive: Boolean               │
│ createdAt / updatedAt           │       │ connectionStatus: String        │
└───────────────┬─────────────────┘       │ lastTestedAt: DateTime?         │
                │ 1                       └─────────────────────────────────┘
                │
                │ creates
                ▼ N
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│            ImportJob            │ 1   N │          ImportRecord           │
├─────────────────────────────────┼───────┼─────────────────────────────────┤
│ id: UUID (PK)                   │       │ id: UUID (PK)                   │
│ fileName: String                │       │ importJobId: UUID (FK)          │
│ filePath: String                │       │ rowNumber: Int                  │
│ importMode: String              │       │ sku: String?                    │
│ type: String                    │       │ productName: String?            │
│   (PRODUCTS / INVOICES /        │       │ status: String                  │
│    STOCK_RECEIPTS)              │       │ bitrixProductId: String?        │
│ bitrixDocumentId: String?       │       │ bitrixDocumentId: String?       │
│ status: String                  │       │ warehouseId: Int?               │
│ totalRows / processedRows       │       │ quantityArrived: Float?         │
│ successfulRows / failedRows     │       │ purchasePrice: Float?           │
│ mappingJson: Json?              │       │ salesPrice: Float?              │
│ startedAt / completedAt         │       │ errorMessage / bitrixError      │
│ createdAt: DateTime             │       │ rawData: Json?                  │
└─────────────────────────────────┘       └─────────────────────────────────┘

┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          ColumnMapping          │       │            DebugLog             │
├─────────────────────────────────┼───────┼─────────────────────────────────┤
│ id: UUID (PK)                   │       │ id: UUID (PK)                   │
│ name: String                    │       │ level: String (INFO/WARN/ERROR) │
│ mappingJson: Json?              │       │ source: String (API/BITRIX/etc) │
│ createdById: UUID (FK User)     │       │ message: String                 │
│ createdAt / updatedAt           │       │ details: Json?                  │
└─────────────────────────────────┘       │ createdAt: DateTime             │
                                          └─────────────────────────────────┘
```

---

## 5. Bitrix24 REST API Integration Reference

Only official Bitrix24 REST API methods are called:

| Domain | Bitrix Method | Purpose |
|---|---|---|
| **System** | `scope` / `profile` | Webhook connectivity and permission verification |
| **Catalog** | `catalog.catalog.list` | Resolves primary commercial catalog ID |
| **Price** | `catalog.priceType.list` | Resolves base price type (`catalogGroupId`) |
| **Price** | `catalog.price.list` | Looks up existing price for a product |
| **Price** | `catalog.price.add` / `.update` | Inserts or updates base price values |
| **Currency** | `crm.currency.list` | Resolves the portal's active base currency |
| **Product** | `catalog.product.getFields` | Discovers catalog schema and product field definitions |
| **Product** | `catalog.product.list` | Idempotent lookup by SKU / `CODE` / `XML_ID` or product name |
| **Product** | `catalog.product.add` | Creates missing catalog products (with barcode & prices) |
| **Product** | `catalog.product.update` | Updates existing products and sets product quantities |
| **Stores** | `catalog.store.list` | Lists available warehouses / stores |
| **Stock Receipt** | `catalog.document.element.getFields` | Discovers document line item fields (amount, purchasingPrice, storeTo) |
| **Stock Receipt** | `catalog.document.add` | Creates official arrival stock receipt document (`docType: 'A'`) |
| **Stock Receipt** | `catalog.document.element.add` | Adds line items with product ID, arrival qty, destination store, & purchase price |
| **Stock Receipt** | `catalog.document.conduct` | Officially conducts/posts arrival document into warehouse inventory |
| **Store Balance** | `catalog.storeproduct.update` | Updates physical store inventory balances directly (permission fallback) |
| **Invoice** | `crm.invoice.list` | Searches existing invoices by `ACCOUNT_NUMBER` |
| **Invoice** | `crm.invoice.add` | Creates new classic CRM invoices |
| **Invoice** | `crm.invoice.update` | Updates invoice values and payment status |
| **Batch** | `batch` | Bulk execution support |

---

## 6. REST API Endpoints Reference

Base URL: `http://localhost:5000/api`

### Authentication (`/api/auth`)
- `POST /api/auth/login` — Authenticate admin, returns user data and sets HTTP-only cookie.
- `POST /api/auth/logout` — Clears authentication cookie.
- `GET /api/auth/me` — Fetches current authenticated session.

### Dashboard (`/api/dashboard`)
- `GET /api/dashboard/stats` — Overall totals, Bitrix connection status, and recent imports list.

### Bitrix Settings (`/api/settings`)
- `GET /api/settings/bitrix` — Returns configured portal URL and connection status (encrypted token hidden).
- `POST /api/settings/bitrix` — Saves/replaces portal URL and webhook (encrypts with AES-256-GCM).
- `PUT /api/settings/bitrix` — Updates existing settings.
- `DELETE /api/settings/bitrix` — Deactivates active configuration.
- `POST /api/settings/bitrix/test` — Performs live connection test against Bitrix.

### Bitrix Discovery (`/api/bitrix`)
- `GET /api/bitrix/catalogs` — Lists portal commercial catalogs.
- `GET /api/bitrix/products/fields` — Returns Bitrix product field schema.
- `GET /api/bitrix/inventory/fields` — Returns inventory/store field schema.
- `GET /api/bitrix/stores` — Lists warehouses/stores.
- `GET /api/bitrix/stock-receipt-fields` — Dynamically discovers available stock receipt arrival fields, catalog fields, and warehouse stores.
- `GET /api/bitrix/invoice-fields` — Returns supported invoice field definitions and statuses.

### Imports Engine (`/api/imports`)
- `POST /api/imports/upload` — Uploads raw file (`multipart/form-data`) into staging.
- `POST /api/imports/preview` — Parses file and returns headers, row counts, and preview sample.
- `POST /api/imports` — Validates rows, creates `ImportJob` & `ImportRecord`s, and queues job (`type`: `PRODUCTS`, `INVOICES`, `STOCK_RECEIPTS`).
- `GET /api/imports` — Paginated list of import jobs with optional status filter.
- `GET /api/imports/:id` — Import job details with status counts.
- `GET /api/imports/:id/errors` — Lists failed records for an import job.
- `GET /api/imports/:id/error-report` — Downloads an Excel file containing all failed records.
- `POST /api/imports/:id/retry` — Re-queues failed/partial records back to `PENDING`.
- `GET /api/imports/template` — Downloads sample Excel template with standard columns.

### Debug & Health (`/api/debug`, `/health`)
- `GET /api/debug/logs` — Query diagnostic logs (level, source, search, pagination).
- `GET /api/debug/stats` — Summary counts by log level and source.
- `DELETE /api/debug/logs` — Clears all diagnostic logs.
- `GET /health` — Health check endpoint verifying PostgreSQL and Redis connections.

---

## 7. Configuration & Environment Variables

Copy `.env.example` to `.env` in the root folder for Docker Compose or in `backend/.env` for manual execution:

| Variable | Default (Dev) | Description |
|---|---|---|
| `PORT` | `5000` | Port for the Express backend server |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bitrix_inventory` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string for BullMQ |
| `JWT_SECRET` | *(Required)* | Secret key used for signing JWT cookies |
| `ADMIN_EMAIL` | `admin@system.com` | Default email for seeded administrator |
| `ADMIN_PASSWORD` | `Admin@123456` | Default password for seeded administrator |
| `BITRIX_ENCRYPTION_KEY` | *(Required 32-char)* | Secret key used for AES-256-GCM webhook encryption |
| `MAX_FILE_SIZE_MB` | `10` | Maximum allowed file upload size |
| `BITRIX_CONCURRENCY` | `5` | Maximum parallel calls to Bitrix per worker batch |
| `BITRIX_MAX_RETRIES` | `3` | Max retries when encountering Bitrix rate limits |
| `BITRIX_REQUEST_TIMEOUT`| `30000` | Timeout in ms for outbound Bitrix REST calls |
| `BATCH_SIZE` | `50` | Number of database records processed per worker batch |
| `COOKIE_SECURE` | `false` (plain HTTP) | Set to `true` when running over HTTPS / TLS |

---

## 8. Deployment & Getting Started

### 8.1 Quick Start with Docker

Docker Compose runs the entire stack in isolated containers with health checks:

1. **Create root `.env`:**
   ```bash
   cp .env.example .env
   ```
2. **Build and start the containers:**
   ```bash
   docker compose up -d --build
   ```
3. **Verify running containers:**
   ```bash
   docker compose ps
   ```
   You should see 4 healthy containers:
   - `bitrix_inventory_postgres` (Port 5432)
   - `bitrix_inventory_redis` (Port 6379)
   - `bitrix_inventory_backend` (Port 5000)
   - `bitrix_inventory_frontend` (Port 3000)

4. **Access the application:**
   - Open [http://localhost:3000](http://localhost:3000)
   - Login with:
     - **Email:** `admin@system.com`
     - **Password:** `Admin@123456`
   - Navigate to **Bitrix Configuration** to set your webhook URL.

---

### 8.2 Local Development Setup

If running directly on your host machine:

#### Prerequisites
- Node.js 18+
- PostgreSQL running locally on port `5432`
- Redis running locally on port `6379`

#### 1. Setup Backend
```bash
cd backend
cp .env.example .env
# Edit .env to verify DATABASE_URL and REDIS_URL point to localhost
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
# Backend starts at http://localhost:5000
```

#### 2. Setup Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend starts at http://localhost:3000 (or http://localhost:5173)
```

---

## 9. Known Platform Considerations & Limitations

1. **Bitrix Inventory Management (Warehouses / Store Stock):**
   - On Bitrix24 commercial plans where **Inventory Management** is enabled, Bitrix restricts direct updates to the product's legacy `quantity` field via REST (`catalog.product.update`), expecting stock changes through store inventory documents (`catalog.document.*`) or store products (`catalog.storeproduct.*`).
   - The middleware performs a test probe on the first quantity write. If the portal rejects direct quantity writes via REST, the system avoids failing the entire row, logs a diagnostic warning, and syncs the product name, code, and price.
2. **Price Tiers:**
   - The current product import engine syncs a single **Base Price** (`catalog.price.*`). If your Excel sheet contains multiple price columns (such as *Cost*, *Dealer Price*, and *End User Price*), you select which column maps to the primary Base Price.
3. **Dynamic Custom Properties:**
   - The product import wizard maps core properties (SKU, Name, Price, Quantity). Arbitrary custom user fields (`PROPERTY_*`) require configuring corresponding Bitrix catalog properties.

---

## License

Internal proprietary software. All rights reserved.