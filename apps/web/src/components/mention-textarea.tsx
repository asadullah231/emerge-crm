"use client";

import { useRef, useState } from "react";
import { cn } from "@emerge/ui";

export type MentionMember = { userId: string; name: string };

/**
 * Textarea with @-mention autocomplete (Zoho parity: "@mention to notify
 * users"). Type "@" then a name; pick a member to insert "@Name". Tracked
 * mentions are reported via onMentionsChange; the parent filters them to those
 * still present in the body before saving.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  onMentionsChange,
  placeholder = "Add a note... @mention to notify",
  rows = 3
}: {
  value: string;
  onChange: (value: string) => void;
  members: MentionMember[];
  onMentionsChange: (mentions: MentionMember[]) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [tracked, setTracked] = useState<MentionMember[]>([]);
  const [active, setActive] = useState(0);

  // The @-token immediately before the caret (letters/digits/._-, no spaces).
  const tokenBeforeCaret = (text: string, caret: number): { start: number; q: string } | null => {
    const upto = text.slice(0, caret);
    const m = /(^|\s)@([\w.-]*)$/.exec(upto);
    if (!m) return null;
    const q = m[2] ?? "";
    return { start: caret - q.length, q };
  };

  const matches =
    query === null
      ? []
      : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const handleChange = (text: string) => {
    onChange(text);
    const caret = ref.current?.selectionStart ?? text.length;
    const tok = tokenBeforeCaret(text, caret);
    setQuery(tok ? tok.q : null);
    setActive(0);
  };

  const pick = (member: MentionMember) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const tok = tokenBeforeCaret(value, caret);
    if (!tok) return;
    const before = value.slice(0, tok.start - 1); // drop the "@"
    const after = value.slice(caret);
    const insert = `@${member.name} `;
    const next = `${before}${insert}${after}`;
    onChange(next);
    const nextTracked = tracked.some((t) => t.userId === member.userId)
      ? tracked
      : [...tracked, member];
    setTracked(nextTracked);
    onMentionsChange(nextTracked);
    setQuery(null);
    // Restore focus + caret after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (query !== null && matches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]!);
            } else if (e.key === "Escape") {
              setQuery(null);
            }
          }
        }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--brand-secondary)] focus:outline-none"
      />
      {query !== null && matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {matches.map((m, i) => (
            <li key={m.userId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-sm",
                  i === active
                    ? "bg-[var(--brand-secondary-soft)] text-[var(--brand-secondary)]"
                    : "hover:bg-[var(--background)]"
                )}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
