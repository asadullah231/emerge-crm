import { APP_VERSION } from "@emerge/core";
import { publicProcedure, router } from "../trpc";
import { aiRouter } from "./ai";
import { applicationsRouter } from "./applications";
import { attachmentsRouter } from "./attachments";
import { authRouter } from "./auth";
import { bulkRouter } from "./bulk";
import { candidatesRouter } from "./candidates";
import { companiesRouter } from "./companies";
import { contactsRouter } from "./contacts";
import { dashboardRouter } from "./dashboard";
import { jobsRouter } from "./jobs";
import { membersRouter } from "./members";
import { notesRouter } from "./notes";
import { notificationsRouter } from "./notifications";
import { parsingRouter } from "./parsing";
import { searchRouter } from "./search";
import { tagsRouter } from "./tags";
import { timelineRouter } from "./timeline";
import { viewsRouter } from "./views";
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
  ai: aiRouter,
  bulk: bulkRouter,
  workspace: workspaceRouter,
  members: membersRouter,
  companies: companiesRouter,
  contacts: contactsRouter,
  candidates: candidatesRouter,
  jobs: jobsRouter,
  applications: applicationsRouter,
  dashboard: dashboardRouter,
  attachments: attachmentsRouter,
  tags: tagsRouter,
  notes: notesRouter,
  notifications: notificationsRouter,
  parsing: parsingRouter,
  search: searchRouter,
  timeline: timelineRouter,
  views: viewsRouter
});

export type AppRouter = typeof appRouter;
