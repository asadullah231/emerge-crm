import { mapEmploymentType, mapJobStatus } from "../maps.js";
import type { Transformed } from "../types.js";
import { bool, date, lookupId, num, ownerId, passthroughOf, sanitizeHtml, str } from "./util.js";

export interface JobShape {
  title: string;
  status: string;
  description: string | null;
  salaryText: string | null;
  employmentType: string | null;
  workMode: "remote" | "on_site" | "hybrid";
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  positions: number | null;
  targetDate: string | null;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const MAPPED = [
  "Job_Opening_Name",
  "Job_Opening_Status",
  "Job_Description",
  "Salary",
  "Job_Type",
  "Remote_Job",
  "City",
  "State",
  "Country",
  "Zip_Code",
  "Number_of_Positions",
  "Target_Date",
  "Date_Opened",
  "Date_Closed",
  "Client_Name",
  "Contact_Name",
  "Account_Manager",
  "Assigned_Recruiter",
  "Created_Time",
  "Modified_Time"
];

export function transformJob(record: Record<string, unknown>): Transformed<JobShape> {
  const externalId = String(record.id);
  const client = lookupId(record.Client_Name);
  const contact = lookupId(record.Contact_Name);
  const owner = ownerId(record.Account_Manager);
  const jobStatus = mapJobStatus(str(record.Job_Opening_Status));
  const notes: string[] = [];
  if (jobStatus.note) notes.push(jobStatus.note);
  const parentRefs: Transformed<JobShape>["parentRefs"] = [];
  if (client) parentRefs.push({ entityType: "company", externalId: client, role: "company" });
  if (contact) parentRefs.push({ entityType: "contact", externalId: contact, role: "contact" });
  if (owner) parentRefs.push({ entityType: "user", externalId: owner, role: "owner" });
  return {
    externalId,
    entityType: "job",
    shape: {
      title: str(record.Job_Opening_Name) ?? "(untitled job)",
      status: jobStatus.status,
      description: sanitizeHtml(str(record.Job_Description) ?? null),
      salaryText: str(record.Salary),
      employmentType: mapEmploymentType(str(record.Job_Type)),
      workMode: bool(record.Remote_Job) ? "remote" : "on_site",
      city: str(record.City),
      state: str(record.State),
      country: str(record.Country),
      zipCode: str(record.Zip_Code),
      positions: num(record.Number_of_Positions),
      targetDate: date(record.Target_Date),
      openedAt: date(record.Date_Opened),
      closedAt: date(record.Date_Closed),
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time)
    },
    parentRefs,
    passthrough: passthroughOf(record, MAPPED),
    notes
  };
}
