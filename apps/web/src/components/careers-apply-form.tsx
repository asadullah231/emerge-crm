"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-secondary)] focus:ring-2 focus:ring-[var(--brand-secondary-soft)]";

/** Public apply form on the careers job page (M19). Posts to /api/public/apply. */
export function CareersApplyForm({ workspaceId, jobId }: { workspaceId: string; jobId: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("submitting");
    try {
      const res = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          jobId,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          note: note.trim() || undefined
        })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not submit your application");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Could not submit your application, please try again");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm">
        <p className="font-semibold">Application received</p>
        <p className="mt-1 text-[var(--muted)]">
          Thanks for applying. The team will review your application and get back to you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            autoComplete="given-name"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Last name *</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={inputClass}
            autoComplete="family-name"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Email *</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
            autoComplete="email"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            autoComplete="tel"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Anything you want to add</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="A short intro, a LinkedIn profile link, notice period..."
        />
      </label>
      <button
        type="submit"
        disabled={state === "submitting"}
        className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-on)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
      >
        {state === "submitting" ? "Submitting..." : "Submit application"}
      </button>
    </form>
  );
}
