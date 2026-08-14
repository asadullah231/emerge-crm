import { APP_VERSION } from "@emerge/core";
import { publicProcedure, router } from "../trpc";
import { attachmentsRouter } from "./attachments";
import { authRouter } from "./auth";
import { candidatesRouter } from "./candidates";
import { companiesRouter } from "./companies";
import { contactsRouter } from "./contacts";
import { membersRouter } from "./members";
import { tagsRouter } from "./tags";
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
  members: membersRouter,
  companies: companiesRouter,
  contacts: contactsRouter,
  candidates: candidatesRouter,
  attachments: attachmentsRouter,
  tags: tagsRouter
});

export type AppRouter = typeof appRouter;
