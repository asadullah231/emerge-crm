"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@emerge/ui";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/audit-log", label: "Audit log" }
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      className="flex gap-1 border-b border-[var(--border)]"
      aria-label="Settings sections"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            pathname.startsWith(tab.href)
              ? "border-[var(--accent)] font-medium text-[var(--foreground)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
