"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { DuplicateWarning } from "@/components/record";
import { trpc } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

export function contactName(row: { firstName: string | null; lastName: string }): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ");
}

export function NewContactModal({
  open,
  onClose,
  defaultCompanyId
}: {
  open: boolean;
  onClose: () => void;
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");

  const companyOptions = trpc.companies.list.useQuery(
    { page: 1, pageSize: 200, sortBy: "name", sortDir: "asc", deleted: false },
    { enabled: open }
  );

  const debouncedEmail = useDebounced(email.trim());
  const duplicates = trpc.contacts.duplicates.useQuery(
    { email: debouncedEmail || undefined },
    { enabled: open && debouncedEmail.includes("@") }
  );

  const create = trpc.contacts.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.contacts.list.invalidate(),
        created.companyId ? utils.companies.get.invalidate({ id: created.companyId }) : null
      ]);
      onClose();
      router.push(`/contacts/${created.id}`);
    }
  });

  return (
    <Modal title="New contact" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            firstName: firstName.trim() || null,
            lastName: lastName.trim(),
            title: title.trim() || null,
            email: email.trim() || null,
            companyId: companyId || null
          });
        }}
      >
        <FormError message={create.error?.message} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="contact-first">First name</Label>
            <Input
              id="contact-first"
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contact-last">Last name</Label>
            <Input
              id="contact-last"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="contact-title">Job title</Label>
          <Input id="contact-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="contact-company">Company</Label>
          <select
            id="contact-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">No company (independent contact)</option>
            {companyOptions.data?.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <DuplicateWarning
          items={(duplicates.data ?? []).map((d) => ({
            id: d.id,
            label: `${contactName(d)}${d.email ? ` (${d.email})` : ""}`,
            href: `/contacts/${d.id}`
          }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
