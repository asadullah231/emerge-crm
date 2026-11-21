"use client";

/*
 * Bullhorn's per-list toggle (Training 1.2): every list can flip to a
 * dashboard of cards about that entity. The choice is remembered per list.
 */

import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardBoard } from "./card-board";
import { ENTITY_DASHBOARDS, type EntityKey } from "./card-registry";

export function ListDashboardSwitch({
  entity,
  children
}: {
  entity: EntityKey;
  children: ReactNode;
}) {
  const conf = ENTITY_DASHBOARDS[entity];
  const storageKey = `emerge.listview.${entity}`;
  const [mode, setMode] = useState<"list" | "dashboard">("list");
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    try {
      const filtered = /[?&](status|ownerId|companyId|industry|source|employmentType)=/.test(
        window.location.search
      );
      if (!filtered && localStorage.getItem(storageKey) === "dashboard") setMode("dashboard");
    } catch {
      // Storage unavailable: start on the list.
    }
  }, [storageKey]);

  const choose = (m: "list" | "dashboard") => {
    setMode(m);
    try {
      localStorage.setItem(storageKey, m);
    } catch {
      // Not remembered; still switches for this visit.
    }
  };

  const btn = (m: "list" | "dashboard", label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => choose(m)}
      aria-pressed={mode === m}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        mode === m
          ? "bg-[var(--brand-primary)] text-white"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--card)] p-0.5">
          {btn("list", "List", <List className="h-3.5 w-3.5" />)}
          {btn("dashboard", "Dashboard", <BarChart3 className="h-3.5 w-3.5" />)}
        </div>
        {mode === "dashboard" ? (
          <Button type="button" size="sm" onClick={() => setLibraryOpen(true)}>
            <Plus /> Add card
          </Button>
        ) : null}
      </div>
      {mode === "list" ? (
        children
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">{conf.title}</h1>
          <CardBoard
            dashboardKey={conf.key}
            defaults={conf.defaults}
            categories={conf.categories}
            libraryOpen={libraryOpen}
            onLibraryOpenChange={setLibraryOpen}
          />
        </div>
      )}
    </div>
  );
}
