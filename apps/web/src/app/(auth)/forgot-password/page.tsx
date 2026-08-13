"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const request = trpc.auth.requestPasswordReset.useMutation();

  if (request.isSuccess) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-[var(--muted)]">
          If an account exists for {email}, a password reset link is on its way. The link expires in
          1 hour.
        </p>
        <Link href="/login" className="text-sm text-[var(--accent)] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        request.mutate({ email });
      }}
    >
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="text-sm text-[var(--muted)]">
        Enter your account email and we will send you a reset link.
      </p>
      <FormError message={request.error?.message} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={request.isPending}>
        {request.isPending ? "Sending..." : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
