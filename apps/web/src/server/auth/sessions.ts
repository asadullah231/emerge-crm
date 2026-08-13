import { and, eq, lt } from "drizzle-orm";
import { memberships, sessions, users, type WorkspaceRole } from "@emerge/db";
import { db } from "../db";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "emerge_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
};

export type SessionInfo = {
  sessionId: string;
  workspaceId: string;
  role: WorkspaceRole;
  user: SessionUser;
  expiresAt: Date;
};

export async function createSession(
  userId: string,
  workspaceId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, workspaceId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

/**
 * Resolve a raw cookie token to a live session. Returns null when the token is
 * unknown, expired, or the membership was deactivated (access ends immediately).
 */
export async function validateSessionToken(token: string): Promise<SessionInfo | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      workspaceId: sessions.workspaceId,
      expiresAt: sessions.expiresAt,
      role: memberships.role,
      deactivatedAt: memberships.deactivatedAt,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone
      }
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, sessions.userId),
        eq(memberships.workspaceId, sessions.workspaceId)
      )
    )
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  if (row.deactivatedAt) return null;

  return {
    sessionId: row.sessionId,
    workspaceId: row.workspaceId,
    role: row.role,
    user: row.user,
    expiresAt: row.expiresAt
  };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Kill every session for a user (password reset, deactivation). */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping: drop expired sessions (called opportunistically). */
export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
