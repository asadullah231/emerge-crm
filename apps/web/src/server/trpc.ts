import { initTRPC } from "@trpc/server";
import superjson from "superjson";

// Session and workspace context arrive in M1.
export type TRPCContext = Record<string, never>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson
});

export const router = t.router;
export const publicProcedure = t.procedure;
