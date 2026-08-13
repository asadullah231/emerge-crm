"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
      router.refresh();
    }
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ email, password });
      }}
    >
      <h1 className="text-lg font-semibold">Sign in</h1>
      <FormError message={login.error?.message} />
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
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="mb-1.5 text-xs text-[var(--accent)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? "Signing in..." : "Sign in"}
      </Button>
      <p className="text-center text-sm text-[var(--muted)]">
        No account yet?{" "}
        <Link href="/signup" className="text-[var(--accent)] hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
