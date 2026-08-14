import { redirect } from "next/navigation";
import { LogoFull } from "@/components/logo";
import { getCurrentSession } from "@/server/auth/current";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center">
          <LogoFull />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
