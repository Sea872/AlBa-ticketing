# Concert ticketing backend (Alba GB)

Node.js + Express API for Shopify-backed concert ticketing. **MVP** covers webhooks, tickets, QR email, and admin APIs. **Check-in API and staff scan UI** are post-MVP (see `draft-plan.md`).

## Conventions (project-wide)

- **camelCase** for functions, methods, variables, and exported names (e.g. `createApp`, `loadConfig`, `logInfo`).
- **kebab-case** for URL paths (e.g. `/health`, future `/api/...`).
- **UPPER_SNAKE** for environment variables in `.env` / `.env.example`.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer

## Local setup

1. Clone the repository and enter the project directory.

2. Copy environment defaults:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm run dev
   ```

   For production-style run (no file watch):

   ```bash
   npm start
   ```

5. Verify health:

   ```bash
   curl -s http://localhost:3000/health
   ```

   You should see JSON with `"ok": true`.

## Project layout

See `draft-plan.md` for phased delivery. Folders under `src/` mirror that plan (`routes`, `services`, `db`, `admin`, `webhooks`, `tickets`, `emails`, `checkin` for later phases).

## Environment

See `.env.example` for variables used as features land (database, Shopify, Resend, JWT).
