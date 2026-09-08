"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Lightweight rich rendering for note bodies everywhere in the app. Notes are
 * stored as plain text; this picks up the structure people already type:
 *
 * - bullet lines ("- ", "* ", "• ") and numbered lines ("1. ", "1) ")
 * - **bold** spans
 * - leading "Label:" prefixes (e.g. "Availability: 3 months") shown bold
 * - "@Name" mention highlights for the note's known mentions
 *
 * Nothing is required of the author; a note with none of these renders as
 * plain paragraphs exactly as before.
 */

const BULLET_RE = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBER_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;
// A short "Label:" prefix at the start of a line. The colon must be followed
// by a space or end the line, which keeps URLs ("https://...") unbolded.
const LABEL_RE = /^([A-Za-z][A-Za-z0-9 /()&'-]{0,39}):(?=\s|$)/;

/** "**bold**" spans, then mention highlights inside the remaining text. */
function renderInline(text: string, mentionNames: string[], keyBase: string): ReactNode {
  const boldParts = text.split(/\*\*([^*\n]+)\*\*/g);
  return boldParts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (i % 2 === 1) return <strong key={key}>{renderMentions(part, mentionNames, key)}</strong>;
    return <Fragment key={key}>{renderMentions(part, mentionNames, key)}</Fragment>;
  });
}

function renderMentions(text: string, mentionNames: string[], keyBase: string): ReactNode {
  if (mentionNames.length === 0) return text;
  const escaped = mentionNames
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts = text.split(re);
  return parts.map((part, i) =>
    mentionNames.includes(part) ? (
      <span key={`${keyBase}-m${i}`} className="font-medium text-[var(--brand-secondary)]">
        @{part}
      </span>
    ) : (
      <Fragment key={`${keyBase}-m${i}`}>{part}</Fragment>
    )
  );
}

/** One non-list line: bold a leading "Label:" when present. */
function renderTextLine(line: string, mentionNames: string[], keyBase: string): ReactNode {
  const label = LABEL_RE.exec(line);
  if (!label) return renderInline(line, mentionNames, keyBase);
  const rest = line.slice(label[0].length);
  return (
    <>
      <strong>{label[1]}:</strong>
      {renderInline(rest, mentionNames, keyBase)}
    </>
  );
}

type Block =
  { type: "text"; lines: string[] } | { type: "list"; ordered: boolean; items: string[] };

function toBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBER_RE.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1] ?? "";
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
    } else if (line.trim() === "") {
      // Blank line closes the current block; spacing comes from block gaps.
      if (last && (last.type !== "text" || last.lines.length > 0)) {
        blocks.push({ type: "text", lines: [] });
      }
    } else if (last?.type === "text") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "text", lines: [line] });
    }
  }
  return blocks.filter((b) => b.type === "list" || b.lines.length > 0);
}

export function NoteBody({
  body,
  mentionNames = [],
  className = "text-sm"
}: {
  body: string;
  mentionNames?: string[];
  className?: string;
}) {
  const blocks = toBlocks(body);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, bi) =>
        block.type === "list" ? (
          block.ordered ? (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderTextLine(item, mentionNames, `${bi}-${ii}`)}</li>
              ))}
            </ol>
          ) : (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderTextLine(item, mentionNames, `${bi}-${ii}`)}</li>
              ))}
            </ul>
          )
        ) : (
          <p key={bi} className="whitespace-pre-wrap">
            {block.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 ? "\n" : null}
                {renderTextLine(line, mentionNames, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}
