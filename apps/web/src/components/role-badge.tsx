import { cn } from "@emerge/ui";

const STYLES: Record<string, string> = {
  admin: "bg-[var(--accent)]/10 text-[var(--accent)]",
  recruiter: "bg-green-500/10 text-green-600",
  readonly: "bg-zinc-500/10 text-zinc-500"
};

const LABELS: Record<string, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  readonly: "Read-only"
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[role] ?? "bg-zinc-500/10 text-zinc-500"
      )}
    >
      {LABELS[role] ?? role}
    </span>
  );
}
