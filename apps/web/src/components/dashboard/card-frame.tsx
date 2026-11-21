"use client";

/*
 * Bullhorn-style card chrome (Training 1.2): drag handle + title on the left;
 * graph/list toggle, Configure Card (gear), refresh and remove on the right.
 * Plus the Configure Card dialog and the searchable Card Library panel.
 */

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  BarChart3,
  Check,
  GripVertical,
  List,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  X,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import {
  CARD_CATEGORIES,
  CARD_META,
  DATE_PRESET_LABELS,
  viewOf,
  type CardFilter,
  type CardInstance,
  type CardSize,
  type CardType,
  type DatePreset
} from "./card-registry";

const SIZE_CLASS: Record<CardSize, string> = {
  s: "",
  m: "md:col-span-2",
  l: "md:col-span-2 xl:col-span-4"
};

export function CardFrame({
  card,
  dragging,
  headerExtra,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onPatch,
  onRemove,
  onConfigure,
  onRefresh,
  children
}: {
  card: CardInstance;
  dragging: boolean;
  headerExtra?: ReactNode;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onPatch: (patch: Partial<CardInstance>) => void;
  onRemove: () => void;
  onConfigure: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const meta = CARD_META[card.type];
  const title = card.title?.trim() || meta.title;
  const view = viewOf(card);
  const icon =
    "rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)]";
  const fixed = card.size !== "l";
  return (
    <section
      className={`flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm transition-opacity ${SIZE_CLASS[card.size]} ${dragging ? "opacity-40" : ""}`}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDragEnter={onDragEnter}
      aria-label={title}
    >
      <header className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", card.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className="cursor-grab rounded p-0.5 text-[var(--muted)] hover:bg-[var(--background)] active:cursor-grabbing"
          title="Drag to move"
          aria-label="Drag to move card"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">
          {title}
        </h2>
        {headerExtra}
        {meta.toggle ? (
          <button
            type="button"
            className={icon}
            onClick={() => onPatch({ view: view === "chart" ? "list" : "chart" })}
            title={view === "chart" ? "Show as list" : "Show as graph"}
            aria-label={view === "chart" ? "Show as list" : "Show as graph"}
          >
            {view === "chart" ? (
              <List className="h-3.5 w-3.5" />
            ) : (
              <BarChart3 className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className={icon}
          onClick={onConfigure}
          title="Configure card"
          aria-label="Configure card"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={icon}
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh card"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={icon}
          onClick={onRemove}
          title="Remove card"
          aria-label="Remove card"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className={`min-w-0 flex-1 p-3 ${fixed ? "h-[340px] overflow-y-auto" : ""}`}>
        {children}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------- */
/* Configure Card dialog                                                       */
/* --------------------------------------------------------------------------- */

const field =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm";
const label = "mb-1 block text-xs font-medium text-[var(--muted)]";

export function ConfigureDialog({
  card,
  onApply,
  onClose
}: {
  card: CardInstance;
  onApply: (patch: Partial<CardInstance>) => void;
  onClose: () => void;
}) {
  const meta = CARD_META[card.type];
  const has = (k: (typeof meta.filters)[number]) => meta.filters.includes(k);
  const [title, setTitle] = useState(card.title ?? "");
  const [size, setSize] = useState<CardSize>(card.size);
  const [f, setF] = useState<CardFilter>(card.filter ?? {});
  const members = trpc.members.list.useQuery(undefined, { enabled: has("user") });
  const companies = trpc.companies.list.useQuery(
    { page: 1, pageSize: 200 },
    { enabled: has("company") }
  );
  const options = trpc.jobs.filterOptions.useQuery(undefined, { enabled: has("industry") });
  const scope = f.scope ?? "all";
  const set = (patch: Partial<CardFilter>) => setF((c) => ({ ...c, ...patch }));

  const apply = () => {
    const clean: CardFilter = { ...f };
    for (const k of Object.keys(clean) as (keyof CardFilter)[]) {
      const v = clean[k];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete clean[k];
    }
    if (clean.scope !== "users") delete clean.userIds;
    if (clean.scope === "all") delete clean.scope;
    if (clean.datePreset === "all") delete clean.datePreset;
    onApply({
      title: title.trim() || undefined,
      size,
      filter: Object.keys(clean).length ? clean : undefined
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configure card"
        className="w-full max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0 flex-1">
            <label className={label} htmlFor="card-title">
              Rename card
            </label>
            <input
              id="card-title"
              className={`${field} max-w-sm`}
              placeholder={meta.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--background)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 p-4 md:grid-cols-3">
          <div className="space-y-4">
            <div>
              <p className={label}>Card size</p>
              <div className="flex gap-1">
                {(["s", "m", "l"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${size === s ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary-soft)] font-medium text-[var(--brand-secondary)]" : "border-[var(--border)]"}`}
                  >
                    {s === "s" ? "Small" : s === "m" ? "Wide" : "Full width"}
                  </button>
                ))}
              </div>
            </div>
            {has("user") ? (
              <fieldset>
                <legend className={label}>User</legend>
                {(
                  [
                    ["all", "Everyone"],
                    ["mine", meta.mineLabel ?? "Mine"],
                    ["users", "Selected users"]
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === v}
                      onChange={() => set({ scope: v })}
                    />
                    {l}
                  </label>
                ))}
                {scope === "users" ? (
                  <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                    {(members.data ?? []).map((m) => {
                      const on = (f.userIds ?? []).includes(m.userId);
                      return (
                        <label key={m.userId} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              set({
                                userIds: on
                                  ? (f.userIds ?? []).filter((id) => id !== m.userId)
                                  : [...(f.userIds ?? []), m.userId]
                              })
                            }
                          />
                          {m.name}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </fieldset>
            ) : null}
          </div>

          <div>
            {has("date") ? (
              <>
                <label className={label} htmlFor="card-date">
                  Date added
                </label>
                <select
                  id="card-date"
                  className={field}
                  value={f.datePreset ?? "all"}
                  onChange={(e) => set({ datePreset: e.target.value as DatePreset })}
                >
                  {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
                    <option key={p} value={p}>
                      {DATE_PRESET_LABELS[p]}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {meta.filters.length === 0
                  ? "This card follows the date range and recruiter filters at the top of the dashboard."
                  : "No date filter for this card."}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {has("company") ? (
              <div>
                <label className={label} htmlFor="card-company">
                  Client
                </label>
                <select
                  id="card-company"
                  className={field}
                  value={f.companyId ?? ""}
                  onChange={(e) => set({ companyId: e.target.value || undefined })}
                >
                  <option value="">All clients</option>
                  {(companies.data?.rows ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {has("industry") ? (
              <div>
                <label className={label} htmlFor="card-industry">
                  Business sector
                </label>
                <select
                  id="card-industry"
                  className={field}
                  value={f.industry ?? ""}
                  onChange={(e) => set({ industry: e.target.value || undefined })}
                >
                  <option value="">All sectors</option>
                  {(options.data?.industries ?? []).map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {has("jobType") ? (
              <div>
                <label className={label} htmlFor="card-jobtype">
                  Job type
                </label>
                <select
                  id="card-jobtype"
                  className={field}
                  value={f.employmentType ?? ""}
                  onChange={(e) =>
                    set({
                      employmentType: (e.target.value || undefined) as CardFilter["employmentType"]
                    })
                  }
                >
                  <option value="">All types</option>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                </select>
              </div>
            ) : null}
            {has("skill") ? (
              <div>
                <label className={label} htmlFor="card-skill">
                  Required skill
                </label>
                <input
                  id="card-skill"
                  className={field}
                  placeholder="e.g. Java"
                  value={f.skill ?? ""}
                  maxLength={80}
                  onChange={(e) => set({ skill: e.target.value || undefined })}
                />
              </div>
            ) : null}
            {has("source") ? (
              <div>
                <label className={label} htmlFor="card-source">
                  Source
                </label>
                <input
                  id="card-source"
                  className={field}
                  placeholder="e.g. referral"
                  value={f.source ?? ""}
                  maxLength={80}
                  onChange={(e) => set({ source: e.target.value || undefined })}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Card library                                                                */
/* --------------------------------------------------------------------------- */

export function CardLibrary({
  layout,
  onAdd,
  onReset,
  onClose
}: {
  layout: CardInstance[];
  onAdd: (type: CardType) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const all = Object.keys(CARD_META) as CardType[];
  const onBoard = useMemo(() => {
    const m = new Map<CardType, number>();
    for (const c of layout) m.set(c.type, (m.get(c.type) ?? 0) + 1);
    return m;
  }, [layout]);
  const match = (t: CardType) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const m = CARD_META[t];
    return `${m.title} ${m.description} ${m.category}`.toLowerCase().includes(s);
  };
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[var(--border)] bg-[var(--brand-primary)] text-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards"
            aria-label="Search cards"
            className="w-full rounded-md border border-white/15 bg-white/10 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-white/40"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10"
          aria-label="Close card library"
        >
          Close
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {CARD_CATEGORIES.map((cat) => {
          const types = all.filter((t) => CARD_META[t].category === cat && match(t));
          if (types.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                {cat}
              </p>
              <ul className="grid grid-cols-1 gap-1">
                {types.map((t) => {
                  const n = onBoard.get(t) ?? 0;
                  return (
                    <li key={t}>
                      <button
                        type="button"
                        onClick={() => onAdd(t)}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                        title={n ? "Add another copy with different filters" : "Add to dashboard"}
                      >
                        {n ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-secondary-emphasis)]" />
                        ) : (
                          <Plus className="mt-0.5 h-4 w-4 shrink-0 text-white/60" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {CARD_META[t].title}
                            {n > 1 ? (
                              <span className="ml-1 text-xs text-white/60">x{n}</span>
                            ) : null}
                          </span>
                          <span className="block text-xs text-white/60">
                            {CARD_META[t].description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to default layout
        </button>
      </div>
    </div>
  );
}
