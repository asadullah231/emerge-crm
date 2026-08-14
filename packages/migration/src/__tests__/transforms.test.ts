import { describe, expect, it } from "vitest";
import {
  transformApplication,
  transformCandidate,
  transformCompany,
  transformContact,
  transformEducation,
  transformExperience,
  transformJob,
  transformNote
} from "../transform/index.js";
import { extractZohoMentions, sanitizeHtml } from "../transform/util.js";
import { mapApplicationStatus, mapJobStatus } from "../maps.js";
import { validate } from "../validate.js";
import { buildProposedUserMap, indexUserMap } from "../userMap.js";

// All fixtures are SYNTHETIC (no real PII from the live org).

describe("company transform", () => {
  it("maps required + optional fields and preserves owner as parentRef", () => {
    const t = transformCompany({
      id: "111",
      Client_Name: "  Test Client  ",
      Website: "example.com",
      Industry: "Automotive",
      Contact_Number: "+44 1234",
      About: "Hello",
      Account_Manager: { id: "999", name: "AM" }
    });
    expect(t.entityType).toBe("company");
    expect(t.externalId).toBe("111");
    expect(t.shape.name).toBe("Test Client");
    expect(t.shape.domain).toBe("example.com");
    expect(t.parentRefs).toContainEqual({ entityType: "user", externalId: "999", role: "owner" });
    expect(validate(t as never).ok).toBe(true);
  });

  it("passes unmapped Zoho fields through", () => {
    const t = transformCompany({ id: "1", Client_Name: "X", Fax: "555" });
    expect(t.passthrough.Fax).toBe("555");
  });
});

describe("contact transform", () => {
  it("requires lastName; email is lowercased", () => {
    const t = transformContact({
      id: "1",
      First_Name: "A",
      Last_Name: "B",
      Email: "AB@Example.com",
      Client_Name: { id: "77", name: "C" }
    });
    expect(t.shape.email).toBe("ab@example.com");
    expect(validate(t as never).ok).toBe(true);
    expect(t.parentRefs).toContainEqual({
      entityType: "company",
      externalId: "77",
      role: "company"
    });
  });
  it("falls back to '(unknown)' last name so no-name rows still import (Zoho requires Last_Name; we defensively keep the row)", () => {
    const t = transformContact({ id: "1" });
    expect(t.shape.lastName).toBe("(unknown)");
    expect(validate(t as never).ok).toBe(true);
  });
});

describe("candidate transform + subforms", () => {
  it("maps source values", () => {
    const parser = transformCandidate({ id: "1", Last_Name: "X", Source: "Imported by parser" });
    const manual = transformCandidate({ id: "1", Last_Name: "X", Source: "Added by User" });
    const other = transformCandidate({ id: "1", Last_Name: "X", Source: "Employee Referral" });
    expect(parser.shape.source).toBe("parser");
    expect(manual.shape.source).toBe("manual");
    expect(other.shape.source).toBe("referral");
  });
  it("extracts inline education subform rows", () => {
    const rows = transformEducation("cand1", [
      {
        Institute_School: "IIT",
        Degree: "BS",
        Major_Department: "CS",
        Duration: { from: "2018-08", to: "2022-05" },
        Currently_pursuing: false
      },
      { Institute_School: "MIT", Degree: "MS", Currently_pursuing: true }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.shape.institute).toBe("IIT");
    expect(rows[0]!.shape.startMonth).toBe("2018-08");
    expect(rows[1]!.shape.isCurrent).toBe(true);
    expect(rows[0]!.externalId).toBe("cand1#edu#0");
  });
  it("extracts experience subform rows", () => {
    const rows = transformExperience("cand1", [
      {
        Company: "Acme",
        Occupation_Title: "Eng",
        Work_Duration: { from: "2022-06", to: "2024-01" }
      }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shape.company).toBe("Acme");
  });
});

describe("job transform", () => {
  it("maps status and requires company", () => {
    const withClient = transformJob({
      id: "1",
      Job_Opening_Name: "Backend Eng",
      Job_Opening_Status: "In-progress",
      Client_Name: { id: "77", name: "C" },
      Job_Description: '<script>alert(1)</script><p>Hi</p><a href="https://x.com">x</a>'
    });
    expect(withClient.shape.status).toBe("open");
    expect(withClient.shape.description).toBe(
      `<p>Hi</p><a href="https://x.com" rel="noopener noreferrer" target="_blank">x</a>`
    );
    expect(validate(withClient as never).ok).toBe(true);

    const noClient = transformJob({ id: "2", Job_Opening_Name: "X" });
    expect(validate(noClient as never).ok).toBe(false);
  });
});

describe("application transform + status mapping", () => {
  it("maps every Zoho status without falling through", () => {
    const values = [
      "Associated",
      "Submitted-to-client",
      "Interview-Scheduled",
      "Rejected by client",
      "Offer-Accepted",
      "Hired",
      "Archived",
      "Junk candidate",
      "No-Show"
    ];
    for (const v of values) {
      const m = mapApplicationStatus(v);
      expect(m.statusKey).not.toBe("imported_unknown");
    }
  });

  it("unknown status defaults to imported_unknown + emits a note", () => {
    const t = transformApplication({
      id: "1",
      Application_Status: "Made Up Status",
      Candidate_ID: { id: "c1" },
      Job_Opening_ID: { id: "j1" }
    });
    expect(t.shape.statusKey).toBe("imported_unknown");
    expect(t.notes.some((n) => n.includes("unmapped"))).toBe(true);
  });

  it("resolves both parent refs from Zoho's live dollar-prefixed keys ($Candidate_Id, $Job_Opening_Id)", () => {
    const t = transformApplication({
      id: "1",
      Application_Status: "Associated",
      $Candidate_Id: "c1",
      $Job_Opening_Id: "j1",
      Job_Opening_ID: "ZR_91_JOB" // display id, must be ignored
    });
    expect(t.parentRefs.some((r) => r.role === "candidate" && r.externalId === "c1")).toBe(true);
    expect(t.parentRefs.some((r) => r.role === "job" && r.externalId === "j1")).toBe(true);
  });
});

describe("notes mention extraction", () => {
  it("captures crm[user#id#...]crm tokens", () => {
    const { cleaned, zohoUserIds } = extractZohoMentions(
      "Hi crm[user#111#Foo]crm please call crm[user#222#Bar]crm"
    );
    expect(zohoUserIds).toEqual(["111", "222"]);
    expect(cleaned).toContain("@{111}");
    expect(cleaned).toContain("@{222}");
  });
});

describe("note transform + parent resolution", () => {
  it("resolves Leads -> candidate and captures mentions", () => {
    const t = transformNote({
      id: "n1",
      Note_Content: "Called candidate crm[user#111#Sam]crm",
      $Parent_Id: { id: "c1" },
      $se_module: "Leads",
      Created_By: { id: "111" }
    });
    expect(t.parentRefs).toContainEqual({
      entityType: "candidate",
      externalId: "c1",
      role: "parent"
    });
    expect(t.shape.mentionZohoUserIds).toEqual(["111"]);
    expect(validate(t as never).ok).toBe(true);
  });
});

describe("HTML sanitizer", () => {
  it("strips scripts + disallowed tags", () => {
    const out = sanitizeHtml("<p>Ok</p><script>evil()</script><iframe></iframe>");
    expect(out).toBe("<p>Ok</p>");
  });
});

describe("job status mapping", () => {
  it("falls back to open with a note for unknown values", () => {
    expect(mapJobStatus("In-progress").status).toBe("open");
    expect(mapJobStatus("Something Weird").status).toBe("open");
    expect(mapJobStatus("Something Weird").note).toContain("unmapped");
  });
});

describe("user map dedup + indexing", () => {
  it("collapses duplicate emails into one identity", () => {
    const map = buildProposedUserMap([
      { id: "1", email: "a@x.com", full_name: "A", status: "deleted" },
      { id: "2", email: "a@x.com", full_name: "A prime", status: "active" },
      { id: "3", email: "b@x.com", full_name: "B", status: "active" }
    ]);
    expect(map.entries).toHaveLength(2);
    const a = map.entries.find((e) => e.email === "a@x.com")!;
    expect(a.active).toBe(true);
    expect(a.zohoUserIds).toEqual(["1", "2"]);
    const idx = indexUserMap(map);
    expect(idx.get("1")).toBe(a);
    expect(idx.get("2")).toBe(a);
  });
});
