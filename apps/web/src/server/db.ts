import { createDb, type Database } from "@emerge/db";

// One connection pool per process; survive Next.js dev-mode module reloads.
const globalForDb = globalThis as unknown as { db?: Database };

export const db: Database = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
