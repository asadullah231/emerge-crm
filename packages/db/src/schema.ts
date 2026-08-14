import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * Bookkeeping table proving the migration pipeline works (M0).
 */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// M1: auth, workspaces, users, roles
// Conventions (docs/database.md): UUID v7 ids (app-generated), timestamptz,
// workspace_id on every tenant-scoped table, RLS policies in migrations.
// ---------------------------------------------------------------------------

export const workspaceRole = pgEnum("workspace_role", ["admin", "recruiter", "readonly"]);
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Global accounts. Email is stored lowercased; the app normalizes before insert. */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)]
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

/** User x workspace x role. Deactivation is membership-level, not account-level. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex("memberships_workspace_user_unique").on(t.workspaceId, t.userId),
    index("memberships_user_idx").on(t.userId)
  ]
);

/** Pending invites. Only the SHA-256 hash of the invite token is stored. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("invitations_token_hash_unique").on(t.tokenHash),
    index("invitations_workspace_idx").on(t.workspaceId)
  ]
);

/** DB-backed sessions. Only the SHA-256 hash of the session token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The workspace this session is acting in (single-workspace UX for now). */
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId)
  ]
);

/** Single-use password reset tokens (hash only). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("password_reset_tokens_token_hash_unique").on(t.tokenHash)]
);

// ---------------------------------------------------------------------------
// M2: companies (clients) and contacts
// Field shape intentionally mirrors Zoho Recruit's Clients/Contacts modules so
// existing agency data can be imported 1:1 (owner = Zoho "Account Manager").
// ---------------------------------------------------------------------------

export const companyStatus = pgEnum("company_status", ["prospect", "active", "dormant"]);
export type CompanyStatus = (typeof companyStatus.enumValues)[number];

export const companies = pgTable(
  "companies",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    /** Lowercased host of `website`, kept in sync by the app; drives duplicate checks. */
    domain: text("domain"),
    industry: text("industry"),
    size: text("size"),
    location: text("location"),
    phone: text("phone"),
    description: text("description"),
    status: companyStatus("status").notNull().default("prospect"),
    /** The account manager for this client. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("companies_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("companies_workspace_name_idx").on(t.workspaceId, t.name),
    index("companies_workspace_domain_idx").on(t.workspaceId, t.domain)
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null = independent contact (explicitly allowed by M2 acceptance criteria). */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    firstName: text("first_name"),
    lastName: text("last_name").notNull(),
    title: text("title"),
    email: text("email"),
    secondaryEmail: text("secondary_email"),
    workPhone: text("work_phone"),
    mobile: text("mobile"),
    linkedinUrl: text("linkedin_url"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("contacts_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("contacts_company_idx").on(t.companyId),
    index("contacts_workspace_email_idx").on(t.workspaceId, t.email)
  ]
);

/** Workspace-level tag dictionary, shared by every taggable object. */
export const tags = pgTable(
  "tags",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("tags_workspace_name_unique").on(t.workspaceId, t.name)]
);

/** Polymorphic tag assignments: entityType is "company" or "contact" (more in later milestones). */
export const taggings = pgTable(
  "taggings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("taggings_tag_entity_unique").on(t.tagId, t.entityType, t.entityId),
    index("taggings_entity_idx").on(t.workspaceId, t.entityType, t.entityId)
  ]
);

// ---------------------------------------------------------------------------
// M3: candidates, their parsed education/experience, attachments, counters
// Candidate is the product's most-used object (Zoho: 1,287 records, unique
// lowercased email = dedupe key). The field shape is the target for the M7
// parser and the M8 Zoho import; pipeline lives on Applications (M5), not here.
// ---------------------------------------------------------------------------

export const candidateSource = pgEnum("candidate_source", [
  "parser",
  "manual",
  "import",
  "referral",
  "api"
]);
export type CandidateSource = (typeof candidateSource.enumValues)[number];

/**
 * Per-workspace monotonic counters for human-friendly ids (CAND-0001). One row
 * per (workspace, entity_type); allocated with an atomic upsert-returning.
 */
export const counters = pgTable(
  "counters",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    value: integer("value").notNull().default(0)
  },
  (t) => [uniqueIndex("counters_workspace_entity_unique").on(t.workspaceId, t.entityType)]
);

export const candidates = pgTable(
  "candidates",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Human id e.g. CAND-0001, unique per workspace, from `counters`. */
    humanId: text("human_id").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name").notNull(),
    /** Current/most-recent title, e.g. "Senior Process Engineer". */
    title: text("title"),
    currentEmployer: text("current_employer"),
    /** Lowercased; the dedupe key (nullable: ~30% of Zoho candidates have none). */
    email: text("email"),
    secondaryEmail: text("secondary_email"),
    phone: text("phone"),
    mobile: text("mobile"),
    city: text("city"),
    country: text("country"),
    linkedinUrl: text("linkedin_url"),
    websiteUrl: text("website_url"),
    /** Free-text skills for v1; structured taxonomy is post-1.0. */
    skills: text("skills"),
    experienceYears: integer("experience_years"),
    /** Free-text salary preserved verbatim, plus optional structured range. */
    salaryText: text("salary_text"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    noticePeriod: text("notice_period"),
    source: candidateSource("source").notNull().default("manual"),
    /** The sourcer who owns this candidate. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("candidates_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("candidates_workspace_name_idx").on(t.workspaceId, t.lastName),
    index("candidates_workspace_email_idx").on(t.workspaceId, t.email),
    uniqueIndex("candidates_workspace_human_id_unique").on(t.workspaceId, t.humanId)
  ]
);

/** Parsed/entered education history; 1:N under a candidate. */
export const candidateEducation = pgTable(
  "candidate_education",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    institution: text("institution"),
    degree: text("degree"),
    fieldOfStudy: text("field_of_study"),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
    /** Manual ordering within a candidate's list. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("candidate_education_candidate_idx").on(t.candidateId)]
);

/** Parsed/entered work history; 1:N under a candidate. */
export const candidateExperience = pgTable(
  "candidate_experience",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    company: text("company"),
    title: text("title"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    isCurrent: boolean("is_current").notNull().default(false),
    summary: text("summary"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("candidate_experience_candidate_idx").on(t.candidateId)]
);

export const attachmentKind = pgEnum("attachment_kind", ["cv", "formatted_cv", "other"]);
export type AttachmentKind = (typeof attachmentKind.enumValues)[number];

/**
 * Polymorphic file attachments in S3-compatible storage (MinIO in dev). The
 * candidate's primary CV is an attachment with kind=cv. entityType is
 * "candidate" for now; more subjects (application, note) arrive in later
 * milestones.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: attachmentKind("kind").notNull().default("other"),
    /** Storage bucket + object key; the app never trusts a client-supplied key. */
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("attachments_entity_idx").on(t.workspaceId, t.entityType, t.entityId, t.deletedAt)]
);

// ---------------------------------------------------------------------------
// M4: jobs (Zoho "Job Openings", 101 records)
// A job is what the agency works to fill. It always belongs to a client company
// and is routed to an account-manager owner. The candidate pipeline hangs off
// Applications (M5), not here; this is the job record and its lifecycle.
// ---------------------------------------------------------------------------

export const jobStatus = pgEnum("job_status", [
  "open",
  "on_hold",
  "filled",
  "cancelled",
  "inactive"
]);
export type JobStatus = (typeof jobStatus.enumValues)[number];

export const jobEmploymentType = pgEnum("job_employment_type", [
  "permanent",
  "contract",
  "temporary"
]);
export type JobEmploymentType = (typeof jobEmploymentType.enumValues)[number];

export const jobWorkMode = pgEnum("job_work_mode", ["onsite", "hybrid", "remote"]);
export type JobWorkMode = (typeof jobWorkMode.enumValues)[number];

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Human id e.g. JOB-0001, unique per workspace, from `counters`. */
    humanId: text("human_id").notNull(),
    title: text("title").notNull(),
    /** The client this role is for. Required (a job cannot exist without a client). */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Optional hiring contact at the client; must belong to `companyId`. */
    hiringContactId: uuid("hiring_contact_id").references(() => contacts.id, {
      onDelete: "set null"
    }),
    /** The account manager who owns this job. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: jobStatus("status").notNull().default("open"),
    employmentType: jobEmploymentType("employment_type").notNull().default("permanent"),
    workMode: jobWorkMode("work_mode").notNull().default("onsite"),
    location: text("location"),
    /** Long-form job description; plain long text for now (M4 scope). */
    description: text("description"),
    /** Number of openings for this role. */
    positions: integer("positions").notNull().default(1),
    /** Free-text salary preserved verbatim, plus optional structured range. */
    salaryText: text("salary_text"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    /** Salary period the range refers to, e.g. "year", "day", "hour". */
    salaryPeriod: text("salary_period"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    targetCloseAt: timestamp("target_close_at", { withTimezone: true }),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("jobs_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("jobs_workspace_status_idx").on(t.workspaceId, t.status),
    index("jobs_workspace_company_idx").on(t.workspaceId, t.companyId),
    index("jobs_workspace_title_idx").on(t.workspaceId, t.title),
    uniqueIndex("jobs_workspace_human_id_unique").on(t.workspaceId, t.humanId)
  ]
);

// ---------------------------------------------------------------------------
// M5: applications (candidate x job) - the pipeline
// The Application is the product's heart (Zoho: 756 records). Coarse 7-value
// stage drives the kanban; a finer, workspace-configurable status dictionary
// (13 seeded Zoho values incl. the client-submission loop) carries detail; an
// append-only history records every transition for funnels + migration (M8).
// ---------------------------------------------------------------------------

export const applicationStage = pgEnum("application_stage", [
  "screening",
  "submitted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "archived"
]);
export type ApplicationStage = (typeof applicationStage.enumValues)[number];

/** Per-workspace status dictionary; seeded with the Zoho values we use. */
export const applicationStatuses = pgTable(
  "application_statuses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Stable machine key, e.g. "submitted_to_client". */
    key: text("key").notNull(),
    label: text("label").notNull(),
    stage: applicationStage("stage").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The default status a new application (or a kanban drop into a stage) lands on. */
    isEntry: boolean("is_entry").notNull().default(false),
    /** A resting/end status (hired, rejected, archived, ...). */
    isTerminal: boolean("is_terminal").notNull().default(false),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("application_statuses_workspace_key_unique").on(t.workspaceId, t.key)]
);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Human id e.g. APP-0001, unique per workspace, from `counters`. */
    humanId: text("human_id").notNull(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** Coarse pipeline stage (kanban column); kept in sync with `statusKey`. */
    stage: applicationStage("stage").notNull().default("screening"),
    /** Fine status key into `application_statuses` for this workspace. */
    statusKey: text("status_key").notNull().default("associated"),
    rejectionReason: text("rejection_reason"),
    /** 1-5 recruiter rating, optional. */
    rating: integer("rating"),
    /** The sourcer who owns this application. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source"),
    /** When the application entered its current stage (time-in-stage). */
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("applications_workspace_idx").on(t.workspaceId, t.deletedAt),
    index("applications_job_stage_idx").on(t.workspaceId, t.jobId, t.stage),
    index("applications_workspace_stage_idx").on(t.workspaceId, t.stage),
    index("applications_candidate_idx").on(t.workspaceId, t.candidateId),
    uniqueIndex("applications_workspace_candidate_job_unique").on(
      t.workspaceId,
      t.candidateId,
      t.jobId
    ),
    uniqueIndex("applications_workspace_human_id_unique").on(t.workspaceId, t.humanId)
  ]
);

/** Append-only transition log for every application status/stage change. */
export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatusKey: text("from_status_key"),
    toStatusKey: text("to_status_key").notNull(),
    fromStage: applicationStage("from_stage"),
    toStage: applicationStage("to_stage").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt()
  },
  (t) => [index("application_status_history_idx").on(t.workspaceId, t.applicationId, t.createdAt)]
);

// ---------------------------------------------------------------------------
// M6: notes, @mentions, notifications, note templates
// Zoho parity: every record has a Notes tab (composer with @mention-to-notify)
// and a Timeline tab (activity feed). Notes are polymorphic; @mentions fan out
// to an in-app notification inbox. The per-record timeline is read from the
// existing audit_log + application_status_history + notes (no M1-M5 changes).
// ---------------------------------------------------------------------------

/** Polymorphic notes attached to any record (candidate, job, company, ...). */
export const notes = pgTable(
  "notes",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("notes_entity_idx").on(t.workspaceId, t.entityType, t.entityId, t.deletedAt),
    index("notes_author_idx").on(t.workspaceId, t.authorId)
  ]
);

/** Users @mentioned in a note; drives notifications. */
export const noteMentions = pgTable(
  "note_mentions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("note_mentions_note_user_unique").on(t.noteId, t.userId),
    index("note_mentions_user_idx").on(t.workspaceId, t.userId)
  ]
);

export const notificationKind = pgEnum("notification_kind", ["mention"]);
export type NotificationKind = (typeof notificationKind.enumValues)[number];

/** In-app notification inbox (the header bell). One row per recipient per event. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull().default("mention"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** The record the notification points at. */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [
    index("notifications_recipient_idx").on(t.workspaceId, t.recipientId, t.createdAt),
    index("notifications_recipient_unread_idx").on(t.workspaceId, t.recipientId, t.readAt)
  ]
);

/** Workspace note templates (Zoho parity: e.g. a default screening-call note). */
export const noteTemplates = pgTable(
  "note_templates",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("note_templates_workspace_name_unique").on(t.workspaceId, t.name)]
);

/** Minimal audit trail: auth events + member/role changes (M1). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt()
  },
  (t) => [index("audit_log_workspace_idx").on(t.workspaceId, t.createdAt)]
);
