import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileNav, SidebarNav, type NavItem } from "@/components/app-nav";
import { AppShell } from "@/components/app-shell";
import { AppSplash } from "@/components/app-splash";
import { LogoFull } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { ApiStatus } from "@/components/api-status";
import { UserMenu } from "@/components/user-menu";
import { getCurrentSession } from "@/server/auth/current";
import { bdAccess } from "@/bd/access";

// Contacts live inside Clients; Interviews, Reports and Activity live inside
// Tasks (29 Aug merges; the old URLs redirect). Revenue is hidden for now:
// restore by re-adding { href: "/revenue", label: "Revenue" } and reverting
// revenue/page.tsx.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Job Openings" },
  { href: "/candidates", label: "Candidates" },
  { href: "/companies", label: "Clients" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/tasks?tab=interviews", label: "Interviews" },
  { href: "/tasks", label: "Tasks" },
  { href: "/reports/recruiters", label: "Reports" },
  { href: "/settings", label: "Settings" }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  // BD Outreach is a per-workspace module (Settings > Workspace); the item only
  // appears for workspaces that switched it on.
  const bd = await bdAccess();
  const navItems: NavItem[] = bd.enabled
    ? NAV_ITEMS.flatMap((item) =>
        item.href === "/settings" ? [{ href: "/bd", label: "BD Outreach" }, item] : [item]
      )
    : NAV_ITEMS;

  return (
    <>
      <AppSplash />
      <AppShell
        logo={
          <Link href="/dashboard" aria-label="Emerge CRM home">
            <LogoFull />
          </Link>
        }
        nav={<SidebarNav items={navItems} />}
        sidebarFooter={<ApiStatus />}
        mobileNav={<MobileNav items={navItems} />}
        headerRight={
          <>
            <NotificationBell />
            <UserMenu name={session.user.name} role={session.role} />
            <ThemeToggle />
          </>
        }
      >
        {children}
      </AppShell>
    </>
  );
}
