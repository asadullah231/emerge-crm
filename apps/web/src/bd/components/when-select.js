"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** Time filter as one small dropdown instead of a row of pills. */
export function WhenSelect({ value, options }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-mute">
      Show
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          if (e.target.value === "all") p.delete("when");
          else p.set("when", e.target.value);
          const q = p.toString();
          router.push(q ? `${pathname}?${q}` : pathname);
        }}
        className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-black/30"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
