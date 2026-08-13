import { APP_VERSION } from "@emerge/core";
import { publicProcedure, router } from "../trpc";
import { authRouter } from "./auth";
import { membersRouter } from "./members";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({
      pong: true,
      version: APP_VERSION,
      time: new Date().toISOString()
    }))
  }),
  auth: authRouter,
  workspace: workspaceRouter,
  members: membersRouter
});

export type AppRouter = typeof appRouter;
