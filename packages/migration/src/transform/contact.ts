import type { Transformed } from "../types.js";
import { bool, lookupId, lowerEmail, ownerId, passthroughOf, str } from "./util.js";

export interface ContactShape {
  firstName: string | null;
  lastName: string;
  email: string | null;
  secondaryEmail: string | null;
  workPhone: string | null;
  mobile: string | null;
  title: string | null;
  linkedin: string | null;
  isPrimary: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

const MAPPED = [
  "First_Name",
  "Last_Name",
  "Email",
  "Secondary_Email",
  "Work_Phone",
  "Mobile",
  "Job_Title",
  "LinkedIn__s",
  "Is_primary_contact",
  "Client_Name",
  "Contact_Owner",
  "Created_Time",
  "Modified_Time"
];

export function transformContact(record: Record<string, unknown>): Transformed<ContactShape> {
  const externalId = String(record.id);
  const client = lookupId(record.Client_Name);
  const owner = ownerId(record.Contact_Owner);
  const parentRefs: Transformed<ContactShape>["parentRefs"] = [];
  if (client) parentRefs.push({ entityType: "company", externalId: client, role: "company" });
  if (owner) parentRefs.push({ entityType: "user", externalId: owner, role: "owner" });
  return {
    externalId,
    entityType: "contact",
    shape: {
      firstName: str(record.First_Name),
      lastName: str(record.Last_Name) ?? "(unknown)",
      email: lowerEmail(record.Email),
      secondaryEmail: lowerEmail(record.Secondary_Email),
      workPhone: str(record.Work_Phone),
      mobile: str(record.Mobile),
      title: str(record.Job_Title),
      linkedin: str(record.LinkedIn__s),
      isPrimary: bool(record.Is_primary_contact),
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time)
    },
    parentRefs,
    passthrough: passthroughOf(record, MAPPED),
    notes: []
  };
}
