"use client";

import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { RoleBadge } from "@/components/role-badge";
import { trpc } from "@/lib/trpc/client";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recruiter", label: "Recruiter" },
  { value: "readonly", label: "Read-only" }
] as const;

function RoleSelect({
  value,
  onChange,
  disabled,
  ariaLabel
}: {
  value: string;
  onChange: (role: "admin" | "recruiter" | "readonly") => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as "admin" | "recruiter" | "readonly")}
      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

export default function MembersSettingsPage() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";

  const members = trpc.members.list.useQuery();
  const pending = trpc.members.pendingInvitations.useQuery(undefined, { enabled: isAdmin });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "recruiter" | "readonly">("recruiter");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([utils.members.list.invalidate(), utils.members.pendingInvitations.invalidate()]);

  const invite = trpc.members.invite.useMutation({
    onSuccess: async (data) => {
      setLastInviteUrl(data.acceptUrl);
      setEmail("");
      await refresh();
    }
  });
  const revoke = trpc.members.revokeInvitation.useMutation({ onSuccess: refresh });
  const changeRole = trpc.members.changeRole.useMutation({ onSuccess: refresh });
  const deactivate = trpc.members.deactivate.useMutation({ onSuccess: refresh });
  const reactivate = trpc.members.reactivate.useMutation({ onSuccess: refresh });

  const actionError =
    invite.error?.message ??
    revoke.error?.message ??
    changeRole.error?.message ??
    deactivate.error?.message ??
    reactivate.error?.message;

  if (members.isLoading || me.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading members...</p>;
  }
  if (members.error) {
    return <FormError message={members.error.message} />;
  }

  return (
    <div className="space-y-8">
      <FormError message={actionError} />

      {isAdmin ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Invite someone</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate({ email, role });
            }}
          >
            <div className="min-w-64 flex-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="colleague@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <RoleSelect ariaLabel="Invite role" value={role} onChange={setRole} />
            </div>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Sending..." : "Send invitation"}
            </Button>
          </form>
          {lastInviteUrl ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <p className="mb-1 font-medium">Invitation sent.</p>
              <p className="text-[var(--muted)]">
                You can also share this link directly:{" "}
                <code data-testid="invite-link" className="break-all text-xs">
                  {lastInviteUrl}
                </code>
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {isAdmin && pending.data && pending.data.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pending invitations</h2>
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pending.data.map((inv) => (
                  <tr key={inv.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2">{inv.email}</td>
                    <td className="px-3 py-2">
                      <RoleBadge role={inv.role} />
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => revoke.mutate({ invitationId: inv.id })}
                        disabled={revoke.isPending}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {isAdmin ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => {
                const isSelf = m.userId === me.data?.user.id;
                return (
                  <tr
                    key={m.membershipId}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      {m.name}
                      {isSelf ? (
                        <span className="ml-1 text-xs text-[var(--muted)]">(you)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{m.email}</td>
                    <td className="px-3 py-2">
                      {isAdmin && !m.deactivatedAt ? (
                        <RoleSelect
                          ariaLabel={`Role for ${m.name}`}
                          value={m.role}
                          disabled={changeRole.isPending}
                          onChange={(newRole) =>
                            changeRole.mutate({ membershipId: m.membershipId, role: newRole })
                          }
                        />
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {m.deactivatedAt ? (
                        <span className="text-xs text-red-600">Deactivated</span>
                      ) : (
                        <span className="text-xs text-green-600">Active</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2 text-right">
                        {isSelf ? null : m.deactivatedAt ? (
                          <button
                            onClick={() => reactivate.mutate({ membershipId: m.membershipId })}
                            disabled={reactivate.isPending}
                            className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => deactivate.mutate({ membershipId: m.membershipId })}
                            disabled={deactivate.isPending}
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isAdmin ? (
          <p className="text-xs text-[var(--muted)]">
            Only admins can invite members or change roles.
          </p>
        ) : null}
      </section>
    </div>
  );
}
