"use client";

import { trpc } from "@/lib/trpc/client";

export function ApiStatus() {
  const ping = trpc.health.ping.useQuery(undefined, { refetchInterval: 30_000 });

  const state = ping.isLoading ? "checking" : ping.data?.pong ? "online" : "offline";
  const color =
    state === "online" ? "bg-emerald-500" : state === "checking" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>
        API {state}
        {ping.data ? ` (v${ping.data.version})` : ""}
      </span>
    </div>
  );
}
