import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Bookkeeping table proving the migration pipeline works (M0).
 * Real domain tables start in M1 (workspaces, users, ...).
 */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
