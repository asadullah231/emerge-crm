import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Create a Drizzle client. Callers own the lifecycle (call `close` on shutdown). */
export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return Object.assign(db, { close: () => client.end() });
}

/**
 * Run `fn` inside a transaction locked to one workspace: the RLS role
 * (`emerge_app`) plus `app.workspace_id` are set with SET LOCAL, so every
 * query in the transaction is subject to the workspace_isolation policies.
 * This is the only sanctioned way to touch tenant-scoped tables.
 */
export async function withWorkspace<T>(
  db: Database,
  workspaceId: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    await tx.execute(sql`set local role emerge_app`);
    return fn(tx);
  });
}

/** Open a short-lived connection and run `select 1`. Throws when the DB is unreachable. */
export async function pingDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await client`select 1`;
  } finally {
    await client.end();
  }
}
