"use client";

import { useEffect, useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

export default function AiSettingsPage() {
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";
  const providers = trpc.ai.providers.useQuery();
  const current = trpc.ai.get.useQuery();
  const utils = trpc.useUtils();

  const [provider, setProvider] = useState<string>("anthropic");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [initialised, setInitialised] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Seed the form once from the saved settings (or provider defaults).
  useEffect(() => {
    if (initialised || current.isLoading || providers.isLoading) return;
    if (current.data) {
      setProvider(current.data.provider);
      setModel(current.data.model);
      setBaseUrl(current.data.baseUrl ?? "");
    }
    setInitialised(true);
  }, [initialised, current.isLoading, current.data, providers.isLoading]);

  const preset = providers.data?.find((p) => p.key === provider);
  const save = trpc.ai.save.useMutation({
    onSuccess: async () => {
      setApiKey("");
      await Promise.all([utils.ai.get.invalidate(), utils.auth.me.invalidate()]);
    }
  });
  const test = trpc.ai.test.useMutation({ onSuccess: (r) => setTestResult(r) });

  const onProvider = (key: string) => {
    setProvider(key);
    const p = providers.data?.find((x) => x.key === key);
    if (p) {
      setModel(p.defaultModel);
      setBaseUrl(p.defaultBaseUrl ?? "");
    }
    setTestResult(null);
  };

  const payload = () => ({
    provider: provider as "anthropic",
    model: model.trim(),
    baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
    apiKey: apiKey.trim() ? apiKey.trim() : undefined
  });

  const hasKey = current.data?.hasKey ?? false;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">AI provider</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose the LLM used for resume parsing and other AI features. Your API key is encrypted
          and never shared. Bring your own key from any supported provider.
        </p>
      </div>

      {!isAdmin ? (
        <div className="rounded-md bg-[var(--card)] border border-[var(--border)] p-3 text-sm text-[var(--muted)]">
          {current.data
            ? `Configured: ${current.data.provider} · ${current.data.model}${current.data.keyLast4 ? ` · key ••••${current.data.keyLast4}` : ""}`
            : "No AI provider configured yet."}
          <br />
          Only workspace admins can change AI settings.
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => onProvider(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            >
              {providers.data?.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="model">Model</Label>
            <input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={preset?.defaultModel}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </div>

          {preset && (preset.baseUrlRequired || preset.defaultBaseUrl) ? (
            <div>
              <Label htmlFor="baseUrl">
                Base URL {preset.baseUrlRequired ? "" : "(override, optional)"}
              </Label>
              <input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={preset.defaultBaseUrl ?? "https://your-endpoint/v1"}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </div>
          ) : null}

          <div>
            <Label htmlFor="apiKey">API key</Label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? `•••• ${current.data?.keyLast4} (leave blank to keep)` : "Paste your API key"}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
            {preset?.consoleUrl ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Get a key from{" "}
                <a href={preset.consoleUrl} target="_blank" rel="noreferrer" className="underline">
                  {preset.label}
                </a>
                .
              </p>
            ) : null}
          </div>

          {testResult ? (
            <p
              className={
                "text-sm " + (testResult.ok ? "text-green-600" : "text-red-600")
              }
            >
              {testResult.ok ? "Connection OK." : `Test failed: ${testResult.error}`}
            </p>
          ) : null}
          <FormError message={save.error?.message} />

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={test.isPending || !model}
              onClick={() => {
                setTestResult(null);
                test.mutate(payload());
              }}
            >
              {test.isPending ? "Testing..." : "Test connection"}
            </Button>
            <Button disabled={save.isPending || !model} onClick={() => save.mutate(payload())}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
            {save.isSuccess ? <span className="self-center text-sm text-green-600">Saved</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
