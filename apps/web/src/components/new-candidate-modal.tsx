"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { CANDIDATE_SOURCE_OPTIONS, DuplicateWarning } from "@/components/record";
import { trpc } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

export function candidateName(row: { firstName: string | null; lastName: string }): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ");
}

export function NewCandidateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<"manual" | "referral" | "import" | "parser" | "api">(
    "manual"
  );

  const debouncedEmail = useDebounced(email.trim());
  const duplicates = trpc.candidates.duplicates.useQuery(
    { email: debouncedEmail || undefined },
    { enabled: open && debouncedEmail.includes("@") }
  );

  const reset = () => {
    setFirstName("");
    setLastName("");
    setTitle("");
    setEmail("");
    setPhone("");
    setSource("manual");
  };

  const create = trpc.candidates.create.useMutation({
    onSuccess: async (created) => {
      await utils.candidates.list.invalidate();
      reset();
      onClose();
      router.push(`/candidates/${created.id}`);
    }
  });

  return (
    <Modal title="New candidate" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            firstName: firstName.trim() || null,
            lastName: lastName.trim(),
            title: title.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            source
          });
        }}
      >
        <FormError message={create.error?.message} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cand-first">First name</Label>
            <Input
              id="cand-first"
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cand-last">Last name</Label>
            <Input
              id="cand-last"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="cand-title">Current title</Label>
          <Input id="cand-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cand-email">Email</Label>
            <Input
              id="cand-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cand-phone">Phone</Label>
            <Input id="cand-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="cand-source">Source</Label>
          <select
            id="cand-source"
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {CANDIDATE_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <DuplicateWarning
          items={(duplicates.data ?? []).map((d) => ({
            id: d.id,
            label: `${candidateName(d)}${d.email ? ` (${d.email})` : ""}`,
            href: `/candidates/${d.id}`
          }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create candidate"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
