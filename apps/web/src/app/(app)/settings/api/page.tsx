"use client";

import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

const chipClass =
  "rounded-full bg-[var(--background)] px-2 py-0.5 text-[11px] text-[var(--muted)] ring-1 ring-[var(--border)]";

/**
 * API keys + outbound webhooks settings (M19). Admin-only in practice: the
 * underlying procedures are adminProcedure, so non-admins see errors.
 */
export default function ApiSettingsPage() {
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">API and webhooks</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Programmatic access to your workspace and event notifications to external systems.
        </p>
      </div>
      {!isAdmin ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Only admins can manage API keys and webhooks.
        </p>
      ) : (
        <>
          <ApiKeysSection />
          <WebhooksSection />
        </>
      )}
    </div>
  );
}

function ApiKeysSection() {
  const utils = trpc.useUtils();
  const scopes = trpc.apiKeys.scopes.useQuery();
  const list = trpc.apiKeys.list.useQuery();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);

  const create = trpc.apiKeys.create.useMutation({
    onSuccess: (res) => {
      setNewKey(res.key);
      setName("");
      setPicked([]);
      utils.apiKeys.list.invalidate();
    }
  });
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => utils.apiKeys.list.invalidate()
  });

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div>
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="text-sm text-[var(--muted)]">
          REST access at /api/v1 (candidates, jobs, applications). Send the key as{" "}
          <code className="rounded bg-[var(--background)] px-1">Authorization: Bearer ...</code>
        </p>
      </div>
      <FormError message={create.error?.message ?? revoke.error?.message} />

      {newKey ? (
        <div className="space-y-1 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm">
          <p className="font-semibold">Copy this key now, it will not be shown again:</p>
          <code className="block select-all break-all rounded bg-[var(--background)] px-2 py-1">
            {newKey}
          </code>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:underline"
            onClick={() => setNewKey(null)}
          >
            Done, hide it
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. n8n integration"
          />
        </div>
        <div>
          <Label>Scopes</Label>
          <div className="flex flex-wrap gap-2 pt-1">
            {(scopes.data ?? []).map((s) => (
              <label key={s} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))
                  }
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        <Button
          disabled={!name.trim() || picked.length === 0 || create.isPending}
          onClick={() =>
            create.mutate({
              name: name.trim(),
              scopes: picked as Parameters<typeof create.mutate>[0]["scopes"]
            })
          }
        >
          {create.isPending ? "Creating..." : "Create key"}
        </Button>
      </div>

      {(list.data ?? []).length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {(list.data ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {k.name}{" "}
                  <code className="rounded bg-[var(--background)] px-1 text-xs">{k.prefix}...</code>
                  {k.revokedAt ? (
                    <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600">
                      Revoked
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className={chipClass}>
                      {s}
                    </span>
                  ))}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {k.lastUsedAt
                    ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                </p>
              </div>
              {!k.revokedAt ? (
                <Button
                  variant="danger"
                  className="px-3 py-1"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (window.confirm(`Revoke "${k.name}"? Integrations using it will stop.`)) {
                      revoke.mutate({ id: k.id });
                    }
                  }}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">No API keys yet.</p>
      )}
    </section>
  );
}

function WebhooksSection() {
  const utils = trpc.useUtils();
  const events = trpc.webhooks.events.useQuery();
  const list = trpc.webhooks.list.useQuery();
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);

  const create = trpc.webhooks.create.useMutation({
    onSuccess: (res) => {
      setNewSecret(res.secret);
      setUrl("");
      setPicked([]);
      utils.webhooks.list.invalidate();
    }
  });
  const setActive = trpc.webhooks.setActive.useMutation({
    onSuccess: () => utils.webhooks.list.invalidate()
  });
  const remove = trpc.webhooks.delete.useMutation({
    onSuccess: () => utils.webhooks.list.invalidate()
  });
  const deliveries = trpc.webhooks.deliveries.useQuery(
    { subscriptionId: showDeliveries ?? "" },
    { enabled: Boolean(showDeliveries) }
  );

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div>
        <h2 className="text-lg font-semibold">Webhooks</h2>
        <p className="text-sm text-[var(--muted)]">
          POST record events to your own URLs (n8n, Zapier, custom). Each delivery is signed with
          HMAC-SHA256 in the X-Emerge-Signature header.
        </p>
      </div>
      <FormError
        message={create.error?.message ?? setActive.error?.message ?? remove.error?.message}
      />

      {newSecret ? (
        <div className="space-y-1 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm">
          <p className="font-semibold">Signing secret, copy it now (shown once):</p>
          <code className="block select-all break-all rounded bg-[var(--background)] px-2 py-1">
            {newSecret}
          </code>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:underline"
            onClick={() => setNewSecret(null)}
          >
            Done, hide it
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label htmlFor="wh-url">Endpoint URL</Label>
          <Input
            id="wh-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhooks/emerge"
          />
        </div>
        <div>
          <Label>Events</Label>
          <div className="flex flex-wrap gap-2 pt-1">
            {(events.data ?? []).map((ev) => (
              <label key={ev} className="inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(ev)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, ev] : p.filter((x) => x !== ev)))
                  }
                />
                {ev}
              </label>
            ))}
          </div>
        </div>
        <Button
          disabled={!url.trim() || picked.length === 0 || create.isPending}
          onClick={() =>
            create.mutate({
              url: url.trim(),
              events: picked as Parameters<typeof create.mutate>[0]["events"]
            })
          }
        >
          {create.isPending ? "Adding..." : "Add webhook"}
        </Button>
      </div>

      {(list.data ?? []).length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {(list.data ?? []).map((w) => (
            <li key={w.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.url}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {w.events.map((ev) => (
                      <span key={ev} className={chipClass}>
                        {ev}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      w.active
                        ? "rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-600"
                        : "rounded-full bg-[var(--background)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                    }
                  >
                    {w.active ? "Active" : "Paused"}
                  </span>
                  <Button
                    variant="outline"
                    className="px-2 py-1 text-xs"
                    onClick={() => setShowDeliveries(showDeliveries === w.id ? null : w.id)}
                  >
                    Deliveries
                  </Button>
                  <Button
                    variant="outline"
                    className="px-2 py-1 text-xs"
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate({ id: w.id, active: !w.active })}
                  >
                    {w.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="danger"
                    className="px-2 py-1 text-xs"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm("Delete this webhook and its delivery history?")) {
                        remove.mutate({ id: w.id });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {showDeliveries === w.id ? (
                <div className="rounded-md bg-[var(--background)] p-2 text-xs">
                  {(deliveries.data ?? []).length === 0 ? (
                    <p className="text-[var(--muted)]">No deliveries yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(deliveries.data ?? []).map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{d.event}</span>
                          <span
                            className={
                              d.status === "delivered"
                                ? "text-green-600"
                                : d.status === "failed"
                                  ? "text-red-600"
                                  : "text-[var(--muted)]"
                            }
                          >
                            {d.status}
                          </span>
                          <span className="text-[var(--muted)]">
                            {d.attempts} attempt(s) · {new Date(d.createdAt).toLocaleString()}
                          </span>
                          {d.lastError ? <span className="text-red-600">{d.lastError}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">No webhooks yet.</p>
      )}
    </section>
  );
}
