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

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/candidates", label: "Candidates" },
  // Contacts merged into Clients (29 Aug); /contacts redirects there.
  { href: "/companies", label: "Clients" },
  { href: "/jobs", label: "Job Openings" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/interviews", label: "Interviews" },
  // Revenue page hidden for now (client request 29 Aug); restore by re-adding
  // { href: "/revenue", label: "Revenue" } and reverting revenue/page.tsx.
  // Activity merged into Reports (29 Aug); /activity redirects there.
  { href: "/reports", label: "Reports" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <>
      <AppSplash />
      <AppShell
        logo={
          <Link href="/dashboard" aria-label="Emerge CRM home">
            <LogoFull />
          </Link>
        }
        nav={<SidebarNav items={NAV_ITEMS} />}
        sidebarFooter={<ApiStatus />}
        mobileNav={<MobileNav items={NAV_ITEMS} />}
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
