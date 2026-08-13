"use client";

import { useEffect, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function ProfileSettingsPage() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data) {
      setName(me.data.user.name);
      setTimezone(me.data.user.timezone);
      setAvatarUrl(me.data.user.avatarUrl ?? "");
    }
  }, [me.data]);

  const update = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      setSaved(true);
      await utils.auth.me.invalidate();
      setTimeout(() => setSaved(false), 2000);
    }
  });

  if (me.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading profile...</p>;
  }
  if (me.error) {
    return <FormError message={me.error.message} />;
  }

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          name,
          timezone,
          avatarUrl: avatarUrl.trim() === "" ? null : avatarUrl
        });
      }}
    >
      <h2 className="text-lg font-semibold">Profile</h2>
      <FormError message={update.error?.message} />
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={me.data?.user.email ?? ""} disabled />
        <p className="mt-1 text-xs text-[var(--muted)]">Email cannot be changed yet.</p>
      </div>
      <div>
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          placeholder="e.g. Europe/London"
          required
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="avatarUrl">Avatar URL</Label>
        <Input
          id="avatarUrl"
          type="url"
          placeholder="https://..."
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Optional. Image upload arrives with document storage in Milestone 7.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving..." : "Save changes"}
        </Button>
        {saved ? <span className="text-sm text-green-600">Saved</span> : null}
      </div>
    </form>
  );
}
