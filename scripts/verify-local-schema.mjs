// Verifies desktop/src-tauri/migrations/0001_local.sql against a real
// SQLite database (Node's built-in node:sqlite — no native module needed).
// Same discipline as the Postgres migrations: run it for real, then try to
// break every constraint and confirm it's rejected. Run with:
//   node scripts/verify-local-schema.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "desktop", "src-tauri", "migrations", "0001_local.sql");
const schema = readFileSync(schemaPath, "utf8");

const db = new DatabaseSync(":memory:");
db.exec(schema);
console.log("✓ schema applied cleanly");

let failures = 0;
function expectRejected(label, sql) {
  try {
    db.exec(sql);
    console.error(`✗ ${label} — expected rejection, but it was ACCEPTED`);
    failures++;
  } catch (err) {
    console.log(`✓ ${label} — rejected (${err.message.split("\n")[0]})`);
  }
}
function expectAccepted(label, sql) {
  try {
    db.exec(sql);
    console.log(`✓ ${label} — accepted`);
  } catch (err) {
    console.error(`✗ ${label} — expected acceptance, but got: ${err.message}`);
    failures++;
  }
}

const now = "2026-08-28T10:00:00.000Z";
expectAccepted(
  "seed a client and project",
  `insert into clients (id,name,created_at,updated_at) values ('c1','Alice Client','${now}','${now}');
   insert into projects (id,client_id,name,created_at,updated_at) values ('p1','c1','Homepage','${now}','${now}');`
);

expectRejected(
  "time entry with zero minutes",
  `insert into time_entries (id,project_id,worked_on,minutes,created_at,updated_at)
     values ('t1','p1','2026-08-26',0,'${now}','${now}');`
);
expectRejected(
  "time entry over 24h",
  `insert into time_entries (id,project_id,worked_on,minutes,created_at,updated_at)
     values ('t1','p1','2026-08-26',1441,'${now}','${now}');`
);
expectAccepted(
  "a valid time entry",
  `insert into time_entries (id,project_id,worked_on,minutes,created_at,updated_at)
     values ('t1','p1','2026-08-26',210,'${now}','${now}');`
);

expectRejected(
  "invoice with a bogus status",
  `insert into invoices (id,client_id,number,issue_date,due_date,created_at,updated_at)
     values ('i1','c1','INV-1','2026-08-01','2026-08-31','${now}','${now}')
     -- reuse the column check by attempting an update to a bad value:
  ; update invoices set status='bogus' where id='i1';`
);
expectAccepted(
  "a valid invoice, then a valid status transition",
  `insert into invoices (id,client_id,number,issue_date,due_date,created_at,updated_at)
     values ('i2','c1','INV-2','2026-08-01','2026-08-31','${now}','${now}');
   update invoices set status='sent' where id='i2';`
);

expectRejected(
  "a project referencing a client that doesn't exist",
  `insert into projects (id,client_id,name,created_at,updated_at)
     values ('p-bad','no-such-client','X','${now}','${now}');`
);

expectRejected(
  "an outbox row with no payload — payload is required for a delete too, since it's a soft-delete upsert",
  `insert into outbox (id,table_name,row_id,op,created_at) values ('o1','clients','c1','upsert','${now}');`
);
expectAccepted(
  "a valid outbox upsert and a valid outbox delete, both carrying a payload",
  `insert into outbox (id,table_name,row_id,op,payload,created_at) values ('o3','clients','c1','upsert','{}','${now}');
   insert into outbox (id,table_name,row_id,op,payload,created_at) values ('o4','clients','c1','delete','{"deleted_at":"${now}"}','${now}');`
);

expectAccepted(
  "sync_cursor upsert-by-replace pattern",
  `insert into sync_cursor (table_name,last_synced_at) values ('clients','${now}')
     on conflict (table_name) do update set last_synced_at = excluded.last_synced_at;`
);

db.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
