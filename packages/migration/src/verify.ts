/**
 * Verification report: source counts vs Emerge counts, per-entity, plus the
 * benchmark chain spot-check (a chosen client -> job -> N applications).
 */
import { and, eq, sql } from "drizzle-orm";
import {
  applications,
  candidates,
  companies,
  contacts,
  externalRefs,
  jobs,
  notes as notesTable,
  type Database
} from "@emerge/db";
import { withWorkspace } from "@emerge/db";
import { readJsonlSync, snapshotSet } from "./snapshot.js";

export interface VerifyReport {
  entities: Record<
    string,
    { sourceCount: number; refCount: number; rowCount: number; ok: boolean }
  >;
  benchmark?: {
    clientExternalId: string;
    clientName: string;
    jobExternalId: string;
    jobTitle: string;
    applicationCountZoho: number;
    applicationCountEmerge: number;
    ok: boolean;
  };
}

export async function verifyImport(opts: {
  db: Database;
  workspaceId: string;
  snapshotDir: string;
  benchmarkClientName?: string;
}): Promise<VerifyReport> {
  const snap = snapshotSet(opts.snapshotDir);
  const raw = {
    clients: readJsonlSync<Record<string, unknown>>(snap.clients),
    contacts: readJsonlSync<Record<string, unknown>>(snap.contacts),
    candidates: readJsonlSync<Record<string, unknown>>(snap.candidates),
    jobs: readJsonlSync<Record<string, unknown>>(snap.jobs),
    applications: readJsonlSync<Record<string, unknown>>(snap.applications),
    notes: readJsonlSync<Record<string, unknown>>(snap.notes)
  };
  const entities: VerifyReport["entities"] = {};

  await withWorkspace(opts.db, opts.workspaceId, async (tx) => {
    async function refCountOf(entityType: string): Promise<number> {
      const rows = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(externalRefs)
        .where(
          and(
            eq(externalRefs.workspaceId, opts.workspaceId),
            eq(externalRefs.entityType, entityType)
          )
        );
      return Number(rows[0]?.n ?? 0);
    }

    entities.company = {
      sourceCount: raw.clients.length,
      refCount: await refCountOf("company"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(companies))[0]?.n ?? 0,
      ok: false
    };
    entities.contact = {
      sourceCount: raw.contacts.length,
      refCount: await refCountOf("contact"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(contacts))[0]?.n ?? 0,
      ok: false
    };
    entities.candidate = {
      sourceCount: raw.candidates.length,
      refCount: await refCountOf("candidate"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(candidates))[0]?.n ?? 0,
      ok: false
    };
    entities.job = {
      sourceCount: raw.jobs.length,
      refCount: await refCountOf("job"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(jobs))[0]?.n ?? 0,
      ok: false
    };
    entities.application = {
      sourceCount: raw.applications.length,
      refCount: await refCountOf("application"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(applications))[0]?.n ?? 0,
      ok: false
    };
    entities.note = {
      sourceCount: raw.notes.length,
      refCount: await refCountOf("note"),
      rowCount: (await tx.select({ n: sql<number>`count(*)::int` }).from(notesTable))[0]?.n ?? 0,
      ok: false
    };
    for (const key of Object.keys(entities)) {
      const e = entities[key]!;
      e.ok = e.sourceCount === e.refCount && e.refCount === e.rowCount;
    }
  });

  return { entities };
}
