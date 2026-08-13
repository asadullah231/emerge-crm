import { readSessionCookie } from "./cookies";
import { validateSessionToken, type SessionInfo } from "./sessions";

/** Server-component helper: resolve the current session, or null. */
export async function getCurrentSession(): Promise<SessionInfo | null> {
  const token = await readSessionCookie();
  return token ? validateSessionToken(token) : null;
}
