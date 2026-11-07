import { eq } from "drizzle-orm";
import { workspaces } from "@emerge/db";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth/current";
import type { SessionInfo } from "@/server/auth/sessions";

export type BdAccess = {
  session: SessionInfo | null;
  /** The workspace has the BD Outreach module switched on (Settings > Workspace). */
  enabled: boolean;
  /** Read-only members can look but not start, pause, rename or cancel anything. */
  canWrite: boolean;
};

/**
 * Who is looking at the BD module and what they may do. The module reads the
 * NocoDB BD base, so there is no row-level workspace scoping underneath: the
 * workspace flag is the only gate, and it is off for every workspace by default.
 */
export async function bdAccess(): Promise<BdAccess> {
  const session = await getCurrentSession();
  if (!session) return { session: null, enabled: false, canWrite: false };
  const [ws] = await db
    .select({ bdOutreach: workspaces.bdOutreach })
    .from(workspaces)
    .where(eq(workspaces.id, session.workspaceId))
    .limit(1);
  return {
    session,
    enabled: Boolean(ws?.bdOutreach),
    canWrite: session.role !== "readonly"
  };
}

/** Server actions call this first: a plain error is enough, the forms are not reachable without the flag. */
export async function assertBdWrite(): Promise<void> {
  const a = await bdAccess();
  if (!a.session) throw new Error("Sign in required");
  if (!a.enabled) throw new Error("BD Outreach is not enabled for this workspace");
  if (!a.canWrite) throw new Error("Read-only members cannot make changes");
}
