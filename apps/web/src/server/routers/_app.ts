import { APP_VERSION } from "@emerge/core";
import { publicProcedure, router } from "../trpc";
import { aiRouter } from "./ai";
import { apiKeysRouter } from "./api-keys";
import { applicationsRouter } from "./applications";
import { attachmentsRouter } from "./attachments";
import { authRouter } from "./auth";
import { bulkRouter } from "./bulk";
import { candidatesRouter } from "./candidates";
import { companiesRouter } from "./companies";
import { complianceRouter } from "./compliance";
import { contactsRouter } from "./contacts";
import { dashboardRouter } from "./dashboard";
import { emailTemplatesRouter } from "./email-templates";
import { emailsRouter } from "./emails";
import { followsRouter } from "./follows";
import { interviewFeedbackRouter } from "./interview-feedback";
import { reportSchedulesRouter } from "./report-schedules";
import { reportsRouter } from "./reports";
import { interviewsRouter } from "./interviews";
import { jobsRouter } from "./jobs";
import { matchingRouter } from "./matching";
import { membersRouter } from "./members";
import { notesRouter } from "./notes";
import { notificationsRouter } from "./notifications";
import { offersRouter } from "./offers";
import { parsingRouter } from "./parsing";
import { placementsRouter } from "./placements";
import { revenueRouter } from "./revenue";
import { reviewsRouter } from "./reviews";
import { searchRouter } from "./search";
import { submissionsRouter } from "./submissions";
import { tagsRouter } from "./tags";
import { tasksRouter } from "./tasks";
import { timelineRouter } from "./timeline";
import { viewsRouter } from "./views";
import { webhooksRouter } from "./webhooks";
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
  apiKeys: apiKeysRouter,
  bulk: bulkRouter,
  workspace: workspaceRouter,
  matching: matchingRouter,
  members: membersRouter,
  companies: companiesRouter,
  compliance: complianceRouter,
  contacts: contactsRouter,
  candidates: candidatesRouter,
  jobs: jobsRouter,
  applications: applicationsRouter,
  interviews: interviewsRouter,
  interviewFeedback: interviewFeedbackRouter,
  dashboard: dashboardRouter,
  attachments: attachmentsRouter,
  tags: tagsRouter,
  notes: notesRouter,
  notifications: notificationsRouter,
  parsing: parsingRouter,
  offers: offersRouter,
  placements: placementsRouter,
  revenue: revenueRouter,
  reviews: reviewsRouter,
  emails: emailsRouter,
  emailTemplates: emailTemplatesRouter,
  follows: followsRouter,
  reports: reportsRouter,
  reportSchedules: reportSchedulesRouter,
  search: searchRouter,
  submissions: submissionsRouter,
  tasks: tasksRouter,
  timeline: timelineRouter,
  views: viewsRouter,
  webhooks: webhooksRouter
});

export type AppRouter = typeof appRouter;
