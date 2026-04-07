# Concert ticketing backend (Alba GB)

Node.js + Express API for Shopify-backed concert ticketing. **MVP** covers webhooks, tickets, QR email, and admin APIs. **Check-in API and staff scan UI** are post-MVP (see `draft-plan.md`).

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

## Database

- The PostgreSQL **server** must exist and your user must be allowed to `CREATE DATABASE`. The app database itself is created with `npm run db:create` (or `createdb`) before `npm run migrate` — migrations cannot create the empty database because nothing can connect to it yet.
- SQL migrations live in `src/db/migrations/` and are applied in filename order by `npm run migrate`.
- Applied versions are recorded in table `schema_migrations`.
- App code should use `getPool()` from `src/db/client/pool.js` (requires `DATABASE_URL`).
- `concerts.concert_date` stores the show date (PostgreSQL `date` type); other tables match `draft-plan.md` (`ticket_assignments`, `scan_logs`, etc.).

## Project layout

See `draft-plan.md` for phased delivery. Folders under `src/` mirror that plan (`routes`, `services`, `db`, `admin`, `webhooks`, `tickets`, `emails`, `checkin` for later phases).

## Environment

See `.env.example` for variables used as features land (database, Shopify, Resend, JWT).
