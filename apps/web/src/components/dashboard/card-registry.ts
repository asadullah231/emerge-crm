/*
 * Dashboard card catalog (Bullhorn-style). Each card type declares its title,
 * library category, default size and which Configure Card filters apply.
 * A layout is an ordered list of card instances; the same type can appear
 * more than once with different filters (Bullhorn: "add the same card twice").
 */

export type CardSize = "s" | "m" | "l";
export type DatePreset =
  | "all"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

export type CardFilter = {
  scope?: "all" | "mine" | "users";
  userIds?: string[];
  datePreset?: DatePreset;
  companyId?: string;
  industry?: string;
  employmentType?: "permanent" | "contract" | "temporary";
  skill?: string;
  source?: string;
  granularity?: "week" | "month" | "year";
};

export type CardInstance = {
  id: string;
  type: CardType;
  size: CardSize;
  title?: string;
  view?: "chart" | "list";
  filter?: CardFilter;
};

/** Filter controls a card's Configure dialog shows. */
export type FilterKey = "user" | "date" | "company" | "industry" | "jobType" | "skill" | "source";

export type CardType =
  // Existing Emerge cards (kept; they follow the page-level filter bar).
  | "attention"
  | "team-week"
  | "pipeline"
  | "kpis"
  | "funnel"
  | "trends"
  | "recruiters"
  | "interviews"
  | "recent-candidates"
  | "recent-jobs"
  | "tasks"
  | "activity"
  // Bullhorn cards (per-card filters).
  | "success-rates"
  | "response-times"
  | "jobs-without-coverage"
  | "starts"
  | "jobs-by-skill"
  | "jobs-by-age"
  | "jobs-by-industry"
  | "jobs-over-time"
  | "placements-over-time"
  | "companies-by-status"
  | "companies-by-open-jobs"
  | "companies-by-placements"
  | "companies-over-time"
  | "contacts-by-owner"
  | "contacts-over-time"
  | "candidates-by-owner"
  | "candidates-by-source"
  | "candidates-over-time"
  // Report cards (replace the Reports section, reuse the report queries).
  | "monthly-pacing"
  | "rejection-reasons"
  | "daily-activity"
  | "am-scoreboard";

export type CardMeta = {
  title: string;
  category:
    | "Overview"
    | "Jobs"
    | "Placements"
    | "Companies"
    | "Contacts"
    | "Candidates"
    | "Team"
    | "Activity";
  description: string;
  size: CardSize;
  /** Filters offered in Configure Card. Empty = follows the page filter bar. */
  filters: FilterKey[];
  /** Card has a graph and a list view the user can toggle. */
  toggle?: boolean;
  /** Card has a week / month / year granularity switch. */
  granularity?: boolean;
  /** Wording for the "mine" scope (Bullhorn: My Jobs / My Companies). */
  mineLabel?: string;
};

const JOB_FILTERS: FilterKey[] = ["user", "date", "company", "industry", "jobType", "skill"];

export const CARD_META: Record<CardType, CardMeta> = {
  "monthly-pacing": {
    title: "Monthly pacing",
    category: "Overview",
    description: "Hires, submissions and revenue this month against targets",
    size: "s",
    filters: []
  },
  "rejection-reasons": {
    title: "Rejection reasons",
    category: "Team",
    description: "Top reasons candidates were rejected, last 4 weeks",
    size: "s",
    filters: []
  },
  "daily-activity": {
    title: "Daily activity",
    category: "Team",
    description: "Candidates added, calls, status changes and tasks done per day",
    size: "m",
    filters: ["date"]
  },
  "am-scoreboard": {
    title: "AM scoreboard",
    category: "Team",
    description: "New clients, jobs, terms, meetings and placements per account manager",
    size: "m",
    filters: ["date"]
  },
  attention: {
    title: "Needs attention today",
    category: "Overview",
    description: "Red-flag jobs, interviews today, overdue tasks, waiting on client",
    size: "l",
    filters: []
  },
  kpis: {
    title: "Key numbers",
    category: "Overview",
    description: "Jobs, candidates, applications, interviews and hires with trends",
    size: "l",
    filters: []
  },
  trends: {
    title: "Trends",
    category: "Overview",
    description: "New records per week as a line chart",
    size: "m",
    filters: []
  },
  "success-rates": {
    title: "Success Rates",
    category: "Jobs",
    description: "Fill ratio and hit ratio with the historic fill ratio",
    size: "s",
    filters: JOB_FILTERS,
    granularity: true,
    mineLabel: "My jobs"
  },
  "response-times": {
    title: "Response Times",
    category: "Jobs",
    description: "Days from opening to first candidate, first submission and fill",
    size: "s",
    filters: JOB_FILTERS,
    granularity: true,
    mineLabel: "My jobs"
  },
  "jobs-without-coverage": {
    title: "Jobs without Coverage",
    category: "Jobs",
    description: "Open jobs with no candidates yet, assign or close them",
    size: "s",
    filters: JOB_FILTERS,
    mineLabel: "My jobs"
  },
  "jobs-by-skill": {
    title: "Jobs by Required Skills",
    category: "Jobs",
    description: "Jobs, roles and fill rate per required skill",
    size: "m",
    filters: ["user", "date", "company", "industry", "jobType"],
    toggle: true,
    mineLabel: "My jobs"
  },
  "jobs-by-age": {
    title: "Jobs by Age",
    category: "Jobs",
    description: "Open jobs by days since opening",
    size: "s",
    filters: ["user", "company", "industry", "jobType", "skill"],
    mineLabel: "My jobs"
  },
  "jobs-by-industry": {
    title: "Jobs by Business Sector",
    category: "Jobs",
    description: "Open jobs grouped by industry",
    size: "s",
    filters: ["user", "date", "company", "jobType", "skill"],
    toggle: true,
    mineLabel: "My jobs"
  },
  "jobs-over-time": {
    title: "Jobs over Time",
    category: "Jobs",
    description: "New jobs per week, month or year",
    size: "s",
    filters: ["user", "company", "industry", "jobType", "skill"],
    granularity: true,
    mineLabel: "My jobs"
  },
  pipeline: {
    title: "Pipeline by job",
    category: "Jobs",
    description: "One row per job, candidate counts per stage",
    size: "l",
    filters: []
  },
  funnel: {
    title: "Recruitment funnel",
    category: "Jobs",
    description: "Applications that reached each stage, with drill-down",
    size: "m",
    filters: []
  },
  "recent-jobs": {
    title: "Recent job openings",
    category: "Jobs",
    description: "Latest jobs with status",
    size: "s",
    filters: []
  },
  starts: {
    title: "Starts",
    category: "Placements",
    description: "Calendar of placement start dates",
    size: "m",
    filters: ["user", "company", "industry", "jobType", "skill"],
    mineLabel: "My jobs"
  },
  "placements-over-time": {
    title: "Hires over Time",
    category: "Placements",
    description: "Candidates moved to Hired per week, month or year",
    size: "s",
    filters: ["user", "company", "industry", "jobType", "skill"],
    granularity: true,
    mineLabel: "My jobs"
  },
  "companies-by-status": {
    title: "Companies by Status",
    category: "Companies",
    description: "Prospect, active and dormant clients",
    size: "s",
    filters: ["user", "date", "industry", "source"],
    toggle: true,
    mineLabel: "My companies"
  },
  "companies-by-open-jobs": {
    title: "Companies by Open Jobs",
    category: "Companies",
    description: "Clients ranked by open jobs",
    size: "s",
    toggle: true,
    filters: ["user", "industry", "jobType", "skill"],
    mineLabel: "My jobs"
  },
  "companies-by-placements": {
    title: "Companies by Hires",
    category: "Companies",
    description: "Clients ranked by candidates moved to Hired",
    size: "s",
    toggle: true,
    filters: ["user", "date", "industry", "jobType"],
    mineLabel: "My jobs"
  },
  "companies-over-time": {
    title: "Companies over Time",
    category: "Companies",
    description: "New companies per period, or the newest list",
    size: "s",
    filters: ["user"],
    granularity: true,
    toggle: true,
    mineLabel: "My companies"
  },
  "contacts-by-owner": {
    title: "Contacts by Consultant",
    category: "Contacts",
    description: "Contacts per owner",
    size: "s",
    filters: ["user", "date"],
    toggle: true,
    mineLabel: "My contacts"
  },
  "contacts-over-time": {
    title: "Contacts over Time",
    category: "Contacts",
    description: "New contacts per period, or the newest list",
    size: "s",
    filters: ["user"],
    granularity: true,
    toggle: true,
    mineLabel: "My contacts"
  },
  "candidates-by-owner": {
    title: "Candidates by Consultant",
    category: "Candidates",
    description: "Candidates per owner",
    size: "s",
    filters: ["user", "date", "source"],
    toggle: true,
    mineLabel: "My candidates"
  },
  "candidates-by-source": {
    title: "Candidates by Source",
    category: "Candidates",
    description: "Where candidates came from",
    size: "s",
    filters: ["user", "date"],
    toggle: true,
    mineLabel: "My candidates"
  },
  "candidates-over-time": {
    title: "Candidates over Time",
    category: "Candidates",
    description: "New candidates per period, or the newest list",
    size: "s",
    filters: ["user"],
    granularity: true,
    toggle: true,
    mineLabel: "My candidates"
  },
  "recent-candidates": {
    title: "Recent candidates",
    category: "Candidates",
    description: "Latest candidates added",
    size: "s",
    filters: []
  },
  "team-week": {
    title: "Team this week",
    category: "Team",
    description: "Shortlisted vs submitted per recruiter against targets",
    size: "m",
    filters: [],
    toggle: true
  },
  recruiters: {
    title: "Recruiter performance",
    category: "Team",
    description: "Totals by application owner",
    size: "m",
    filters: []
  },
  interviews: {
    title: "Upcoming interviews",
    category: "Activity",
    description: "Interviews scheduled in the next 14 days",
    size: "s",
    filters: []
  },
  tasks: {
    title: "Tasks & follow-ups",
    category: "Activity",
    description: "Open tasks with due dates",
    size: "s",
    filters: []
  },
  activity: {
    title: "Recent activity",
    category: "Activity",
    description: "Latest notes and record changes",
    size: "s",
    filters: []
  }
};

export const CARD_CATEGORIES: CardMeta["category"][] = [
  "Overview",
  "Jobs",
  "Placements",
  "Companies",
  "Contacts",
  "Candidates",
  "Team",
  "Activity"
];

let seq = 0;
export function newCardId(): string {
  seq = (seq + 1) % 1000;
  return `c${Date.now().toString(36)}${seq.toString(36)}`;
}

function inst(type: CardType, size?: CardSize): CardInstance {
  return { id: `d-${type}`, type, size: size ?? CARD_META[type].size };
}

/** Default layout, packed for the 4-column grid (S = 1, M = 2, L = 4 columns). */
export const DEFAULT_LAYOUT: CardInstance[] = [
  inst("attention"),
  inst("success-rates"),
  inst("response-times"),
  inst("jobs-without-coverage"),
  inst("jobs-by-age"),
  inst("team-week"),
  inst("companies-by-status"),
  inst("candidates-by-source"),
  inst("monthly-pacing"),
  inst("rejection-reasons"),
  inst("daily-activity"),
  inst("kpis"),
  inst("funnel"),
  inst("trends"),
  inst("companies-by-open-jobs"),
  inst("placements-over-time"),
  inst("companies-by-placements"),
  inst("contacts-over-time"),
  inst("pipeline"),
  inst("recruiters"),
  inst("interviews"),
  inst("tasks"),
  inst("am-scoreboard"),
  inst("activity"),
  inst("recent-jobs"),
  inst("jobs-over-time"),
  inst("candidates-over-time"),
  inst("contacts-by-owner"),
  inst("candidates-by-owner")
];

/** [from, to) window for a preset in the browser (mirrors the server helper). */
export function clientRange(preset: DatePreset | undefined, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  const day = 24 * 60 * 60 * 1000;
  switch (preset) {
    case "7d":
      return { from: new Date(now.getTime() - 7 * day), to: undefined };
    case "30d":
      return { from: new Date(now.getTime() - 30 * day), to: undefined };
    case "90d":
      return { from: new Date(now.getTime() - 90 * day), to: undefined };
    case "this_month":
      return { from: new Date(y, m, 1), to: undefined };
    case "last_month":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case "this_quarter":
      return { from: new Date(y, q, 1), to: undefined };
    case "last_quarter":
      return { from: new Date(y, q - 3, 1), to: new Date(y, q, 1) };
    case "this_year":
      return { from: new Date(y, 0, 1), to: undefined };
    case "last_year":
      return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
    default:
      return { from: undefined, to: undefined };
  }
}

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year: "This year",
  last_year: "Last year"
};

/** Emerge cards that follow the page-level date range and recruiter filters. */
export const PAGE_FILTER_TYPES = new Set<CardType>([
  "kpis",
  "funnel",
  "trends",
  "recruiters",
  "interviews",
  "recent-candidates",
  "recent-jobs",
  "tasks"
]);

/** Toggle cards that open in list (table) view, like Bullhorn's status tables. */
const LIST_FIRST = new Set<CardType>([
  "companies-by-status",
  "contacts-by-owner",
  "candidates-by-owner"
]);

export function viewOf(card: Pick<CardInstance, "type" | "view">): "chart" | "list" {
  return card.view ?? (LIST_FIRST.has(card.type) ? "list" : "chart");
}

/** Entity dashboards behind the List / Dashboard switch (Bullhorn: per-list dashboards). */
export type EntityKey = "candidates" | "jobs" | "clients" | "contacts";

function card(type: CardType, id: string, view?: "chart" | "list"): CardInstance {
  return { id, type, size: CARD_META[type].size, ...(view ? { view } : {}) };
}

export const ENTITY_DASHBOARDS: Record<
  EntityKey,
  { key: string; title: string; categories: CardMeta["category"][]; defaults: CardInstance[] }
> = {
  candidates: {
    key: "entity.candidates.v1",
    title: "Candidates dashboard",
    categories: ["Candidates", "Team"],
    defaults: [
      card("candidates-by-source", "e-cand-source"),
      card("candidates-by-owner", "e-cand-owner"),
      card("candidates-over-time", "e-cand-time"),
      card("candidates-over-time", "e-cand-newest", "list"),
      card("daily-activity", "e-cand-activity"),
      card("rejection-reasons", "e-cand-reject"),
      card("jobs-without-coverage", "e-cand-coverage")
    ]
  },
  jobs: {
    key: "entity.jobs.v1",
    title: "Job openings dashboard",
    categories: ["Jobs", "Placements", "Companies"],
    defaults: [
      card("success-rates", "e-job-success"),
      card("response-times", "e-job-response"),
      card("jobs-without-coverage", "e-job-coverage"),
      card("jobs-by-age", "e-job-age"),
      card("jobs-by-industry", "e-job-industry"),
      card("jobs-over-time", "e-job-time"),
      card("placements-over-time", "e-job-hires"),
      card("companies-by-open-jobs", "e-job-companies")
    ]
  },
  clients: {
    key: "entity.clients.v1",
    title: "Clients dashboard",
    categories: ["Companies", "Placements", "Team"],
    defaults: [
      card("companies-by-status", "e-co-status"),
      card("companies-by-open-jobs", "e-co-open"),
      card("companies-by-placements", "e-co-hires"),
      card("companies-over-time", "e-co-time"),
      card("am-scoreboard", "e-co-am"),
      card("companies-over-time", "e-co-newest", "list"),
      card("jobs-by-industry", "e-co-industry")
    ]
  },
  contacts: {
    key: "entity.contacts.v1",
    title: "Contacts dashboard",
    categories: ["Contacts", "Companies"],
    defaults: [
      card("contacts-by-owner", "e-ct-owner"),
      card("contacts-over-time", "e-ct-time"),
      card("contacts-over-time", "e-ct-newest", "list"),
      card("companies-by-status", "e-ct-co-status")
    ]
  }
};
