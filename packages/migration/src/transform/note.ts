import type { EntityType, Transformed } from "../types.js";
import { extractZohoMentions, lookupId, ownerId, passthroughOf, str } from "./util.js";

export interface NoteShape {
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Zoho user ids @mentioned in the body (resolved to Emerge users at import). */
  mentionZohoUserIds: string[];
}

/** Map Zoho parent module aliases to Emerge entity types. */
const PARENT_MODULE_TO_ENTITY: Record<string, EntityType> = {
  Leads: "candidate",
  Candidates: "candidate",
  Potentials: "job",
  Job_Openings: "job",
  Accounts: "company",
  Clients: "company",
  Contacts: "contact",
  Applications: "application"
};

export function extractParentRef(
  record: Record<string, unknown>
): { entityType: EntityType; externalId: string } | null {
  const parentId =
    lookupId(record.Parent_Id) ?? lookupId((record as Record<string, unknown>).$Parent_Id);
  const seModule = str((record as Record<string, unknown>).$se_module) ?? str(record.se_module);
  if (!parentId || !seModule) return null;
  const entityType = PARENT_MODULE_TO_ENTITY[seModule];
  if (!entityType) return null;
  return { entityType, externalId: parentId };
}

const MAPPED = [
  "Note_Content",
  "Created_Time",
  "Modified_Time",
  "Note_Title",
  "Owner",
  "Created_By",
  "Modified_By",
  "Parent_Id",
  "$Parent_Id",
  "$se_module",
  "se_module"
];

export function transformNote(record: Record<string, unknown>): Transformed<NoteShape> {
  const externalId = String(record.id);
  const body = str(record.Note_Content) ?? "";
  const { cleaned, zohoUserIds } = extractZohoMentions(body);
  const parent = extractParentRef(record);
  const author = ownerId(record.Created_By) ?? ownerId(record.Owner) ?? ownerId(record.Modified_By);

  const parentRefs: Transformed<NoteShape>["parentRefs"] = [];
  if (parent) parentRefs.push({ ...parent, role: "parent" });
  if (author) parentRefs.push({ entityType: "user", externalId: author, role: "author" });

  const notes: string[] = [];
  if (!parent) notes.push("note parent could not be resolved (missing/unknown se_module)");

  return {
    externalId,
    entityType: "note",
    shape: {
      body: cleaned,
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time),
      mentionZohoUserIds: zohoUserIds
    },
    parentRefs,
    passthrough: passthroughOf(record, MAPPED),
    notes
  };
}
