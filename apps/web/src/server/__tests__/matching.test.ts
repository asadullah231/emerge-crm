import { describe, expect, it } from "vitest";
import { scoreCandidateForJob, skillPhrases, tokenize } from "../matching";

const job = {
  title: "Senior Frontend Engineer",
  description: "We need React, TypeScript and Next.js experience for our platform team.",
  requiredSkills: "React, TypeScript, Next.js, CSS",
  city: "Berlin",
  country: "Germany"
};

describe("tokenize", () => {
  it("keeps tech tokens and drops stopwords", () => {
    expect(tokenize("Senior C++ and .NET Engineer")).toEqual(["c++", "net", "engineer"]);
  });
  it("handles null", () => {
    expect(tokenize(null)).toEqual([]);
  });
});

describe("skillPhrases", () => {
  it("splits on commas/semicolons/newlines and dedupes", () => {
    expect(skillPhrases("React, TypeScript; react\nNode.js")).toEqual([
      "react",
      "typescript",
      "node.js"
    ]);
  });
});

describe("scoreCandidateForJob", () => {
  it("scores a strong match high", () => {
    const strong = scoreCandidateForJob(job, {
      title: "Frontend Engineer",
      skills: "React, TypeScript, Next.js, CSS, Redux",
      city: "Berlin",
      country: "Germany"
    });
    expect(strong.score).toBeGreaterThanOrEqual(80);
    expect(strong.matchedSkills).toContain("react");
    expect(strong.matchedSkills).toContain("next.js");
  });

  it("scores an unrelated candidate at or near zero", () => {
    const weak = scoreCandidateForJob(job, {
      title: "Warehouse Operative",
      skills: "Forklift, Packing",
      city: null,
      country: null
    });
    expect(weak.score).toBeLessThan(15);
    expect(weak.matchedSkills).toEqual([]);
  });

  it("ranks a partial skill match between the two", () => {
    const partial = scoreCandidateForJob(job, {
      title: "Web Developer",
      skills: "React, CSS",
      city: null,
      country: "Germany"
    });
    const strong = scoreCandidateForJob(job, {
      title: "Senior Frontend Engineer",
      skills: "React, TypeScript, Next.js, CSS",
      city: "Berlin",
      country: "Germany"
    });
    expect(partial.score).toBeGreaterThan(10);
    expect(partial.score).toBeLessThan(strong.score);
  });

  it("falls back to title tokens when the job has no skills", () => {
    const r = scoreCandidateForJob(
      { ...job, requiredSkills: null },
      { title: "Frontend Engineer", skills: null, city: null, country: null }
    );
    expect(r.score).toBeGreaterThan(0);
  });
});
