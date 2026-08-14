import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileNav, SidebarNav, type NavItem } from "@/components/app-nav";
import { LogoFull } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { ApiStatus } from "@/components/api-status";
import { UserMenu } from "@/components/user-menu";
import { getCurrentSession } from "@/server/auth/current";

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/candidates", label: "Candidates" },
  { href: "/companies", label: "Companies" },
  { href: "/contacts", label: "Contacts" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/activity", label: "Activity" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col border-r border-[var(--border)] bg-[var(--card)] md:flex">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
          <Link href="/dashboard" aria-label="Emerge CRM home">
            <LogoFull />
          </Link>
        </div>
        <SidebarNav items={NAV_ITEMS} />
        <div className="border-t border-[var(--border)] p-3">
          <ApiStatus />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav items={NAV_ITEMS} />
        <header className="flex h-14 items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4">
          <NotificationBell />
          <UserMenu name={session.user.name} role={session.role} />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
