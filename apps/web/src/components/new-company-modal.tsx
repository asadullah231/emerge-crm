"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { COMPANY_STATUS_OPTIONS, DuplicateWarning } from "@/components/record";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

type CreatedCompany = RouterOutputs["companies"]["create"];

/**
 * Create a client company. Used standalone on the Clients page (navigates to
 * the new record) and nested inside other forms via `onCreated` (M15: quick
 * create from the New job opening modal), which selects the new client in
 * place instead of navigating away.
 */
export function NewCompanyModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (company: CreatedCompany) => void | Promise<void>;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"prospect" | "active" | "dormant">("prospect");

  const debouncedName = useDebounced(name.trim());
  const debouncedWebsite = useDebounced(website.trim());
  const duplicates = trpc.companies.duplicates.useQuery(
    { name: debouncedName || undefined, website: debouncedWebsite || undefined },
    { enabled: open && (debouncedName.length > 1 || debouncedWebsite.length > 3) }
  );

  const reset = () => {
    setName("");
    setWebsite("");
    setIndustry("");
    setLocation("");
    setStatus("prospect");
  };

  const create = trpc.companies.create.useMutation({
    onSuccess: async (created) => {
      await utils.companies.list.invalidate();
      reset();
      onClose();
      if (onCreated) await onCreated(created);
      else router.push(`/companies/${created.id}`);
    }
  });

  return (
    <Modal title="New client" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name: name.trim(),
            website: website.trim() || null,
            industry: industry.trim() || null,
            location: location.trim() || null,
            status
          });
        }}
      >
        <FormError message={create.error?.message} />
        <div>
          <Label htmlFor="company-name">Name</Label>
          <Input
            id="company-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Porsche Consulting"
          />
        </div>
        <div>
          <Label htmlFor="company-website">Website</Label>
          <Input
            id="company-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="company-industry">Industry</Label>
            <Input
              id="company-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="company-location">Location</Label>
            <Input
              id="company-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="company-status">Status</Label>
          <select
            id="company-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {COMPANY_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <DuplicateWarning
          items={(duplicates.data ?? []).map((d) => ({
            id: d.id,
            label: d.domain ? `${d.name} (${d.domain})` : d.name,
            href: `/companies/${d.id}`
          }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
