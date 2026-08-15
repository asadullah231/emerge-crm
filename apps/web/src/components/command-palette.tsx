"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Hit = RouterOutputs["search"]["global"][number];

const TYPE_LABEL: Record<Hit["type"], string> = {
  candidate: "Candidates",
  job: "Jobs",
  company: "Companies",
  contact: "Contacts"
};
const TYPE_ORDER: Hit["type"][] = ["candidate", "job", "company", "contact"];

/**
 * Global Cmd/Ctrl-K search palette. Mounted once in the app shell. Opens on the
 * shortcut, queries search.global as you type, and navigates to the chosen
 * record with keyboard or mouse.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("emerge:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("emerge:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setDebounced("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounce the query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);

  const results = trpc.search.global.useQuery(
    { q: debounced, perType: 5 },
    { enabled: open && debounced.length > 0, staleTime: 10_000 }
  );

  const hits = useMemo(() => results.data ?? [], [results.data]);

  useEffect(() => setActive(0), [debounced, hits.length]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active]);
    }
  };

  if (!open) return null;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: hits.filter((h) => h.type === type)
  })).filter((g) => g.items.length > 0);

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search candidates, jobs, companies, contacts..."
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {debounced.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              Type to search. Press Esc to close.
            </p>
          ) : results.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Searching...</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">No matches.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.type}>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {TYPE_LABEL[group.type]}
                </p>
                {group.items.map((hit) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <button
                      key={hit.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(hit)}
                      className={
                        "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm " +
                        (idx === active
                          ? "bg-[var(--brand-primary-soft)]"
                          : "hover:bg-[var(--background)]")
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{hit.label}</span>
                        {hit.sublabel ? (
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {hit.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {hit.humanId ? (
                        <span className="shrink-0 text-xs text-[var(--muted)]">{hit.humanId}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
