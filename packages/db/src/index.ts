import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Create a Drizzle client. Callers own the lifecycle (call `close` on shutdown). */
export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return Object.assign(db, { close: () => client.end() });
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
