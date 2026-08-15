import { describe, expect, it, vi } from "vitest";
import {
  classifyAttachmentKind,
  mimeFromFilename,
  objectKeyFor,
  safeFilename,
  selectCandidatesWithAttachments
} from "../attachments.js";
import { ZohoClient, normalizeAttachment, zohoConfigFromEnv, type FetchLike } from "../zoho.js";

describe("mimeFromFilename", () => {
  it("maps common document types", () => {
    expect(mimeFromFilename("cv.pdf")).toBe("application/pdf");
    expect(mimeFromFilename("Resume.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(mimeFromFilename("old.doc")).toBe("application/msword");
    expect(mimeFromFilename("notes.txt")).toBe("text/plain");
  });
  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeFromFilename("archive.zip")).toBe("application/octet-stream");
    expect(mimeFromFilename("noext")).toBe("application/octet-stream");
  });
});

describe("classifyAttachmentKind", () => {
  const att = (fileName: string, type: string | null = "Attachment") =>
    ({ id: "1", fileName, size: 100, type, createdTime: null }) as const;
  it("classifies a document as cv", () => {
    expect(classifyAttachmentKind(att("John_Doe_CV.pdf"))).toBe("cv");
    expect(classifyAttachmentKind(att("resume.docx"))).toBe("cv");
  });
  it("classifies a formatted resume as formatted_cv", () => {
    expect(classifyAttachmentKind(att("Formatted_Resume_John.pdf"))).toBe("formatted_cv");
    expect(classifyAttachmentKind(att("john.pdf", "Formatted_Resume"))).toBe("formatted_cv");
  });
  it("classifies non-documents as other", () => {
    expect(classifyAttachmentKind(att("headshot.png"))).toBe("other");
    expect(classifyAttachmentKind(att("scan.zip"))).toBe("other");
  });
});

describe("safeFilename + objectKeyFor", () => {
  it("sanitises unsafe characters", () => {
    // Matches the web upload route's regex: dots are kept, only /*? collapse to _.
    // Harmless leading dots - every key is prefixed with workspaces/<ws>/candidates/<id>/.
    expect(safeFilename("../weird/na*me?.pdf")).toBe(".._weird_na_me_.pdf");
    expect(safeFilename("")).toBe("attachment");
  });
  it("builds a deterministic workspace-scoped key with the zoho id embedded", () => {
    const key = objectKeyFor("ws1", "cand1", "att99", "My CV.pdf");
    expect(key).toBe("workspaces/ws1/candidates/cand1/zoho-att99-My CV.pdf");
    // same inputs -> same key (idempotent re-runs)
    expect(objectKeyFor("ws1", "cand1", "att99", "My CV.pdf")).toBe(key);
  });
});

describe("selectCandidatesWithAttachments", () => {
  it("selects flagged + resolvable candidates and counts the rest", () => {
    const refMap = new Map([
      ["z1", "e1"],
      ["z3", "e3"]
    ]);
    const raw = [
      { id: "z1", Is_Attachment_Present: true }, // flagged + resolvable
      { id: "z2", Is_Attachment_Present: false }, // not flagged
      { id: "z3", Is_Attachment_Present: true }, // flagged + resolvable
      { id: "z4", Is_Attachment_Present: true } // flagged but unresolved
    ];
    const r = selectCandidatesWithAttachments(raw, refMap);
    expect(r.flagged).toBe(3);
    expect(r.unresolved).toBe(1);
    expect(r.work).toEqual([
      { zohoId: "z1", internalId: "e1" },
      { zohoId: "z3", internalId: "e3" }
    ]);
  });
});

describe("normalizeAttachment", () => {
  it("coerces string sizes and reads File_Name / $type", () => {
    const a = normalizeAttachment({
      id: 12345,
      File_Name: "cv.pdf",
      Size: "204800",
      $type: "Attachment",
      Created_Time: "2026-01-01T00:00:00+00:00"
    });
    expect(a).toEqual({
      id: "12345",
      fileName: "cv.pdf",
      size: 204800,
      type: "Attachment",
      createdTime: "2026-01-01T00:00:00+00:00"
    });
  });
});

describe("zohoConfigFromEnv", () => {
  it("throws listing the missing vars", () => {
    expect(() => zohoConfigFromEnv({} as NodeJS.ProcessEnv)).toThrow(/ZOHO_CLIENT_ID/);
  });
  it("defaults EU domains and trims trailing slashes", () => {
    const cfg = zohoConfigFromEnv({
      ZOHO_CLIENT_ID: "cid",
      ZOHO_CLIENT_SECRET: "sec",
      ZOHO_REFRESH_TOKEN: "ref",
      ZOHO_API_DOMAIN: "https://recruit.zoho.eu/"
    } as NodeJS.ProcessEnv);
    expect(cfg.accountsDomain).toBe("https://accounts.zoho.eu");
    expect(cfg.apiDomain).toBe("https://recruit.zoho.eu");
  });
});

// ---- ZohoClient (mocked fetch) --------------------------------------------

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => JSON.stringify(body)
  };
}
function binRes(status: number, bytes: Uint8Array, contentType = "application/pdf") {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => ({}),
    arrayBuffer: async () => ab,
    text: async () => ""
  };
}

const cfg = {
  clientId: "cid",
  clientSecret: "sec",
  refreshToken: "ref",
  accountsDomain: "https://accounts.zoho.eu",
  apiDomain: "https://recruit.zoho.eu"
};

describe("ZohoClient.listAttachments", () => {
  it("refreshes the token then lists, sending the oauth header", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/oauth/v2/token"))
        return jsonRes(200, { access_token: "tok", expires_in: 3600 });
      return jsonRes(200, { data: [{ id: "a1", File_Name: "cv.pdf", Size: "10" }] });
    });
    const client = new ZohoClient(cfg, { fetchImpl });
    const atts = await client.listAttachments("Candidates", "rec1");
    expect(atts).toEqual([
      { id: "a1", fileName: "cv.pdf", size: 10, type: null, createdTime: null }
    ]);
    expect(calls[0]).toContain("/oauth/v2/token");
    expect(calls[1]).toBe("https://recruit.zoho.eu/recruit/v2/Candidates/rec1/Attachments");
  });

  it("returns [] on 204 (no attachments)", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url: string) =>
      url.includes("/oauth/")
        ? jsonRes(200, { access_token: "t", expires_in: 3600 })
        : jsonRes(204, {})
    );
    const client = new ZohoClient(cfg, { fetchImpl });
    expect(await client.listAttachments("Candidates", "rec1")).toEqual([]);
  });

  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.includes("/oauth/")) return jsonRes(200, { access_token: "t", expires_in: 3600 });
      n++;
      if (n === 1) return jsonRes(429, {}, { "Retry-After": "0" });
      return jsonRes(200, { data: [] });
    });
    const client = new ZohoClient(cfg, { fetchImpl, backoffMs: 1 });
    expect(await client.listAttachments("Candidates", "rec1")).toEqual([]);
    expect(n).toBe(2);
  });
});

describe("ZohoClient.downloadAttachment", () => {
  it("downloads bytes and content-type", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl: FetchLike = vi.fn(async (url: string) =>
      url.includes("/oauth/")
        ? jsonRes(200, { access_token: "t", expires_in: 3600 })
        : binRes(200, payload, "application/pdf")
    );
    const client = new ZohoClient(cfg, { fetchImpl });
    const { bytes, contentType } = await client.downloadAttachment("Candidates", "rec1", "a1");
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(contentType).toBe("application/pdf");
  });
});
