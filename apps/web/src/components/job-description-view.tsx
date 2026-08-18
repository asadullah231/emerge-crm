"use client";

/**
 * Pretty renderer for job descriptions (M17a follow-up). Most of our JDs were
 * flattened to a single line by the Zoho migration, but they follow a stable
 * "Label - text. Label - text. Must-haves: sentence. sentence." shape, so we
 * can recover structure for DISPLAY only: section labels become bold headings,
 * list-like sections (must-haves etc.) split into bullets. The stored text is
 * untouched; editing still opens the raw textarea. Texts with real newlines
 * render as paragraphs/bullets directly.
 */

const SECTION_LABELS = [
  "Job Role",
  "Location",
  "Onsite/Hybrid",
  "Travel",
  "Languages",
  "Language",
  "Salary & benefits",
  "Salary and benefits",
  "Salary",
  "Benefits",
  "Must-haves",
  "Must haves",
  "Must-have",
  "Nice-to-haves",
  "Nice to haves",
  "Nice-to-have",
  "Responsibilities",
  "Requirements",
  "Key words",
  "Keywords",
  "some more key words",
  "About the role",
  "About the company",
  "Notes"
];

/** Sections whose body reads best as a bullet list, one sentence per bullet. */
const LIST_LABELS = new Set(
  [
    "Must-haves",
    "Must haves",
    "Must-have",
    "Nice-to-haves",
    "Nice to haves",
    "Nice-to-have",
    "Responsibilities",
    "Requirements"
  ].map((l) => l.toLowerCase())
);

type Block = { kind: "paragraph"; text: string } | { kind: "section"; label: string; body: string };

const LABEL_ALTERNATION = SECTION_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(
  "|"
);
// A label counts as a section start only when followed by "-", "–" or ":".
const SECTION_RE = new RegExp(`\\b(${LABEL_ALTERNATION})\\s*[-–—:]\\s*`, "gi");

function splitFlatDescription(text: string): Block[] {
  const blocks: Block[] = [];
  const matches = [...text.matchAll(SECTION_RE)];
  if (matches.length < 2) return [{ kind: "paragraph", text }];

  const first = matches[0]!;
  const preamble = text.slice(0, first.index).trim();
  if (preamble) blocks.push({ kind: "paragraph", text: preamble });

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    const body = text
      .slice(start, end)
      .trim()
      .replace(/[.\s]+$/, ".");
    blocks.push({ kind: "section", label: m[1]!, body });
  }
  return blocks;
}

/** Sentence-split a list-like body into bullets (min length guards initials). */
function toBullets(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+(?=[A-Z0-9€£$])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function normalizeLabel(label: string): string {
  const l = label.trim();
  if (l.toLowerCase() === "some more key words") return "Key words";
  return l.charAt(0).toUpperCase() + l.slice(1);
}

export function JobDescriptionView({ text }: { text: string | null }) {
  if (!text?.trim()) return <span className="text-[var(--muted)]">Not set</span>;

  // Texts with real newlines already carry their own structure.
  if (text.includes("\n")) {
    const lines = text.split(/\r?\n/);
    return (
      <div className="space-y-1.5 text-sm leading-relaxed">
        {lines.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          const bullet = /^[-•*]\s+/.test(trimmed);
          if (bullet) {
            return (
              <p key={i} className="flex gap-2 pl-1">
                <span className="text-[var(--muted)]">•</span>
                <span>{trimmed.replace(/^[-•*]\s+/, "")}</span>
              </p>
            );
          }
          const heading = trimmed.length <= 60 && /[:：]$/.test(trimmed);
          return heading ? (
            <p key={i} className="pt-1 font-semibold">
              {trimmed.replace(/[:：]$/, "")}
            </p>
          ) : (
            <p key={i}>{trimmed}</p>
          );
        })}
      </div>
    );
  }

  const blocks = splitFlatDescription(text.trim());
  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.kind === "paragraph") return <p key={i}>{b.text}</p>;
        const isList = LIST_LABELS.has(b.label.toLowerCase());
        return (
          <div key={i}>
            <span className="font-semibold">{normalizeLabel(b.label)}: </span>
            {isList ? (
              <ul className="mt-1 space-y-1 pl-1">
                {toBullets(b.body).map((s, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-[var(--muted)]">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span>{b.body}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
