import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-sm font-bold text-white">
            E
          </span>
          <span className="text-lg font-semibold">Emerge CRM</span>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
