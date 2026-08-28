import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * scrypt via Node's own `node:crypto` — no dependency, and scrypt is
 * specifically designed to be expensive to brute-force in hardware (unlike
 * a fast general-purpose hash), which is the property a password hash
 * needs. Stored as `salt:hash`, both hex, so one column holds everything
 * verification needs — no separate salt column to keep in sync.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Timing-safe comparison — a plain `===` on the derived hashes would leak
 * how many leading bytes matched via response-time differences, which is
 * exactly the side channel a password check must not have.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
