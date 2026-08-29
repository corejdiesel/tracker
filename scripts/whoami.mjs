#!/usr/bin/env node
/**
 * Prints the user id for an email in `public.users` — the value the desktop
 * app needs as `VITE_USER_ID` (see desktop/.env.example). `create-user.mjs`
 * already prints this once, at account creation; this is for looking it up
 * again later without having to scroll back for it.
 *
 * Usage — either connection string works here (a plain SELECT on `users`
 * is within app_user's grants, unlike create-user.mjs's INSERT):
 *   NEON_DSN=postgresql://... node scripts/whoami.mjs you@example.com
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const dsn = process.env.NEON_DSN;
  if (!dsn) {
    console.error("Set NEON_DSN to your Neon connection string first.");
    process.exit(1);
  }

  const [email] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: NEON_DSN=... node scripts/whoami.mjs you@example.com");
    process.exit(1);
  }

  const sql = neon(dsn);
  const [user] = await sql`select id from public.users where email = ${email}`;
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }
  console.log(user.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
