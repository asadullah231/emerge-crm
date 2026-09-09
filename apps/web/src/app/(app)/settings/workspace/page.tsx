"use client";

import { useEffect, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function WorkspaceSettingsPage() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [compactLayout, setCompactLayout] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data?.workspace) {
      setName(me.data.workspace.name);
      setLogoUrl(me.data.workspace.logoUrl ?? "");
      setCompactLayout(me.data.workspace.compactLayout);
    }
  }, [me.data]);

  const update = trpc.workspace.update.useMutation({
    onSuccess: async () => {
      setSaved(true);
      await utils.auth.me.invalidate();
      setTimeout(() => setSaved(false), 2000);
    }
  });

  if (me.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading workspace...</p>;
  }
  if (me.error) {
    return <FormError message={me.error.message} />;
  }

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ name, logoUrl: logoUrl.trim() === "" ? null : logoUrl, compactLayout });
      }}
    >
      <h2 className="text-lg font-semibold">Workspace</h2>
      {!isAdmin ? (
        <p className="text-sm text-[var(--muted)]">Only admins can change workspace settings.</p>
      ) : null}
      <FormError message={update.error?.message} />
      <div>
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          required
          disabled={!isAdmin}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="ws-logo">Logo URL</Label>
        <Input
          id="ws-logo"
          type="url"
          placeholder="https://..."
          disabled={!isAdmin}
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Optional. Logo upload arrives with document storage in Milestone 7.
        </p>
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            disabled={!isAdmin}
            checked={compactLayout}
            onChange={(e) => setCompactLayout(e.target.checked)}
          />
          <span>
            Compact record pages for the team
            <span className="block text-xs text-[var(--muted)]">
              Trims candidate and job pages further for every team member: hides the compliance,
              assigned recruiters, sourcing summary and revenue sections, and moves Notes up on the
              candidate page. Admins keep the full layout.
            </span>
          </span>
        </label>
      </div>
      {isAdmin ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving..." : "Save changes"}
          </Button>
          {saved ? <span className="text-sm text-green-600">Saved</span> : null}
        </div>
      ) : null}
    </form>
  );
}
