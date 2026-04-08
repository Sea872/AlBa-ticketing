# Operations runbook — Alba GB concert ticketing (MVP)

Use this document for deployment, backups, restore, and day-to-day operations without needing the original developer.

## Environment variables

All variables are documented in **`.env.example`** at the repository root. Copy to **`.env`** on the server and set at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required for app, migrate, seed, backup) |
| `JWT_SECRET` | Long random string for admin JWT signing (**required** when `NODE_ENV=production`) |
| `SHOPIFY_WEBHOOK_SECRET` or `SHOPIFY_API_SECRET` | HMAC verification for `orders/paid` webhooks |
| `RESEND_API_KEY` | Ticket email delivery (optional for QR-only tests; required for customer emails) |
| `RESEND_FROM` | Verified sender in Resend for production |
| `PORT` | HTTP port the Node app listens on (default **8000**; Nginx proxies to this) |
| `TICKET_STORAGE_DIR` | Directory for QR PNG files (default **`storage/tickets`**, relative to app cwd) |
| `BACKUP_DIR` | Where **`npm run backup`** writes files (default **`backups`** under project root) |

Optional: `SEED_*` (local seed only), `POSTGRES_ADMIN_DATABASE` (for `npm run db:create`), `JWT_EXPIRES_IN`.

## VPS deployment (Ubuntu + Nginx + PM2)

Assumptions: Node 18+, PostgreSQL, Git clone of this repo, DNS for **your backend host** (the server running this app) pointing at the VPS. The Shopify storefront is [https://albaguitarbeads.com/](https://albaguitarbeads.com/); that is separate from the hostname you use for webhooks and admin API unless you intentionally serve this app on the same domain.

1. **Install system dependencies**

   ```bash
   sudo apt update && sudo apt install -y nginx postgresql postgresql-client
   ```

   `postgresql-client` provides **`pg_dump`** for backups.

2. **Create database and user** (adjust names/passwords as needed), then set **`DATABASE_URL`** in **`.env`**.

3. **Install app and run migrations**

   ```bash
   cd /path/to/concert-ticketing
   npm ci --omit=dev
   npm run migrate
   ```

   Seed an admin only if appropriate (avoid default passwords in production):

   ```bash
   SEED_ADMIN_PASSWORD='...' npm run seed
   ```

4. **Set production env** — `NODE_ENV=production`, **`JWT_SECRET`**, Shopify secrets, Resend, etc.

5. **Start with PM2** (see **`ecosystem.config.cjs`** in the repo root):

   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

6. **Nginx** — add a `server` block for your domain and include a **location /** proxy to `127.0.0.1:PORT` (see **`docs/nginx-example.conf`**). Reload:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

7. **TLS** — typically via Cloudflare or Let’s Encrypt in front of Nginx; ensure HTTPS for public URLs and Shopify webhooks.

8. **Shopify** — register the webhook URL `https://<your-backend-host>/webhooks/shopify/orders-paid` with the same signing secret as in **`.env`**. (Storefront: [albaguitarbeads.com](https://albaguitarbeads.com/).)

## Backups

### Automated dump + ticket files

From the project directory (with **`.env`** loaded):

```bash
npm run backup
```

This writes:

- **`pg-<timestamp>.sql.gz`** — full logical dump of the database (`pg_dump` piped to gzip).
- **`tickets-<timestamp>.tar.gz`** — tarball of the ticket storage directory (same path as **`TICKET_STORAGE_DIR`**), if the directory exists.

Override output directory:

```bash
BACKUP_DIR=/var/backups/concert-ticketing npm run backup
```

**Requirements:** `pg_dump` and `tar` on `PATH` (Linux VPS; Windows 10+ includes `tar`).

### Nightly cron (example)

Run as the deploy user that owns the app and **`.env`**:

```cron
0 2 * * * cd /path/to/concert-ticketing && /usr/bin/env npm run backup >> /var/log/concert-ticketing-backup.log 2>&1
```

Rotate or prune old files under **`BACKUP_DIR`** according to your retention policy (not automated in-repo).

## Restore

### PostgreSQL

1. Stop the app or put it in maintenance mode if you need a strict cutover.
2. Decompress and apply the dump (plain SQL inside gzip):

   ```bash
   gunzip -c /path/to/pg-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
   ```

   Or create an empty database first, then point **`DATABASE_URL`** at it and run the command above.

3. Restart the app and verify **`GET /health`**.

### Ticket PNGs

1. Extract the tarball to a temporary path and inspect:

   ```bash
   tar -xzf tickets-YYYYMMDD-HHMMSS.tar.gz -C /tmp/restore-tickets
   ```

2. Copy the contents into **`TICKET_STORAGE_DIR`** so paths match **`ticket_assignments.qr_file_path`** in the database (usually relative paths under **`storage/tickets`**).

If DB and files are from different nights, some QR files may be missing or extra; prefer restoring dumps and ticket archives from the **same** backup window when possible.

## Operational flows

### Create a concert

1. Log in: **`POST /api/admin/login`** with admin email/password.
2. Use **`POST /api/admin/concerts`** with `name`, `concertDate` (`YYYY-MM-DD`), `venue`, optional `status` (default `active`).

### Link Shopify products

1. **`POST /api/admin/concerts/:concertId/products`** with `{ "shopifyProductId": <id> }`.
2. Only **active** concerts accept new links.

### Test purchase (staging / non-public product)

1. Use a **development** or draft product so real customers do not buy it, or use a separate Shopify store.
2. Complete checkout so Shopify sends **`orders/paid`** to your webhook URL.
3. Confirm the response includes **`ticketsCreated`** (and **`emailSent`** if Resend is configured).

### Check email delivery

1. Inspect **`ticket_assignments`** (`email_sent_at`, `email_last_error`, `email_provider_id`).
2. If failed, fix Resend/domain configuration and use **`POST /api/admin/tickets/resend`** with `shopifyOrderId` or `ticketId`.

### Event day (MVP)

- **Gate check-in:** **`POST /api/admin/check-in/scan`** with **`concertId`** (the show at this entrance) and **`qrPayload`** or **`qr`** (JSON string from the ticket QR). Use an admin JWT; responses include **`result`**: `valid`, `already_used`, `wrong_event`, `cancelled`, or `invalid`. Rows are recorded in **`scan_logs`**. A **browser UI** is available at **`https://<your-host>/staff/check-in`** (HTTPS helps **`getUserMedia`** on phones). It uses the same admin login and loads a QR reader from **unpkg**; see **`README.md`** (Phase 15).
- Monitor app logs and Nginx error logs; **`GET /health`** for uptime checks.

## Testing checklist (pre–go-live)

Use this as a sign-off list. Details and curl examples are in **`README.md`**.

| # | Check | Expected |
|---|--------|----------|
| 1 | Health | **`GET /health`** returns `ok: true` |
| 2 | Admin auth | Login and **`GET /api/admin/me`** with JWT |
| 3 | Full order flow | Webhook with matching product creates tickets + QR files + email (if Resend set) |
| 4 | Duplicate webhook | Same `orders/paid` body twice → second response **`duplicate: true`**, no new tickets |
| 5 | Email failure | With invalid Resend key or blocked send, tickets still created; **`email_last_error`** set; admin can **resend** after fix |
| 6 | Resend | **`POST /api/admin/tickets/resend`** succeeds and increments **`email_resend_count`** |
| 7 | Duplicate scan | Second **`POST .../check-in/scan`** with same ticket at same gate → **`already_used`**; **`scan_logs`** has two rows |

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| `401` on webhook | HMAC secret matches Shopify app; raw body preserved (route order in `createApp.js`) |
| `ticketsCreated: 0` | Concert `active`, product linked, `product_id` on line item matches, customer email present |
| No email | `RESEND_API_KEY`, **`RESEND_FROM`** domain verification, Resend dashboard logs |
| Backup fails | `pg_dump` installed; `DATABASE_URL` correct; disk space; `tar` available |

## Related files

| File | Purpose |
|------|---------|
| `README.md` | Local setup, API tables, manual test guides |
| `.env.example` | Variable list and comments |
| `ecosystem.config.cjs` | PM2 |
| `docs/nginx-example.conf` | Nginx reverse proxy snippet |
| `scripts/runBackup.js` | Backup implementation |
| `src/services/checkInService.js` | Gate scan / ticket validation |
