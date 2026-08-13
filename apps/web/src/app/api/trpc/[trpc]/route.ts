import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { readSessionCookie } from "@/server/auth/cookies";
import { validateSessionToken } from "@/server/auth/sessions";
import { db } from "@/server/db";
import { appRouter } from "@/server/routers/_app";
import type { TRPCContext } from "@/server/trpc";

async function createContext(): Promise<TRPCContext> {
  const token = await readSessionCookie();
  const session = token ? await validateSessionToken(token) : null;
  return { db, session };
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext
  });

export { handler as GET, handler as POST };
