"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@emerge/ui";
import { CommandPalette } from "./command-palette";

const STORAGE_KEY = "emerge:sidebar:collapsed";

/**
 * Client shell that owns sidebar collapse state (persisted in localStorage).
 * Server layout renders header/nav content as slots so it can stay a server
 * component and keep the auth check + data fetches server-side.
 */
export function AppShell({
  logo,
  nav,
  sidebarFooter,
  mobileNav,
  headerRight,
  children
}: {
  logo: ReactNode;
  nav: ReactNode;
  sidebarFooter: ReactNode;
  mobileNav: ReactNode;
  headerRight: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage blocked - keep default
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const hideSidebar = mounted && collapsed;

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "hidden w-56 flex-col border-r border-[var(--border)] bg-[var(--card)] md:flex",
          hideSidebar && "md:hidden"
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
          <div className="min-w-0 flex-1">{logo}</div>
          <button
            type="button"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            onClick={toggle}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            <span aria-hidden className="text-base leading-none">
              «
            </span>
          </button>
        </div>
        {nav}
        <div className="border-t border-[var(--border)] p-3">{sidebarFooter}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {mobileNav}
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4">
          {hideSidebar ? (
            <button
              type="button"
              aria-label="Open sidebar"
              title="Open sidebar"
              onClick={toggle}
              className="hidden h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)] md:flex"
            >
              <span aria-hidden className="text-base leading-none">
                »
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("emerge:search"))}
            className="hidden items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] sm:flex"
          >
            <span>Search</span>
            <kbd className="rounded bg-[var(--card)] px-1.5 py-0.5 text-xs">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">{headerRight}</div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
