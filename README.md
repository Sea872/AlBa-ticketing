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

2. Create a PostgreSQL database (example):

   ```bash
   createdb concert_ticketing
   ```

3. Copy environment defaults and edit `DATABASE_URL`:

   ```bash
   cp .env.example .env
   ```

4. Install dependencies:

   ```bash
   npm install
   ```

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

## Database

- SQL migrations live in `src/db/migrations/` and are applied in filename order by `npm run migrate`.
- Applied versions are recorded in table `schema_migrations`.
- App code should use `getPool()` from `src/db/client/pool.js` (requires `DATABASE_URL`).
- `concerts.concert_date` stores the show date (PostgreSQL `date` type); other tables match `draft-plan.md` (`ticket_assignments`, `scan_logs`, etc.).

## Project layout

See `draft-plan.md` for phased delivery. Folders under `src/` mirror that plan (`routes`, `services`, `db`, `admin`, `webhooks`, `tickets`, `emails`, `checkin` for later phases).

## Environment

See `.env.example` for variables used as features land (database, Shopify, Resend, JWT).
