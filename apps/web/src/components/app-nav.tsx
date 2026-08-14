"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@emerge/ui";
import { LogoMark } from "@/components/logo";

export type NavItem = { href: string; label: string };

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Vertical navigation for the expanded sidebar, with brand-navy active state. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav className="flex-1 space-y-1 p-2" aria-label="Main navigation">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--brand-primary-soft)] font-medium text-[var(--brand-primary)]"
                : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Compact top bar shown on small screens where the full sidebar is hidden. Uses
 * the compact brandmark and a toggle that reveals the same navigation.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const isActive = useIsActive();
  return (
    <div className="border-b border-[var(--border)] bg-[var(--card)] md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="Emerge CRM home">
          <LogoMark className="h-6 w-auto text-[var(--brand-primary)]" />
          <span className="font-semibold text-[var(--brand-primary)]">Emerge CRM</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)]"
        >
          <span aria-hidden className="text-lg leading-none">
            {open ? "✕" : "☰"}
          </span>
        </button>
      </div>
      {open ? (
        <nav className="space-y-1 px-2 pb-3" aria-label="Main navigation">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--brand-primary-soft)] font-medium text-[var(--brand-primary)]"
                    : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
