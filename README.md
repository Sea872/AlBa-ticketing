# Concert ticketing backend (Alba GB)

Node.js + Express API for Shopify-backed concert ticketing. **MVP** covers webhooks, tickets, QR email, admin APIs, and **check-in validation** (`POST /api/admin/check-in/scan`). A **mobile staff scan UI** remains post-MVP (see `draft-plan.md`).

## Conventions (project-wide)

- **camelCase** for functions, methods, variables, and exported names (e.g. `createApp`, `loadConfig`, `logInfo`).
- **kebab-case** for URL paths (e.g. `/health`, future `/api/...`).
- **UPPER_SNAKE** for environment variables in `.env` / `.env.example`.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- [PostgreSQL](https://www.postgresql.org/) 14+ (uses `gen_random_uuid()`)

## Local setup

1. Clone the repository and enter the project directory.

2. Copy environment defaults and set `DATABASE_URL` (include the database name you want, e.g. `concert_ticketing`):

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create the database once (PostgreSQL must have this DB before migrations can run). The app cannot connect to a database that does not exist yet, so use either:

   **Option A — npm (uses your `DATABASE_URL`, connects to `postgres` to create the app DB):**

   ```bash
   npm run db:create
   ```

   **Option B — PostgreSQL CLI:**

   ```bash
   createdb concert_ticketing
   ```

   On Windows, if `createdb` is missing, use Option A or create the database in pgAdmin.

5. Run migrations and seed a local admin user:

   ```bash
   npm run migrate
   npm run seed
   ```

   Override defaults with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` if needed. In `production`, the seed script refuses a default password unless `SEED_ADMIN_PASSWORD` is set.

6. Start the server:

   ```bash
   npm run dev
   ```

   For production-style run (no file watch):

   ```bash
   npm start
   ```

7. Verify health:

   ```bash
   curl -s http://localhost:8000/health
   ```

   You should see JSON with `"ok": true`.

Default HTTP port is **8000** (override with `PORT`).

### Admin authentication (JWT)

After `npm run seed`, obtain a token:

```bash
curl -s -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"YOUR_SEED_EMAIL\",\"password\":\"YOUR_SEED_PASSWORD\"}"
```

Use the returned `token` for protected routes:

```bash
curl -s http://localhost:8000/api/admin/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

- `POST /api/admin/login` — body: `{ "email", "password" }` → `{ ok, token, expiresIn, admin }`
- `POST /api/admin/logout` — no server-side session; clients discard the JWT
- `GET /api/admin/me` — requires `Authorization: Bearer <jwt>`

Set **`JWT_SECRET`** to a long random string in production (server refuses to start without it when `NODE_ENV=production`). Optional: **`JWT_EXPIRES_IN`** (default `7d`).

### Concerts (admin, JWT required)

All routes need `Authorization: Bearer <token>`.

| Method | Path | Body (JSON) |
|--------|------|-------------|
| `GET` | `/api/admin/concerts` | — optional query `?status=active` |
| `POST` | `/api/admin/concerts` | `name`, `concertDate` (`YYYY-MM-DD`), `venue`; optional `status` (default `active`) |
| `GET` | `/api/admin/concerts/:concertId` | — |
| `PATCH` | `/api/admin/concerts/:concertId` | any of `name`, `concertDate`, `venue`, `status` |

`status` must be one of: `active`, `finished`, `cancelled`.

### Shopify product links (admin, JWT required)

Link Shopify **product** IDs to a concert so webhooks can match line items later. **New links are only allowed while the concert is `active`.** Removing a link is allowed regardless of concert status.

| Method | Path | Body (JSON) |
|--------|------|-------------|
| `GET` | `/api/admin/concerts/:concertId/products` | — |
| `POST` | `/api/admin/concerts/:concertId/products` | `{ "shopifyProductId" }` (number or string; use `"string"` for very large ids) |
| `DELETE` | `/api/admin/concerts/:concertId/products/:linkId` | — (`linkId` is the UUID row id from `GET`) |

Duplicate `(concert, shopify_product_id)` returns **`409`** with `duplicate_link`. Inactive concert returns **`400`** with `concert_not_active`.

### Ticket email resend (admin, JWT required)

| Method | Path | Body (JSON) |
|--------|------|---------------|
| `POST` | `/api/admin/tickets/resend` | exactly one of `shopifyOrderId` (numeric order id) or `ticketId` (UUID) |

See **Ticket resend (admin, Phase 12)** below for behaviour, rate limits, and curl examples.

### Check-in / gate scan (admin, JWT required)

Validate a ticket QR at a specific concert (the **gate**). The QR must decode to JSON matching **`ticketQrService`** (`schemaVersion` **1**, `ticketId`, `concertId`, `shopifyOrderId`, `shopifyLineItemId`, `ticketIndex`).

| Method | Path | Body (JSON) |
|--------|------|-------------|
| `POST` | `/api/admin/check-in/scan` | **`concertId`** (UUID of the show at this entrance), plus **`qrPayload`** (object) **or** **`qr`** (string of JSON). Optional **`deviceInfo`**. |

The **`result`** field in the response is one of: **`valid`** (first entry; ticket marked `used`), **`already_used`**, **`wrong_event`** (ticket is for another concert), **`cancelled`**, **`invalid`** (unknown ticket, bad JSON, or tampered payload). Every attempt appends a row to **`scan_logs`**.

See **Check-in (Phase 14)** below for curl examples.

### Manual test guide (concerts)

With the server running (`npm run dev`), set shell variables (PowerShell examples):

```powershell
$base = "http://localhost:8000"
# Login — use the same email/password as in .env (SEED_*)
$r = Invoke-RestMethod -Method POST -Uri "$base/api/admin/login" -ContentType "application/json" -Body '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
$token = $r.token
$h = @{ Authorization = "Bearer $token" }

# List concerts
Invoke-RestMethod -Uri "$base/api/admin/concerts" -Headers $h

# Create concert
$body = '{"name":"Alba summer","concertDate":"2026-08-14","venue":"London","status":"active"}'
Invoke-RestMethod -Method POST -Uri "$base/api/admin/concerts" -Headers $h -ContentType "application/json" -Body $body

# Copy an `id` from the response, then:
$id = "PASTE_CONCERT_UUID"
Invoke-RestMethod -Uri "$base/api/admin/concerts/$id" -Headers $h
Invoke-RestMethod -Method PATCH -Uri "$base/api/admin/concerts/$id" -Headers $h -ContentType "application/json" -Body '{"status":"finished"}'
```

**Bash (curl):**

```bash
BASE=http://localhost:8000
TOKEN=$(curl -s -X POST "$BASE/api/admin/login" -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r .token)

curl -s "$BASE/api/admin/concerts" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/api/admin/concerts" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Alba summer","concertDate":"2026-08-14","venue":"London"}'
```

Expect `401` with no/invalid token; `400` for invalid JSON body or bad date; `404` for unknown concert id.

### Manual test guide (Shopify product links)

1. Complete **login** and create an **`active`** concert (see above); set `$id` / `$TOKEN` / `$h` / `$BASE`.
2. Link a Shopify product id (use a real id from your Shopify admin when integrated; for smoke tests use a fake numeric id like `123456789`):

```powershell
$linkBody = '{"shopifyProductId":123456789}'
Invoke-RestMethod -Method POST -Uri "$base/api/admin/concerts/$id/products" -Headers $h -ContentType "application/json" -Body $linkBody

Invoke-RestMethod -Uri "$base/api/admin/concerts/$id/products" -Headers $h
```

```bash
curl -s -X POST "$BASE/api/admin/concerts/$CONCERT_ID/products" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"shopifyProductId":"123456789"}'
curl -s "$BASE/api/admin/concerts/$CONCERT_ID/products" -H "Authorization: Bearer $TOKEN"
```

3. Copy a link `id` from the list response, then delete:

```powershell
$linkId = "PASTE_LINK_UUID"
Invoke-RestMethod -Method DELETE -Uri "$base/api/admin/concerts/$id/products/$linkId" -Headers $h
```

4. **Negative checks:** `POST` the same `shopifyProductId` twice → **`409`**. `PATCH` concert to `finished`, then `POST` a new link → **`400`** `concert_not_active`. Wrong `concertId` → **`404`**.

### Shopify `orders/paid` webhook (Phase 8)

- **URL to register in Shopify:** `https://tickets.albagb.com/webhooks/shopify/orders-paid` (or `http://localhost:8000/...` with a tunnel such as ngrok for local dev).
- **Method:** `POST`, body: raw JSON order object (Shopify sends the full order).
- **Headers:** `X-Shopify-Hmac-Sha256` (required), `X-Shopify-Topic: orders/paid` (optional; other topics are accepted with **`200`** and `ignored: true`).
- **Env:** set **`SHOPIFY_WEBHOOK_SECRET`** (preferred) or **`SHOPIFY_API_SECRET`** to your app’s **API secret key** used to verify the HMAC.

Behaviour: verifies HMAC → parses JSON → reads `id` → if already in **`processed_orders`**, returns **`200`** `{ duplicate: true }`. Otherwise, in one transaction: **`pg_advisory_xact_lock`** per order id → creates **`ticket_assignments`** for each seat on line items whose **`product_id`** matches an **`active`** concert’s linked **`concert_products`** row → inserts **`processed_orders`**. Response includes **`ticketsCreated`** (may be `0` if no matching products or missing email — see below). Invalid HMAC → **`401`** `invalid_hmac`.

If the order has **no `email` / `contact_email` / `customer.email`**, the run is still marked processed with **`ticketsCreated: 0`** and **`skippedReason: "missing_email"`** so Shopify does not retry forever.

### Manual test guide (Shopify webhook)

**Prerequisites:** `DATABASE_URL` set, migrations applied, **`SHOPIFY_WEBHOOK_SECRET`** (or **`SHOPIFY_API_SECRET`**) in `.env`, server running.

**1. Compute HMAC (same string you send as the body bytes):**

```bash
export BODY='{"id":987654321}'
export SECRET='paste_same_value_as_in_env'
export HMAC=$(node -e "const c=require('crypto');const b=process.env.BODY;const s=process.env.SECRET;process.stdout.write(c.createHmac('sha256',s).update(b,'utf8').digest('base64'))")
echo "$HMAC"
```

**2. POST the webhook (bash):**

```bash
curl -s -w "\nHTTP:%{http_code}\n" -X POST "http://localhost:8000/webhooks/shopify/orders-paid" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -H "X-Shopify-Topic: orders/paid" \
  -d "$BODY"
```

Expect **`200`** and `"processed":true`. Run the same `curl` again → **`200`** and `"duplicate":true`.

**3. Ticket extraction (Phase 9)**

1. Create an **`active`** concert and **`POST`** a **`concert_products`** link whose **`shopifyProductId`** matches a **`product_id`** you will put in the fake order (e.g. `888888888`).
2. Build a minimal order body with **`email`**, **`line_items`** with **`id`**, **`product_id`**, **`quantity`**:

```bash
export BODY='{"id":777001,"email":"buyer@example.com","line_items":[{"id":555001,"product_id":888888888,"quantity":2}]}'
export SECRET='paste_same_value_as_in_env'
export HMAC=$(node -e "const c=require('crypto');const b=process.env.BODY;const s=process.env.SECRET;process.stdout.write(c.createHmac('sha256',s).update(b,'utf8').digest('base64'))")
curl -s -X POST "http://localhost:8000/webhooks/shopify/orders-paid" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -H "X-Shopify-Topic: orders/paid" \
  -d "$BODY"
```

Expect **`ticketsCreated":2`** (or your quantity). Re-post the same body → **`duplicate":true`** and **no** extra rows.

3. **SQL check (optional):** `SELECT * FROM ticket_assignments WHERE shopify_order_id = 777001;`

4. **QR files (Phase 10):** After a successful webhook with tickets, PNGs are written under **`storage/tickets/<ticketId>.png`** (override with **`TICKET_STORAGE_DIR`**). The DB column **`qr_file_path`** holds a repo-relative path; **`qr_payload`** JSON includes **`schemaVersion`**, **`ticketId`**, **`concertId`**, **`shopifyOrderId`**, **`shopifyLineItemId`**, **`ticketIndex`**.

**5. Negative checks**

| Check | Expected |
|--------|----------|
| Wrong HMAC | **`401`**, `invalid_hmac` |
| Body not valid JSON | **`400`** |
| Missing `id` on order | **`400`** |
| Wrong `X-Shopify-Topic` (e.g. `orders/cancelled`) | **`200`**, `ignored: true` |
| Order without email fields | **`200`**, `ticketsCreated: 0`, `skippedReason: missing_email` |

**PowerShell:** set `$BODY`, `$SECRET`, then:

```powershell
$hmac = [Convert]::ToBase64String(
  [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($SECRET)).ComputeHash([Text.Encoding]::UTF8.GetBytes($BODY))
)
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/webhooks/shopify/orders-paid" `
  -ContentType "application/json" `
  -Headers @{ "X-Shopify-Hmac-Sha256" = $hmac; "X-Shopify-Topic" = "orders/paid" } `
  -Body $BODY
```

## Database

- The PostgreSQL **server** must exist and your user must be allowed to `CREATE DATABASE`. The app database itself is created with `npm run db:create` (or `createdb`) before `npm run migrate` — migrations cannot create the empty database because nothing can connect to it yet.
- SQL migrations live in `src/db/migrations/` and are applied in filename order by `npm run migrate` (includes email columns and **`email_resend_count`** on `ticket_assignments`).
- Applied versions are recorded in table `schema_migrations`.
- App code should use `getPool()` from `src/db/client/pool.js` (requires `DATABASE_URL`).
- `concerts.concert_date` stores the show date (PostgreSQL `date` type); other tables match `draft-plan.md` (`ticket_assignments`, `scan_logs`, etc.).

## Project layout

See `draft-plan.md` for phased delivery. Folders under `src/` mirror that plan (`routes`, `services`, `db`, `webhooks`, `emails`, etc.). Check-in logic lives in **`src/services/checkInService.js`**. **`docs/`** holds `runbook.md` and `nginx-example.conf`; **`scripts/`** includes `runBackup.js`; **`backups/`** is the default output for `npm run backup` (ignored in git except `.gitkeep`).

## Environment

See `.env.example` for variables used as features land (database, Shopify, Resend, JWT, ticket storage).

### Manual test guide (QR files)

After the **§3. Ticket extraction** webhook test (with `ticketsCreated` > 0), confirm files exist:

```bash
ls storage/tickets/*.png
```

Open a PNG with an image viewer; the QR should decode to JSON containing `ticketId` and `concertId`. If the DB transaction rolls back after a QR write, the app attempts to delete those PNGs (best-effort).

### Ticket email (Resend, Phase 11)

1. Run **`npm run migrate`** so `002_ticket_email_columns.sql` adds **`email_sent_at`**, **`email_last_error`**, **`email_provider_id`** on **`ticket_assignments`**.
2. Set **`RESEND_API_KEY`** in `.env` (from [Resend](https://resend.com/api-keys)). For first tests, **`RESEND_FROM`** can stay default **`Alba GB <onboarding@resend.dev>`** and **`to`** must be an address you can receive (Resend test limits apply).
3. Trigger a webhook that creates at least one ticket (same flow as §3). The JSON response should include **`emailSent": true`** and **`emailProviderId`** when send succeeds.
4. If **`RESEND_API_KEY`** is unset, the response includes **`emailSkipped": true`** and tickets are still created; **`email_sent_at`** stays null.
5. On failure, **`emailSent": false`** and **`emailError`** appear; DB rows get **`email_last_error`**.

**SQL:** `SELECT email_sent_at, email_last_error, email_provider_id FROM ticket_assignments ORDER BY created_at DESC LIMIT 3;`

### Ticket resend (admin, Phase 12)

1. Run **`npm run migrate`** so **`003_ticket_resend_count.sql`** adds **`email_resend_count`** (increments on each successful admin resend).
2. **`POST /api/admin/tickets/resend`** (JWT required). Body must include **exactly one** of:
   - **`shopifyOrderId`** — resend all tickets for that Shopify order (string or number, e.g. `777001`).
   - **`ticketId`** — resend a single ticket (UUID of **`ticket_assignments.id`**).
3. Requires **`RESEND_API_KEY`** (same as Phase 11). Subject line includes **(resent)** when sent via this endpoint.
4. In-memory **rate limit:** at most one resend per admin user per order or per ticket every **30 seconds** → **`429`** `rate_limited` if exceeded.
5. On success: **`200`** `{ ok: true, sent: true, shopifyOrderId, ticketCount, providerId }` and **`email_resend_count`** increases for each ticket row resent. On provider failure: **`200`** with **`sent: false`** and **`error`**. If Resend is not configured: **`200`** with **`skipped: true`**.

**Manual test (after a webhook created tickets for order `777001`):**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/admin/login -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r .token)

curl -s -X POST http://localhost:8000/api/admin/tickets/resend \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"shopifyOrderId":777001}'
```

Or resend one ticket: `-d '{"ticketId":"PASTE_TICKET_UUID"}'`.

**SQL:** `SELECT id, shopify_order_id, email_sent_at, email_resend_count FROM ticket_assignments WHERE shopify_order_id = 777001;`

## Backup, deployment, and operations (Phase 13)

- **Backups:** `npm run backup` writes a gzipped PostgreSQL dump and a tarball of the ticket storage directory under **`BACKUP_DIR`** (default **`backups/`**). Requires **`pg_dump`** and **`tar`** on your `PATH` (install `postgresql-client` on Ubuntu).
- **Runbook:** see **`docs/runbook.md`** for environment variables, Nginx + PM2 deployment, restore steps, cron example, pre–go-live test checklist, and operational flows (concerts, Shopify links, test purchase, email, event day).
- **Nginx:** example **`docs/nginx-example.conf`** (reverse proxy to the Node **`PORT`**).
- **PM2:** example **`ecosystem.config.cjs`** at the repo root.

### Check-in validation (Phase 14)

1. Obtain a ticket’s QR payload (decode the PNG or read **`ticket_assignments.qr_payload`**).
2. **`POST /api/admin/check-in/scan`** with **`concertId`** set to that ticket’s **`concert_id`** and **`qrPayload`** copied from the row (or stringified in **`qr`**).

```bash
TOKEN=... # from /api/admin/login
CONCERT_ID=... # UUID of the concert
# Minimal example — replace qrPayload with your ticket JSON
curl -s -X POST http://localhost:8000/api/admin/check-in/scan \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"concertId\":\"$CONCERT_ID\",\"qrPayload\":{\"schemaVersion\":1,\"ticketId\":\"TICKET_UUID\",\"concertId\":\"CONCERT_UUID\",\"shopifyOrderId\":\"1\",\"shopifyLineItemId\":\"1\",\"ticketIndex\":1}}"
```

3. Expect **`result":"valid"`** once; a second scan with the same payload returns **`already_used`**. Use a different **`concertId`** than the ticket’s concert to see **`wrong_event`**.

**SQL:** `SELECT * FROM scan_logs ORDER BY scanned_at DESC LIMIT 10;`
