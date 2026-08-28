/**
 * Placeholder shell — proves the Tauri window boots and can reach the local
 * database, not a port of the eleven web-app screens. See
 * docs/desktop-architecture.md §2 for what this pass is and isn't.
 */
import { useEffect, useState } from "react";
import { dbQuery } from "./bridge/local-db";

export function App() {
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbQuery<{ n: number }>("select count(*) as n from clients where deleted_at is null", [])
      .then((rows) => setClientCount(rows[0]?.n ?? 0))
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Freelance OS</h1>
      <p>Local-first shell — proving the plumbing, not the UI.</p>
      {error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : (
        <p>Clients in the local database: {clientCount ?? "…"}</p>
      )}
    </main>
  );
}
