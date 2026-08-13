"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");

  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setTimeout(() => router.push("/login"), 1500);
    }
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="text-sm text-[var(--muted)]">
          This reset link is missing its token. Request a new one.
        </p>
        <Link href="/forgot-password" className="text-sm text-[var(--accent)] hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Password updated</h1>
        <p className="text-sm text-[var(--muted)]">
          Your password has been changed. Redirecting you to sign in...
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        reset.mutate({ token, password });
      }}
    >
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <FormError message={reset.error?.message} />
      <div>
        <Label htmlFor="password">New password</Label>
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
      <Button type="submit" className="w-full" disabled={reset.isPending}>
        {reset.isPending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
