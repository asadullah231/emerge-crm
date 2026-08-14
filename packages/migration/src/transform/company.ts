import type { Transformed } from "../types.js";
import { domainFromUrl, ownerId, passthroughOf, str } from "./util.js";

export interface CompanyShape {
  name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  phone: string | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const MAPPED = [
  "Client_Name",
  "Website",
  "Industry",
  "Contact_Number",
  "About",
  "Account_Manager",
  "Created_Time",
  "Modified_Time"
];

export function transformCompany(record: Record<string, unknown>): Transformed<CompanyShape> {
  const externalId = String(record.id);
  const name = str(record.Client_Name) ?? "(unnamed client)";
  const website = str(record.Website);
  const owner = ownerId(record.Account_Manager);
  return {
    externalId,
    entityType: "company",
    shape: {
      name,
      website,
      domain: domainFromUrl(website),
      industry: str(record.Industry),
      phone: str(record.Contact_Number),
      description: str(record.About),
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time)
    },
    parentRefs: owner ? [{ entityType: "user", externalId: owner, role: "owner" }] : [],
    passthrough: passthroughOf(record, MAPPED),
    notes: []
  };
}
