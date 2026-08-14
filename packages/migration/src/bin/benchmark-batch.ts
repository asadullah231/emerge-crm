#!/usr/bin/env tsx
/**
 * Latency benchmark: measure a single round-trip and compare to bulk-insert
 * throughput. Just prints numbers; writes nothing that survives.
 */
import { createDb } from "@emerge/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  try {
    // 1) single-statement round-trip
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    console.log(`select 1 round-trip: ${Date.now() - t0} ms`);

    const N = 10;
    const t1 = Date.now();
    for (let i = 0; i < N; i++) await db.execute(sql`select 1`);
    console.log(
      `select 1 x ${N} serially: ${Date.now() - t1} ms (${((Date.now() - t1) / N).toFixed(1)} ms avg)`
    );

    // 2) parallel round-trips
    const t2 = Date.now();
    await Promise.all(Array.from({ length: N }, () => db.execute(sql`select 1`)));
    console.log(`select 1 x ${N} in parallel: ${Date.now() - t2} ms`);
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
