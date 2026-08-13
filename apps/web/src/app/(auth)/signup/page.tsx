"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const signup = trpc.auth.signup.useMutation({
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
        signup.mutate({ name, email, password, workspaceName });
      }}
    >
      <h1 className="text-lg font-semibold">Create your account</h1>
      <FormError message={signup.error?.message} />
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
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
        <Label htmlFor="password">Password</Label>
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
      <div>
        <Label htmlFor="workspaceName">Workspace name</Label>
        <Input
          id="workspaceName"
          placeholder="e.g. Acme Recruiting"
          required
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Usually your agency name. You can invite your team after signup.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={signup.isPending}>
        {signup.isPending ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
