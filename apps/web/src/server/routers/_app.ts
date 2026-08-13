import { APP_VERSION } from "@emerge/core";
import { publicProcedure, router } from "../trpc";
import { authRouter } from "./auth";

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({
      pong: true,
      version: APP_VERSION,
      time: new Date().toISOString()
    }))
  }),
  auth: authRouter
});

export type AppRouter = typeof appRouter;
