#!/usr/bin/env node
/**
 * Rotates app_user's password (see db/migrations/0004_app_role.sql for why
 * this role exists — never NEON_DSN pointing at the project owner role,
 * which has BYPASSRLS and makes every RLS policy in this schema a no-op).
 *
 * Run this once after applying migrations to a fresh database, and again
 * any time you want to rotate the app's credential. Prints the resulting
 * connection string — that's the value for NEON_DSN in .env.local (both the
 * web app's and desktop's, as VITE_NEON_DSN) — never for the admin scripts
 * (migrate-neon.mjs, create-user.mjs, whoami.mjs), which need the owner
 * credential's full DDL access.
 *
 * Usage:
 *   NEON_DSN=postgresql://<owner>... node scripts/set-app-role-password.mjs
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

async function main() {
  const ownerDsn = process.env.NEON_DSN;
  if (!ownerDsn) {
    console.error("Set NEON_DSN to your OWNER-level Neon connection string first.");
    process.exit(1);
  }

  const password = randomBytes(24).toString("hex");
  const sql = neon(ownerDsn);
  await sql.query(`alter role app_user with password '${password}'`);

  const appDsn = new URL(ownerDsn);
  appDsn.username = "app_user";
  appDsn.password = password;

  console.log("app_user's password has been rotated. New NEON_DSN:\n");
  console.log(appDsn.toString());
  console.log("\nPut this in .env.local (NEON_DSN) and desktop/.env.local (VITE_NEON_DSN).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
