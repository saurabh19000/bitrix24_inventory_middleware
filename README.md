# Bitrix24 Excel Inventory Middleware

A production-ready middleware application that imports Excel inventory files into Bitrix24 through an authenticated admin dashboard. Built with **Node.js + Express + React + PostgreSQL + Prisma + Redis/BullMQ + Docker**.

## Architecture

```
Excel File → React Admin Dashboard → Express API → Auth Middleware → Import Controller
  → Import Service → Excel Parser → Validation → Column Mapping → BullMQ Queue
  → Import Worker → Bitrix Service Layer → Bitrix24 REST API
  → Product/Catalog API + Inventory/Warehouse API → PostgreSQL
```

The frontend **never** communicates directly with Bitrix24. All Bitrix communication happens through the Express backend, which loads the webhook configuration from the database (encrypted).

## Container Stack

| Service   | Container                 | Port  | Purpose                         |
|-----------|---------------------------|-------|---------------------------------|
| PostgreSQL| bitrix_inventory_postgres | 5432  | Database (persistent volume)    |
| Redis     | bitrix_inventory_redis    | 6379  | BullMQ queue + caching          |
| Backend   | bitrix_inventory_backend  | 5000  | Express API + import worker     |
| Frontend  | bitrix_inventory_frontend | 3000  | React dashboard (nginx)         |

---

## Quick Start (Docker)

```bash
docker compose up -d --build
docker compose ps
```

You should see 4 healthy containers: `frontend`, `backend`, `postgres`, `redis`.

Then open **http://localhost:3000** and log in with:

- **Email:** `admin@system.com`
- **Password:** `Admin@123456`

> Change these via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.

---

## Local Development (without Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL (running locally) — or use the dockerized one
- Redis — or use the dockerized one

### 1. Start infrastructure containers
```bash
docker compose up -d postgres redis
```

### 2. Configure environment
```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL to point at `localhost:5432`
```

### 3. Backend
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed        # creates admin@system.com
npm run dev               # http://localhost:5000
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:3000
```

---

## Prisma Commands

```bash
npx prisma generate     # Generate the Prisma client
npx prisma migrate dev  # Create + apply migrations (development)
npx prisma migrate deploy  # Apply migrations (production / Docker)
npx prisma studio       # Interactive DB inspection UI
npx prisma db seed      # Create the initial admin user
```

---

## Environment Variables

### Backend (`.env.example`)

| Variable                | Default                          | Description                                  |
|-------------------------|----------------------------------|----------------------------------------------|
| `NODE_ENV`              | `development`                    | Runtime env                                  |
| `PORT`                  | `5000`                           | Backend port                                 |
| `DATABASE_URL`          | `postgresql://postgres:postgres@postgres:5432/bitrix_inventory` | Prisma connection string |
| `REDIS_URL`             | `redis://redis:6379`             | Redis connection string                      |
| `JWT_SECRET`            | `change-me`                      | Secrets for auth tokens                      |
| `ADMIN_EMAIL`           | `admin@system.com`               | Seed admin email                             |
| `ADMIN_PASSWORD`        | `Admin@123456`                   | Seed admin password                          |
| `BITRIX_ENCRYPTION_KEY` | `change-me`                      | AES key for webhook encryption               |
| `MAX_FILE_SIZE_MB`      | `10`                             | Max Excel upload size                        |
| `BITRIX_CONCURRENCY`    | `5`                              | Parallel Bitrix requests                     |
| `BITRIX_MAX_RETRIES`    | `3`                              | Retries for Bitrix failures                  |
| `BITRIX_REQUEST_TIMEOUT`| `30000`                          | Bitrix request timeout (ms)                  |
| `BATCH_SIZE`            | `50`                             | Records fetched per worker batch |
| `COOKIE_SECURE`         | `true` in prod / `false` in dev  | Sets the `Secure` flag on the auth cookie; set to `false` when serving over plain HTTP (docker-compose passes `false`) |

> **Important:** `BITRIX_WEBHOOK_URL` should **not** be in `.env` for normal operation. The webhook is configured through the **admin dashboard** and stored **encrypted** in PostgreSQL.

### Docker Compose

Create a `.env` file at the project root to override compose defaults:

```bash
POSTGRES_PASSWORD=change-me
JWT_SECRET=change-me-to-a-long-random-string
BITRIX_ENCRYPTION_KEY=a-32-character-encryption-key-here
ADMIN_EMAIL=admin@system.com
ADMIN_PASSWORD=Admin@123456
```

---

## Admin Login

1. Open `http://localhost:3000`
2. Log in with the seeded admin credentials (or yours via env vars)
3. First configure **Bitrix Configuration** in the sidebar
4. Then go to **Inventory Import**

---

## Bitrix Configuration

The dashboard → **Bitrix Configuration** page lets the admin:

1. **Save Configuration** — stores the portal URL and webhook URL.
   - The webhook is **encrypted** with AES-256-GCM using `BITRIX_ENCRYPTION_KEY` before storage.
   - The webhook token is **never** returned by the API or shown in the UI.
2. **Test Connection** — calls a safe Bitrix endpoint, verifies the response, and stores the result as `CONNECTED` / `FAILED`.
3. Connection status and last-tested time are displayed.

### Webhook Format

A Bitrix24 **inbound webhook** looks like:

```
https://your-company.bitrix24.com/rest/1/abc123secret/
```

Generate it in Bitrix24: **Application → Webhooks → Inbound webhook**.

---

## Excel Format

Download the template from the dashboard (**Download Excel Template**), or use any file with these minimum columns:

| SKU    | Product Name | Quantity | Price | Barcode           |
|--------|--------------|---------:|------:|-------------------|
| 000123 | Product A    |      100 |   500 | 8901234567890     |
| 000124 | Product B    |      250 |   700 | 8901234567891     |

**Supported formats:** `.xlsx`, `.xls`, `.csv` (max size configurable, default 10 MB).

**Leading zeros are preserved.** SKU `000123` stays `000123` — identifiers are never coerced into JavaScript numbers.

> Refer to the referenced **Bitrix24 field schema** for the catalog/product/inventory field references. CRM/company fields (`UF_CRM_*`) are **not** used for inventory/product import.

---

## Invoice Import

The **Invoice Import** page (`/invoices/import`) imports an Excel/CSV of invoices into Bitrix24's classic invoice entity (`crm.invoice.*`).

| Excel Column      | Bitrix Field                 |
|-------------------|------------------------------|
| Invoice No        | `ACCOUNT_NUMBER` (match key) |
| Subject           | `ORDER_TOPIC`                |
| Customer / Client | `CLIENT`                     |
| Amount            | `PRICE`                      |
| Currency          | `CURRENCY`                   |
| Status            | `STATUS_ID`                  |
| Invoice Date      | `DATE_BILL`                  |
| Due Date          | `DATE_PAY_BEFORE`            |
| Notes             | `COMMENT`                    |

Statuses map to Bitrix invoice statuses: `N` New, `S` Sent, `P` Paid (→ `PAYED=Y`), `D` Unpaid.

Flow: upload → preview → map columns → confirm → queued and processed by the same worker pipeline (the job `type` is stored on the import record).

- **Existing invoices are matched by Invoice Number and UPDATEd** with the new values (in `CREATE_UPDATE` / `UPDATE_ONLY` modes).
- New invoices are **created** via `crm.invoice.add` when the webhook user has invoice permission.
- Missing invoice permission surfaces as a per-record `FAILED` with a clear, actionable message (no silent skips).

> **Note:** `crm.invoice.getFields` is not available on most portals, so the mapped field list is a fixed, supported subset. If creation reports *access denied*, grant the webhook's user **Invoices** access in Bitrix24 (CRM → Invoices permissions) — updates to existing invoices require the same permission on most plans.

Sample file: `sample-data/invoices_sample.csv`.

---

## Column Mapping

The import wizard automatically suggests mappings for common fields:

| Excel Column  | Bitrix Field                 |
|---------------|------------------------------|
| SKU           | Product Code (`CODE`)        |
| Product Name  | Name (`NAME`)                |
| Quantity      | Stock Quantity (`QUANTITY`)  |
| Price         | Base Price (`PRICE`)         |
| Barcode       | Barcode (`BARCODE`)          |

Automatic mapping can be reviewed/adjusted with dropdowns before import. Bitrix fields are loaded dynamically from your connected Bitrix portal via `catalog.product.getFields` and `catalog.storeproduct.getFields`.

---

## Import Process

1. **Upload** the Excel/CSV file.
2. **Preview** the data (file info, headers, first 50 rows).
3. **Map columns** to Bitrix fields.
4. **Validate** — per-row validation plus duplicate-SKU detection:
   ```
   Row 14: SKU is required.
   Row 25: Quantity must be numeric.
   Row 31: Price cannot be negative.
   Duplicate SKU ABC001 found in rows 2 and 15.
   ```
5. **Confirm** — summary of total/valid/invalid rows and the **Import Mode**:
   - `Create + Update` (default): create missing, update existing.
   - `Create Only`: only create missing products.
   - `Update Only`: only update existing products.
6. **Import** — the job is queued in Redis (BullMQ) and processed by a background worker with controlled concurrency.
7. **Result** — live progress (processed/successful/failed/skipped), then Import Details.

### Idempotency & Failure Recovery

- Products are matched by **SKU/product code/XML_ID** before any create, so re-importing never duplicates Bitrix products.
- Import state lives in PostgreSQL. If the worker crashes, records stay `PROCESSING`/`PENDING` and are re-processed on restart without duplicating success.
- `CREATE_UPDATE` + existing product → **update** (never duplicate).

---

## Retry Process

On **Import Details** (`/imports/:id`):

- **Download Error Report** – Excel file with columns `Row | SKU | Product | Status | Error`.
- **Retry Failed Records** – re-queues `FAILED` / `PARTIAL_FAILURE` **and** any records left `PENDING` by an interrupted run. Successful records are never duplicated.

If product creation succeeded but an optional field (e.g. price) could not be written, the record is marked `PARTIAL_FAILURE` (with the Bitrix product ID stored) so a retry updates it without creating another product.

> **Stock quantities:** some Bitrix24 plans ignore `quantity` writes via REST (`catalog.storeproduct.*` unavailable, `catalog.product.update` silently discards it). The worker probes this once per portal; on unsupported portals the field is skipped and rows still report `SUCCESS` (product + price are synced).

---

## API Documentation

Base URL: `http://localhost:5000/api`

### Authentication
| Method | Endpoint              | Description                          |
|--------|-----------------------|--------------------------------------|
| POST   | `/auth/login`         | Login (sets HTTP-only cookie + returns token) |
| POST   | `/auth/logout`        | Logout (clears cookie)               |
| GET    | `/auth/me`            | Current user                         |

### Dashboard
| Method | Endpoint            | Description                          |
|--------|---------------------|--------------------------------------|
| GET    | `/dashboard/stats`  | Aggregate statistics + recent imports|

### Bitrix Settings
| Method | Endpoint                    | Description                                  |
|--------|-----------------------------|----------------------------------------------|
| GET    | `/settings/bitrix`          | Current config (no webhook token exposed)    |
| POST   | `/settings/bitrix`          | Create/overwrite config (encrypts webhook)   |
| PUT    | `/settings/bitrix`          | Update config                                |
| DELETE | `/settings/bitrix`          | Deactivate config                            |
| POST   | `/settings/bitrix/test`     | Test connection, store status                |

### Bitrix Discovery
| Method | Endpoint                 | Description                       |
|--------|--------------------------|-----------------------------------|
| GET    | `/bitrix/catalogs`       | List connected catalogs           |
| GET    | `/bitrix/products/fields`| Product field schema              |
| GET    | `/bitrix/inventory/fields`| Inventory/store field schema     |
| GET    | `/bitrix/invoice-fields` | Invoice field schema + statuses   |

### Imports
| Method | Endpoint                        | Description                              |
|--------|---------------------------------|------------------------------------------|
| POST   | `/imports/upload`               | Upload Excel/CSV (multer, validated)     |
| POST   | `/imports/preview`              | Parse + preview file                     |
| POST   | `/imports`                      | Create import job + queue for processing |
| GET    | `/imports`                      | List imports (filter + pagination)       |
| GET    | `/imports/:id`                  | Import details + status counts           |
| GET    | `/imports/:id/errors`           | Failed records                           |
| GET    | `/imports/:id/error-report`     | Download error report (Excel)            |
| POST   | `/imports/:id/retry`            | Re-queue failed records                  |
| GET    | `/imports/template`             | Download Excel template                  |

### Health
| Method | Endpoint  | Description                                  |
|--------|-----------|----------------------------------------------|
| GET    | `/health` | `{ status, database, redis }`                |

### Response Format
```json
{ "success": true, "data": { } }
{ "success": false, "message": "Validation failed", "errors": [] }
```

---

## Bitrix API Methods Used

Only real Bitrix24 REST methods are used (no invented endpoints):

| Purpose                  | Bitrix method                     |
|--------------------------|-----------------------------------|
| Catalog discovery        | `catalog.catalog.list`            |
| Product field schema     | `catalog.product.getFields`       |
| Inventory field schema   | `catalog.storeproduct.getFields`  |
| List stores              | `catalog.store.list`              |
| Search product by code   | `catalog.product.list` (filter CODE/XML_ID) |
| Create product           | `catalog.product.add`             |
| Update product           | `catalog.product.update`          |
| Update store stock       | `catalog.storeproduct.add` / `.update` |
| Connection test          | `profile`                         |

**Invoice import (classic invoice entity):**
| Purpose                  | Bitrix method                     |
|--------------------------|-----------------------------------|
| Search invoice by number | `crm.invoice.list` (filter `ACCOUNT_NUMBER`) |
| Create invoice           | `crm.invoice.add`                 |
| Update invoice           | `crm.invoice.update`              |
| Invoice status values    | `crm.status.list` (`ENTITY_ID = INVOICE_STATUS`) |

If a capability isn't available on your installation, the error is stored per record (never silently ignored) and the webhook is never exposed in messages.

---

## Security

- **Helmet** security headers, rate limiting.
- **HTTP-only cookie** JWT auth (no tokens in localStorage).
- **bcrypt** password hashing.
- **AES-256-GCM** encryption for the Bitrix webhook (`BITRIX_ENCRYPTION_KEY`).
- Webhook never returned by the API, never logged, not stored in git or `.env`.
- **File validation** (extensions, size, path-traversal protection).
- Structured logging with secrets redacted (`pino`).
- Input validation with **Zod** across all endpoints.

---

## Production Deployment

```bash
# 1. Set production secrets
export JWT_SECRET=...
export BITRIX_ENCRYPTION_KEY=...
export POSTGRES_PASSWORD=...
export ADMIN_EMAIL=...
export ADMIN_PASSWORD=...

# 2. Build and run
docker compose up -d --build

# 3. Verify
docker compose ps
curl http://localhost:5000/health
```

### Hardening checklist
- Change `JWT_SECRET` and `BITRIX_ENCRYPTION_KEY` to long random values.
- Set strong `POSTGRES_PASSWORD`.
- Use HTTPS in front of nginx (TLS termination).
- Restrict exposed ports (5432/6379) to internal networks only.
- Keep `NODE_ENV=production`.

---

## Troubleshooting

### Prisma / OpenSSL errors in Docker
The backend image is Debian-based (`node:20-slim`) with OpenSSL installed, and the Prisma schema pins `binaryTargets = ["native", "debian-openssl-3.0.x"]`. If you change base images, regenerate Prisma:
```bash
npx prisma generate
docker compose build backend
```

### Backend can't reach Postgres/Redis
The backend connects via service names (`postgres`, `redis`) inside the compose network — never `localhost`.

### Migrations not applied
```bash
docker compose exec backend npx prisma migrate deploy
```

### Import jobs stuck in `PENDING` / `PROCESSING`
The worker runs inside the backend container. Check logs:
```bash
docker logs bitrix_inventory_backend
```
Restart the backend — BullMQ re-processes pending records (idempotent by SKU).

### Concerned the admin seed didn't run
The backend auto-creates the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` at startup if it doesn't exist.

---

## License

Internal project. Not licensed for redistribution.