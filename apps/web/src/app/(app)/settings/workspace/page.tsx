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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data?.workspace) {
      setName(me.data.workspace.name);
      setLogoUrl(me.data.workspace.logoUrl ?? "");
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
        update.mutate({ name, logoUrl: logoUrl.trim() === "" ? null : logoUrl });
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
