/**
 * PostgreSQL dump (gzip) + ticket PNG directory tarball.
 * Requires `pg_dump` and `tar` on PATH (standard on Ubuntu VPS; Windows 10+ includes tar).
 * Usage: from project root with `.env` loaded — `npm run backup`
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { loadConfig } from "../src/config.js";

function backupStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

async function backupPostgres(databaseUrl, outFile) {
  const pgDump = spawn("pg_dump", ["--no-owner", "--no-acl", databaseUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  pgDump.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const gzip = createGzip();
  const write = createWriteStream(outFile);

  const spawnFailed = once(pgDump, "error").then(([err]) => {
    throw new Error(
      `pg_dump not found or failed to start (${err?.code ?? err}). Install PostgreSQL client tools (e.g. postgresql-client on Ubuntu) and ensure pg_dump is on PATH.`
    );
  });

  try {
    await Promise.race([spawnFailed, pipeline(pgDump.stdout, gzip, write)]);
  } catch (err) {
    pgDump.kill("SIGTERM");
    throw err;
  }

  const [code] = await once(pgDump, "close");
  if (code !== 0) {
    throw new Error(stderr.trim() || `pg_dump exited with code ${code}`);
  }
}

async function backupTicketFiles(ticketStorageDir, backupDir, stamp) {
  const { access, stat } = await import("node:fs/promises");
  try {
    await access(ticketStorageDir);
    const s = await stat(ticketStorageDir);
    if (!s.isDirectory()) {
      return { skipped: true, reason: "not_a_directory" };
    }
  } catch {
    return { skipped: true, reason: "missing" };
  }

  const outFile = path.join(backupDir, `tickets-${stamp}.tar.gz`);
  const parent = path.dirname(ticketStorageDir);
  const base = path.basename(ticketStorageDir);

  await new Promise((resolve, reject) => {
    const p = spawn("tar", ["-czf", outFile, "-C", parent, base], {
      stdio: "inherit",
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });
  });

  return { skipped: false, outFile };
}

async function main() {
  const { databaseUrl, ticketStorageDir } = loadConfig();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? "backups");
  await mkdir(backupDir, { recursive: true });

  const stamp = backupStamp();
  const pgOut = path.join(backupDir, `pg-${stamp}.sql.gz`);

  console.log(`Backup directory: ${backupDir}`);
  console.log(`PostgreSQL → ${pgOut}`);

  await backupPostgres(databaseUrl, pgOut);
  console.log("pg_dump: ok");

  const ticketResult = await backupTicketFiles(ticketStorageDir, backupDir, stamp);
  if (ticketResult.skipped) {
    console.log(`Ticket files: skipped (${ticketResult.reason})`);
  } else {
    console.log(`Ticket files: ok → ${ticketResult.outFile}`);
  }

  console.log("Backup finished.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
