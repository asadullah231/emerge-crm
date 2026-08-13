"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/login");
      router.refresh();
    }
  });

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/settings/profile"
        className="text-sm font-medium hover:text-[var(--accent)]"
        title="Your profile"
      >
        {name}
      </Link>
      <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
        {role === "readonly" ? "Read-only" : role === "admin" ? "Admin" : "Recruiter"}
      </span>
      <button
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
