import { createDb, type Database } from "@emerge/db";

// One connection pool per process; survive Next.js dev-mode module reloads.
const globalForDb = globalThis as unknown as { db?: Database };

function instance(): Database {
  return (globalForDb.db ??= createDb());
}

// Lazy proxy: `next build` imports this module while collecting page data in an
// environment without DATABASE_URL. The pool is only created on first real use.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const value = Reflect.get(instance() as object, prop);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance())
      : value;
  }
});
