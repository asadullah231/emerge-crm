/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes ("")
 * and CRLF/LF line endings. Sufficient for day-one candidate imports; the
 * heavy streaming importer arrives with the Zoho migration engine (M8).
 */
export type ParsedCsv = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // handled by the \n branch; skip lone CR
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row if the file has no final newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. a trailing blank line).
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = nonEmpty;
  return { headers: headers!.map((h) => h.trim()), rows: dataRows };
}

/** Candidate fields a CSV column can map to. */
export const IMPORTABLE_FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name (required)" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "mobile", label: "Mobile" },
  { key: "title", label: "Current title" },
  { key: "currentEmployer", label: "Current employer" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "skills", label: "Skills" }
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number]["key"];

/** Best-effort auto-mapping of CSV headers to candidate fields by fuzzy name. */
export function autoMap(headers: string[]): Record<ImportableField, number | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const findBy = (...needles: string[]) => {
    const idx = headers.findIndex((h) => needles.some((n) => norm(h).includes(n)));
    return idx === -1 ? null : idx;
  };
  return {
    firstName: findBy("firstname", "givenname"),
    lastName: findBy("lastname", "surname", "familyname"),
    email: findBy("email", "mail"),
    phone: findBy("phone", "tel"),
    mobile: findBy("mobile", "cell"),
    title: findBy("title", "role", "position"),
    currentEmployer: findBy("employer", "company", "organisation", "organization"),
    city: findBy("city", "town"),
    country: findBy("country"),
    skills: findBy("skill")
  };
}

/** Job fields a CSV column can map to (jobs import, M17b). */
export const JOB_IMPORTABLE_FIELDS = [
  { key: "title", label: "Job title (required)" },
  { key: "companyName", label: "Client company (required)" },
  { key: "status", label: "Status" },
  { key: "employmentType", label: "Employment type" },
  { key: "workMode", label: "Work mode" },
  { key: "location", label: "Location" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "workExperience", label: "Work experience" },
  { key: "positions", label: "Positions" },
  { key: "salaryText", label: "Salary" },
  { key: "description", label: "Description" },
  { key: "requiredSkills", label: "Required skills" },
  { key: "targetDate", label: "Target date" },
  { key: "isHot", label: "Hot job (yes/no)" }
] as const;

export type JobImportableField = (typeof JOB_IMPORTABLE_FIELDS)[number]["key"];

/** Best-effort auto-mapping of CSV headers to job fields by fuzzy name. */
export function autoMapJobs(headers: string[]): Record<JobImportableField, number | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const findBy = (...needles: string[]) => {
    const idx = headers.findIndex((h) => needles.some((n) => norm(h).includes(n)));
    return idx === -1 ? null : idx;
  };
  return {
    title: findBy("postingtitle", "jobtitle", "title", "role", "position"),
    companyName: findBy("clientname", "client", "companyname", "company", "account"),
    status: findBy("jobopeningstatus", "status"),
    employmentType: findBy("employmenttype", "jobtype"),
    workMode: findBy("workmode", "remote"),
    location: findBy("location"),
    city: findBy("city", "town"),
    country: findBy("country"),
    industry: findBy("industry", "sector"),
    workExperience: findBy("workexperience", "experience"),
    positions: findBy("numberofpositions", "positions", "openings"),
    salaryText: findBy("salary", "rate"),
    description: findBy("jobdescription", "description"),
    requiredSkills: findBy("skill"),
    targetDate: findBy("targetdate", "closingdate", "deadline"),
    isHot: findBy("hot")
  };
}
