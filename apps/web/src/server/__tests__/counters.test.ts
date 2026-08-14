import { describe, expect, it } from "vitest";
import { humanId } from "../counters";

describe("humanId", () => {
  it("zero-pads to four digits", () => {
    expect(humanId("CAND", 1)).toBe("CAND-0001");
    expect(humanId("CAND", 42)).toBe("CAND-0042");
  });

  it("does not truncate values beyond four digits", () => {
    expect(humanId("CAND", 12345)).toBe("CAND-12345");
  });

  it("respects the given prefix", () => {
    expect(humanId("JOB", 7)).toBe("JOB-0007");
  });
});
