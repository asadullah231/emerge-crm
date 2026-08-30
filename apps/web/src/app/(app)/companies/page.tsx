"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { ClientsView } from "@/components/clients-view";
import { ContactsView } from "@/components/contacts-view";

/**
 * Clients and Contacts share one page (client request 29 Aug); /contacts
 * redirects here with ?tab=contacts. Each tab keeps its own full list,
 * filters, saved views and bulk bar.
 */
export default function CompaniesPage() {
  const [tab, setTab] = useState<"clients" | "contacts">(() => {
    if (typeof window === "undefined") return "clients";
    return new URLSearchParams(window.location.search).get("tab") === "contacts"
      ? "contacts"
      : "clients";
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["clients", "contacts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "clients" ? <ClientsView /> : <ContactsView />}
    </div>
  );
}
