#!/usr/bin/env node
/**
 * Creates one account directly in the `users` table.
 *
 * There is no signup UI by design — this is a single-operator app, so the
 * one account gets created once, out of band, rather than the app carrying
 * a whole registration flow for a user count of one.
 *
 * Usage:
 *   NEON_DSN=postgresql://... node scripts/create-user.mjs you@example.com 'your password'
 *
 * Hashing matches lib/auth/password.ts exactly (scrypt, salt:hash hex,
 * 64-byte derived key) — this script deliberately does not import that
 * module, since it runs as a plain Node script outside the Next.js app, so
 * the two are kept in step by hand. If you change the hash format there,
 * change it here too.
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function main() {
  const dsn = process.env.NEON_DSN;
  if (!dsn) {
    console.error("Set NEON_DSN to your Neon connection string first.");
    process.exit(1);
  }

  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: NEON_DSN=... node scripts/create-user.mjs you@example.com 'your password'");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Pick a password of at least 8 characters.");
    process.exit(1);
  }

  const sql = neon(dsn);
  const existing = await sql`select id from public.users where email = ${email}`;
  if (existing.length > 0) {
    console.error(`An account already exists for ${email}. Nothing changed.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await sql`
    insert into public.users (email, password_hash)
    values (${email}, ${passwordHash})
    returning id, email
  `;

  console.log(`Created account ${user.email} (${user.id}). Sign in at /login.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
