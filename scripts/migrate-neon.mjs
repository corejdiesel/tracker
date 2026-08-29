#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql to a Neon database, in filename order.
 *
 * Neon has no built-in migration CLI (unlike Supabase's `supabase db push`),
 * and its HTTP driver only accepts one statement per call — Postgres itself
 * rejects a multi-statement string sent through the extended/prepared-
 * statement protocol the driver uses ("cannot insert multiple commands into
 * a prepared statement"), confirmed empirically, not assumed from docs. So
 * this splits each file into individual statements (respecting $$ ... $$
 * dollar-quoted bodies and -- line comments, so a semicolon inside either
 * doesn't get mistaken for a statement break) and runs each file as one
 * atomic transaction via sql.transaction(), so a mistake mid-file rolls
 * back the whole file rather than leaving a half-migrated schema behind.
 *
 * Usage (the OWNER-level connection string — these migrations run DDL,
 * including creating the app_user role in 0004_app_role.sql, which the app's
 * own restricted NEON_DSN cannot do):
 *   NEON_DSN=postgresql://<owner>... node scripts/migrate-neon.mjs
 *
 * Run scripts/set-app-role-password.mjs once afterward (also with the owner
 * DSN) to get the connection string that actually belongs in .env.local.
 *
 * Does NOT track which migrations have already run — there is no schema
 * history table (yet). Re-running an already-applied file will fail loudly
 * on "already exists" rather than silently skipping, which is deliberate:
 * a silent no-op on a file that's supposed to run exactly once is a worse
 * failure mode than a loud one.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function splitStatements(sqlText) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    const two = sqlText.slice(i, i + 2);
    if (!inDollarQuote && two === "--") {
      inLineComment = true;
      current += two;
      i++;
      continue;
    }
    if (two === "$$") {
      inDollarQuote = !inDollarQuote;
      current += two;
      i++;
      continue;
    }
    current += ch;
    if (ch === ";" && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
    }
  }
  const rest = current.trim();
  if (rest.length > 0) statements.push(rest);
  // Drop any "statement" that's only a comment (e.g. trailing file
  // commentary with no SQL after it) — not valid to send on its own.
  return statements.filter((s) => s.replace(/--[^\n]*/g, "").trim().length > 0);
}

async function main() {
  const dsn = process.env.NEON_DSN;
  if (!dsn) {
    console.error("Set NEON_DSN to your Neon connection string first.");
    process.exit(1);
  }

  const sql = neon(dsn);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const statements = splitStatements(readFileSync(join(migrationsDir, file), "utf8"));
    console.log(`applying ${file} (${statements.length} statements, one transaction)...`);
    await sql.transaction((txn) => statements.map((s) => txn.query(s)));
    console.log(`  ✓ ${file}`);
  }

  const tables = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  console.log(`\ndone — ${tables.length} tables in public: ${tables.map((t) => t.tablename).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
