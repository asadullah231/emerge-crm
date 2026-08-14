#!/usr/bin/env tsx
/**
 * Idempotent-ish helper: creates a fresh workspace named "Zoho Import Staging
 * <ts>" and prints its uuid. Used for Phase B.
 */
import { createDb, workspaces } from "@emerge/db";

async function main() {
  const db = createDb();
  try {
    const name = `Zoho Import Staging ${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const [ws] = await db
      .insert(workspaces)
      .values({ name })
      .returning({ id: workspaces.id, name: workspaces.name });
    if (!ws) throw new Error("insert failed");
    console.log(`WORKSPACE_ID=${ws.id}`);
    console.log(`NAME=${ws.name}`);
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
