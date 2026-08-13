import { describe, expect, it } from "vitest";
import { summarizeHealth } from "./index";

describe("summarizeHealth", () => {
  it("reports ok when all checks pass", () => {
    const result = summarizeHealth([
      { name: "db", status: "ok", latencyMs: 3 },
      { name: "redis", status: "ok", latencyMs: 1 }
    ]);
    expect(result.status).toBe("ok");
    expect(result.checks).toHaveLength(2);
  });

  it("reports degraded when any check fails", () => {
    const result = summarizeHealth([
      { name: "db", status: "ok" },
      { name: "storage", status: "fail", error: "unreachable" }
    ]);
    expect(result.status).toBe("degraded");
  });

  it("reports ok for an empty check list", () => {
    expect(summarizeHealth([]).status).toBe("ok");
  });
});
