"use client";

import { useState } from "react";

/**
 * Zoho-style skill pills (M17a follow-up). Takes the free-text skills field
 * (comma / semicolon / newline separated), renders each skill as a chip with
 * a "+N" expander beyond `max`. Pure display - editing stays a textarea so the
 * stored comma string keeps feeding search and the parser round-trip.
 */
export function splitSkills(skills: string | null | undefined): string[] {
  if (!skills) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills.split(/[,;\n]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function SkillChips({ skills, max = 12 }: { skills: string | null; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  const all = splitSkills(skills);
  if (all.length === 0) return <span className="text-[var(--muted)]">Not set</span>;
  const shown = expanded ? all : all.slice(0, max);
  const hidden = all.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--background)] px-2.5 py-0.5 text-xs font-medium text-[var(--foreground)] ring-1 ring-[var(--border)]"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-secondary)]"
            aria-hidden
          />
          {s}
        </span>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          +{hidden}
        </button>
      ) : expanded && all.length > max ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-medium text-[var(--muted)] hover:underline"
        >
          Show less
        </button>
      ) : null}
    </span>
  );
}
