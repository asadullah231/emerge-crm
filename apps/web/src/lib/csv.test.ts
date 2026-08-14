import { describe, expect, it } from "vitest";
import { autoMap, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCsv("first,last,email\nAnna,Meyer,anna@x.com");
    expect(headers).toEqual(["first", "last", "email"]);
    expect(rows).toEqual([["Anna", "Meyer", "anna@x.com"]]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv('name,note\n"Meyer, Anna","said ""hi"""');
    expect(rows[0]).toEqual(["Meyer, Anna", 'said "hi"']);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([["1", "2"]]);
  });

  it("keeps quoted newlines inside a field", () => {
    const { rows } = parseCsv('name,bio\nAnna,"line1\nline2"');
    expect(rows[0]).toEqual(["Anna", "line1\nline2"]);
  });

  it("strips a UTF-8 BOM from the first header", () => {
    const { headers } = parseCsv("﻿first,last\nA,B");
    expect(headers[0]).toBe("first");
  });

  it("drops fully-blank rows", () => {
    const { rows } = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"]
    ]);
  });

  it("returns headers with no rows for a header-only file", () => {
    expect(parseCsv("a,b,c")).toEqual({ headers: ["a", "b", "c"], rows: [] });
  });
});

describe("autoMap", () => {
  it("maps common header variants to fields", () => {
    const m = autoMap(["First Name", "Surname", "E-mail", "Mobile Number", "Company"]);
    expect(m.firstName).toBe(0);
    expect(m.lastName).toBe(1);
    expect(m.email).toBe(2);
    expect(m.mobile).toBe(3);
    expect(m.currentEmployer).toBe(4);
  });

  it("returns null for unmatched fields", () => {
    const m = autoMap(["random", "columns"]);
    expect(m.lastName).toBeNull();
    expect(m.email).toBeNull();
  });
});
