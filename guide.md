# Alba GB concert ticketing — preparation & integration guide

This document is the **single checklist** for getting the project ready, wiring **Shopify**, and **testing** the full flow. Deep API tables and extra examples live in **`README.md`**; production deployment and backups are in **`docs/runbook.md`**.

---

## 1. What to prepare (before integration)

### Accounts and access

| Item | Why |
|------|-----|
| **PostgreSQL** (local or hosted) | Required for migrations, app, and backups. |
| **Node.js 18+** | Runtime (`npm install`, `npm run dev`). |
| **Shopify storefront** — [albaguitarbeads.com](https://albaguitarbeads.com/) | Customers browse and buy ticket products here (checkout, `orders/paid`). |
| **Shopify custom app** (Admin API) | Webhook signing secret, optional `read_orders` / `read_products` for admin tasks. |
| **Resend account** (optional for QR-only tests) | Ticket emails; without it, tickets still create with `emailSkipped`. |
| **Domain + HTTPS** (production) | Public webhook URL and **`/staff/check-in`** camera (browsers often require HTTPS for camera). |

### Information to collect

| Value | Where it goes |
|-------|----------------|
| **Database URL** | `DATABASE_URL` in `.env` |
| **App API secret** (Shopify custom app) | `SHOPIFY_WEBHOOK_SECRET` or `SHOPIFY_API_SECRET` — must match what you use to verify HMAC |
| **Resend API key** + verified **from** address | `RESEND_API_KEY`, `RESEND_FROM` |
| **Long random string** | `JWT_SECRET` (required when `NODE_ENV=production`) |
| **Ticket product IDs** (numeric) | Linked to concerts via admin API (`shopifyProductId`) |

### Local machine setup (once)

1. Copy **`.env.example`** → **`.env`** and set `DATABASE_URL`.
2. `npm install`
3. Create DB: `npm run db:create` (or `createdb`), then `npm run migrate`, `npm run seed`
4. `npm run dev` (or `npm start`)
5. **Health:** `GET http://localhost:8000/health` → `ok: true`

See **`README.md` → Local setup** for step-by-step.

---

## 2. Environment variables (quick reference)

Full comments are in **`.env.example`**. Minimum for a working stack:

| Variable | Required for | Notes |
|----------|----------------|-------|
| `DATABASE_URL` | DB, migrate, seed, backup | Include database name. |
| `SHOPIFY_WEBHOOK_SECRET` or `SHOPIFY_API_SECRET` | HMAC verification on `orders/paid` | Use the **same** secret Shopify uses to sign the webhook. |
| `JWT_SECRET` | Admin JWT | **Mandatory** in production. |
| `RESEND_API_KEY` | Sending ticket emails | Optional; omit to skip email (tickets still created). |
| `RESEND_FROM` | Email sender | Must be verified in Resend for production. |
| `PORT` | HTTP port | Default `8000`; Nginx must proxy to this. |
| `TICKET_STORAGE_DIR` | QR PNG files | Default `storage/tickets`. |
| `BACKUP_DIR` | `npm run backup` | Default `backups`. |

Optional: `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN` — not required for the webhook path itself (webhook is push-only), but useful if you later add Admin API scripts. For this store, the public storefront is **`https://albaguitarbeads.com/`**; the Shopify admin domain for your app is usually `https://admin.shopify.com/store/<your-store-handle>`.

**Debugging logs:** set **`DEBUG_TICKETING=1`** or **`LOG_LEVEL=debug`** in `.env` to print **`DEBUG`** lines (per–line-item product matching, webhook `X-Shopify-*` context). Production defaults omit those; **`INFO` / `WARN` / `ERROR`** still include order id, shop domain, webhook id, and ticket counts where applicable.

---

## 3. Shopify integration — storefront, webhook URL, secret, and flow

### Storefront vs ticketing backend

| What | URL / note |
|------|------------|
| **Shopify storefront (customer-facing)** | [https://albaguitarbeads.com/](https://albaguitarbeads.com/) — ticket products, cart, checkout. |
| **This Node app (webhook + admin API)** | Deployed on **your own host** (HTTPS). The webhook URL is **not** the storefront URL; Shopify sends `POST` requests to your **backend** hostname. |

### 3.1 Endpoint on this backend

| Item | Value |
|------|--------|
| **HTTP method** | `POST` |
| **Path** | `/webhooks/shopify/orders-paid` |
| **Full URL (production)** | `https://<your-backend-host>/webhooks/shopify/orders-paid` — use the DNS name that points to the VPS running this app (e.g. `tickets.albagb.com` or `api.yourdomain.com`). |
| **Full URL (local + tunnel)** | `https://<your-ngrok-subdomain>.ngrok.io/webhooks/shopify/orders-paid` |

The app mounts the webhook router **before** `express.json()` so the **raw body** is available for HMAC verification — do not change that order without updating the webhook service.

### 3.2 Register the webhook in Shopify

1. **Shopify Admin** → **Settings** → **Apps and sales channels** → **Develop apps** (or your custom app).
2. Create or open your **custom app**; note the **API secret key** (client secret) — this is what you use to verify `X-Shopify-Hmac-Sha256`.
3. Under **Webhooks** (or **Event subscriptions** in Partner Dashboard), add a subscription:
   - **Topic:** `orders/paid` (Order payment)
   - **URL:** your public HTTPS URL above
   - **Format:** JSON
4. Shopify will deliver **POST** requests with header **`X-Shopify-Hmac-Sha256`**.

### 3.3 Set the secret in `.env`

Put the same secret used for signing:

```env
SHOPIFY_WEBHOOK_SECRET=your_shopify_app_api_secret
```

If you only set `SHOPIFY_API_SECRET`, the app will fall back to it for HMAC verification (see `src/config.js`).

### 3.4 Product → concert mapping (required for tickets)

The webhook only creates tickets when:

- The order has a **customer email** (or equivalent field on the order).
- A **line item**’s **`product_id`** matches a row in **`concert_products`** for an **`active`** concert.

So you must:

1. **Create a concert** via `POST /api/admin/concerts` (JWT).
2. **Link** the Shopify **product ID** (numeric) via `POST /api/admin/concerts/:concertId/products` with `{ "shopifyProductId": <id> }`.

Use the real product ID from **Shopify Admin → Products → product** (in the URL or “API” / bulk editor if needed).

### 3.5 Local development without a public URL

Shopify cannot reach `localhost`. Use a tunnel (e.g. **ngrok**, **Cloudflare Tunnel**):

1. Run your app on `localhost:8000`.
2. Start a tunnel: `ngrok http 8000` → copy the **https** URL.
3. Register webhook URL: `https://xxxx.ngrok-free.app/webhooks/shopify/orders-paid`
4. Put the same `SHOPIFY_WEBHOOK_SECRET` in `.env` as in the Shopify app.

---

## 4. Test guide (recommended order)

Run these after **`npm run migrate`**, **`npm run seed`**, and server start. Use **`README.md`** for copy-paste curl blocks where noted.

### Phase A — Core API

| Step | What to verify |
|------|----------------|
| A1 | `GET /health` → `ok: true` |
| A2 | `POST /api/admin/login` with seed email/password → `token` |
| A3 | `GET /api/admin/me` with `Authorization: Bearer <token>` → `200` |

### Phase B — Concerts and product links

| Step | What to verify |
|------|----------------|
| B1 | `POST /api/admin/concerts` creates an **active** concert |
| B2 | `POST /api/admin/concerts/:id/products` with `shopifyProductId` → link created |
| B3 | Duplicate `shopifyProductId` for same concert → **409** `duplicate_link` |

### Phase C — Webhook (HMAC + idempotency)

| Step | What to verify |
|------|----------------|
| C1 | Minimal `POST` with body `{"id":987654321}` and valid HMAC → **200** `processed` (see **README → Manual test guide (Shopify webhook)**) |
| C2 | Same body again → **200** `duplicate: true` |
| C3 | Wrong HMAC → **401** `invalid_hmac` |

### Phase D — Tickets (order with matching product)

| Step | What to verify |
|------|----------------|
| D1 | `concert_products` link uses the same **`product_id`** as in the fake order JSON |
| D2 | Order JSON includes **`email`** and **`line_items`** with **`id`**, **`product_id`**, **`quantity`** |
| D3 | Response includes **`ticketsCreated`** > 0 |
| D4 | SQL: `SELECT * FROM ticket_assignments WHERE shopify_order_id = <order_id>;` |
| D5 | PNGs under `storage/tickets/` (or `TICKET_STORAGE_DIR`) |

### Phase E — Email (Resend)

| Step | What to verify |
|------|----------------|
| E1 | `RESEND_API_KEY` set → webhook response includes **`emailSent": true`** when send succeeds |
| E2 | No key → **`emailSkipped": true`**, tickets still created |
| E3 | `SELECT email_sent_at, email_last_error FROM ticket_assignments ...` |

### Phase F — Resend admin

| Step | What to verify |
|------|----------------|
| F1 | `POST /api/admin/tickets/resend` with `shopifyOrderId` or `ticketId` → **200**; `email_resend_count` increases |

### Phase G — Check-in

| Step | What to verify |
|------|----------------|
| G1 | `POST /api/admin/check-in/scan` with correct `concertId` + QR payload → **`result":"valid"`** |
| G2 | Second scan → **`already_used`** |
| G3 | `GET /staff/check-in` in browser (HTTPS in prod) — login, camera or paste, same result states |
| G4 | `SELECT * FROM scan_logs ORDER BY scanned_at DESC LIMIT 10;` |

### Phase H — Ops (production)

| Step | What to verify |
|------|----------------|
| H1 | `npm run backup` produces `pg-*.sql.gz` and `tickets-*.tar.gz` (needs `pg_dump` + `tar`) |
| H2 | Nginx + PM2 per **`docs/runbook.md`** and **`docs/nginx-example.conf`** |

---

## 5. Integration checklist (production go-live)

Use this as a final sign-off before real customers buy tickets.

- [ ] **HTTPS** live at your **backend** host (where this app runs), not necessarily the storefront domain.
- [ ] **Webhook URL** in Shopify points to **`https://<your-backend-host>/webhooks/shopify/orders-paid`** (same secret as **`SHOPIFY_WEBHOOK_SECRET`** in `.env`).
- [ ] **`SHOPIFY_WEBHOOK_SECRET`** (or `SHOPIFY_API_SECRET`) matches the Shopify app secret.
- [ ] **`JWT_SECRET`** set; `NODE_ENV=production` where appropriate.
- [ ] **Resend** domain/`RESEND_FROM` verified for production sending.
- [ ] **At least one concert** is **active** and **product links** match real ticket products.
- [ ] **Test order** on a hidden/draft product: tickets + email + optional resend + check-in.
- [ ] **Backups** scheduled (`cron` + `npm run backup`) and restore tested on a copy.

---

## 6. Where to look next

| Doc | Contents |
|-----|----------|
| **`README.md`** | Full API tables, curl/PowerShell examples, SQL snippets |
| **`docs/runbook.md`** | Nginx, PM2, restore, cron, operational flows |
| **`.env.example`** | All env vars with comments |

If something fails, first check: **`DATABASE_URL`**, webhook **secret matches**, **concert** is **active**, **product link** matches **line item `product_id`**, and order has **email**.
