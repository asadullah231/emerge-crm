import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, checkUploadConstraints } from "../storage";

describe("checkUploadConstraints", () => {
  it("accepts an allowed type within the size limit", () => {
    expect(checkUploadConstraints("application/pdf", 1024)).toEqual({ ok: true });
  });

  it("rejects an empty file", () => {
    const r = checkUploadConstraints("application/pdf", 0);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a file over the size limit", () => {
    const r = checkUploadConstraints("application/pdf", MAX_UPLOAD_BYTES + 1);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects a disallowed type", () => {
    const r = checkUploadConstraints("application/x-msdownload", 1024);
    expect(r).toMatchObject({ ok: false, status: 415 });
  });

  it("accepts docx", () => {
    expect(
      checkUploadConstraints(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        2048
      )
    ).toEqual({ ok: true });
  });
});
