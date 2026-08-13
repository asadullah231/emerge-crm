export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Welcome to Emerge CRM. This is the Milestone 0 foundation build: the modules in the sidebar
        arrive milestone by milestone, starting with authentication and workspaces.
      </p>
      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
        <p className="font-medium">Project status</p>
        <p className="mt-1 text-[var(--muted)]">
          Milestone 0: Project Foundation (v0.1.0). See docs/roadmap.md for the full plan.
        </p>
      </div>
    </div>
  );
}
