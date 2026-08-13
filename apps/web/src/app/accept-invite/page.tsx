"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

function AcceptInviteCard() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const info = trpc.members.invitationInfo.useQuery({ token }, { enabled: token.length > 0 });

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const goToApp = () => {
    router.push("/dashboard");
    router.refresh();
  };
  const acceptExisting = trpc.members.acceptInvitationExisting.useMutation({
    onSuccess: goToApp
  });
  const acceptSignup = trpc.members.acceptInvitationSignup.useMutation({ onSuccess: goToApp });
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.reset()
  });

  if (!token) {
    return <p className="text-sm text-[var(--muted)]">This invitation link is incomplete.</p>;
  }
  if (info.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Checking invitation...</p>;
  }
  if (info.error || !info.data) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Invitation not found</h1>
        <p className="text-sm text-[var(--muted)]">
          This invitation is invalid, revoked, or has expired. Ask your admin to send a new one.
        </p>
      </div>
    );
  }

  const invite = info.data;
  const signedInUser = me.data?.user ?? null;
  const loginNext = `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Join {invite.workspaceName}</h1>
      <p className="text-sm text-[var(--muted)]">
        You have been invited to join <strong>{invite.workspaceName}</strong> as{" "}
        <strong>{invite.role === "readonly" ? "Read-only" : invite.role}</strong> ({invite.email}
        ).
      </p>
      <FormError message={acceptExisting.error?.message ?? acceptSignup.error?.message} />

      {signedInUser ? (
        signedInUser.email === invite.email ? (
          <Button
            className="w-full"
            onClick={() => acceptExisting.mutate({ token })}
            disabled={acceptExisting.isPending}
          >
            {acceptExisting.isPending ? "Joining..." : "Join workspace"}
          </Button>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            You are signed in as {signedInUser.email}, but this invitation was sent to{" "}
            {invite.email}.{" "}
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              Sign out and switch accounts
            </button>
          </p>
        )
      ) : invite.accountExists ? (
        <p className="text-sm text-[var(--muted)]">
          An account already exists for {invite.email}.{" "}
          <Link href={loginNext} className="text-[var(--accent)] hover:underline">
            Sign in to accept the invitation
          </Link>
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            acceptSignup.mutate({ token, name, password });
          }}
        >
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Choose a password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">At least 8 characters.</p>
          </div>
          <Button type="submit" className="w-full" disabled={acceptSignup.isPending}>
            {acceptSignup.isPending ? "Creating account..." : "Create account and join"}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
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
          <Suspense>
            <AcceptInviteCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
