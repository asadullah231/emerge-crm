import { describe, expect, it } from "vitest";
import { companies, contacts } from "@emerge/db";
import {
  TRASH_RETENTION_DAYS,
  buildListClauses,
  listInput,
  normalizeDomain,
  trashCutoff,
  wordSearch
} from "../list-query";

const opts = {
  sortable: { name: companies.name, createdAt: companies.createdAt },
  searchable: [companies.name],
  defaultSort: "name"
};

describe("listInput", () => {
  it("applies defaults", () => {
    const parsed = listInput.parse({});
    expect(parsed).toMatchObject({ page: 1, pageSize: 50, sortDir: "asc", deleted: false });
  });

  it("caps pageSize at 200", () => {
    expect(() => listInput.parse({ pageSize: 500 })).toThrow();
  });

  it("rejects page 0", () => {
    expect(() => listInput.parse({ page: 0 })).toThrow();
  });
});

describe("buildListClauses", () => {
  it("computes limit and offset from page and pageSize", () => {
    const { limit, offset } = buildListClauses(listInput.parse({ page: 3, pageSize: 50 }), opts);
    expect(limit).toBe(50);
    expect(offset).toBe(100);
  });

  it("falls back to the default sort for unknown sort keys", () => {
    const known = buildListClauses(listInput.parse({ sortBy: "name" }), opts);
    const unknown = buildListClauses(listInput.parse({ sortBy: "evil_column" }), opts);
    expect(unknown.orderBy).toEqual(known.orderBy);
  });

  it("throws when the default sort is not in the whitelist", () => {
    expect(() =>
      buildListClauses(listInput.parse({}), { ...opts, defaultSort: "missing" })
    ).toThrow(/Unknown default sort/);
  });

  it("omits the search clause when search is empty", () => {
    const { searchWhere } = buildListClauses(listInput.parse({}), opts);
    expect(searchWhere).toBeUndefined();
  });

  it("builds a search clause when search is set", () => {
    const { searchWhere } = buildListClauses(listInput.parse({ search: "porsche" }), opts);
    expect(searchWhere).toBeDefined();
  });
});

describe("wordSearch", () => {
  const fields = [contacts.firstName, contacts.lastName];

  it("returns undefined for empty or whitespace input", () => {
    expect(wordSearch(undefined, fields)).toBeUndefined();
    expect(wordSearch("", fields)).toBeUndefined();
    expect(wordSearch("   ", fields)).toBeUndefined();
  });

  const chunkCount = (clause: unknown): number =>
    (clause as { queryChunks: unknown[] }).queryChunks.length;

  it("builds one clause per word so full names match across columns", () => {
    const single = wordSearch("jane", fields);
    const double = wordSearch("jane smith", fields);
    expect(single).toBeDefined();
    expect(double).toBeDefined();
    // The two-word clause is strictly larger: AND of two OR groups.
    expect(chunkCount(double)).toBeGreaterThan(chunkCount(single));
  });

  it("caps the number of words at 8", () => {
    const eight = wordSearch("a b c d e f g h", fields);
    const nine = wordSearch("a b c d e f g h i", fields);
    expect(chunkCount(nine)).toBe(chunkCount(eight));
  });
});

describe("trashCutoff", () => {
  it("is exactly the retention window in the past", () => {
    const now = new Date("2026-08-14T12:00:00Z");
    const cutoff = trashCutoff(now);
    const days = (now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(TRASH_RETENTION_DAYS);
  });
});

describe("normalizeDomain", () => {
  it("extracts the host from a full url", () => {
    expect(normalizeDomain("https://www.porsche-consulting.com/en/")).toBe(
      "porsche-consulting.com"
    );
  });

  it("accepts bare domains and lowercases them", () => {
    expect(normalizeDomain("Example.COM")).toBe("example.com");
  });

  it("strips a leading www", () => {
    expect(normalizeDomain("www.example.co.uk")).toBe("example.co.uk");
  });

  it("returns null for empty or host-less input", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
});
