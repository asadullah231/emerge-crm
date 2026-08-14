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
