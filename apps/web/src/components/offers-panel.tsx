"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { Button } from "@/components/form";
import {
  OFFER_MEDIUM_OPTIONS,
  OFFER_STATUS_LABEL,
  OFFER_STATUS_STYLE,
  expiryCountdown,
  formatMoney
} from "@/lib/offers";
import { trpc } from "@/lib/trpc/client";

function OfferStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        OFFER_STATUS_STYLE[status] ?? "bg-zinc-500/10"
      )}
    >
      {OFFER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)]";

function GenerateOfferForm({
  applicationId,
  onDone
}: {
  applicationId: string;
  onDone: () => void;
}) {
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [startDate, setStartDate] = useState("");
  const [medium, setMedium] = useState("link");
  const [note, setNote] = useState("");
  const create = trpc.offers.create.useMutation({ onSuccess: onDone });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-[var(--muted)]">
          Salary
          <input
            type="number"
            min={0}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="45000"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Medium
          <select value={medium} onChange={(e) => setMedium(e.target.value)} className={inputClass}>
            {OFFER_MEDIUM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Offer note (optional)"
        className={inputClass}
      />
      {create.error ? <p className="text-xs text-red-600">{create.error.message}</p> : null}
      <div className="flex gap-2">
        <Button
          className="px-3 py-1.5"
          disabled={create.isPending}
          onClick={() =>
            create.mutate({
              applicationId,
              medium: medium as (typeof OFFER_MEDIUM_OPTIONS)[number]["value"],
              salaryAmount: salary ? parseInt(salary, 10) : null,
              currency: currency.trim() || null,
              startDate: startDate || null,
              note: note.trim() || null
            })
          }
        >
          {create.isPending ? "Saving..." : "Save draft offer"}
        </Button>
      </div>
    </div>
  );
}

function RecordPlacementForm({
  applicationId,
  offerId,
  defaultCurrency,
  onDone
}: {
  applicationId: string;
  offerId: string;
  defaultCurrency: string | null;
  onDone: () => void;
}) {
  const [fee, setFee] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency ?? "GBP");
  const [startDate, setStartDate] = useState("");
  const [note, setNote] = useState("");
  const create = trpc.placements.create.useMutation({ onSuccess: onDone });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-green-500/40 bg-green-500/5 p-3">
      <p className="text-xs font-medium text-green-700">Record placement (marks the hire)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs text-[var(--muted)]">
          Fee
          <input
            type="number"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="8500"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Placement note (optional)"
        className={inputClass}
      />
      {create.error ? <p className="text-xs text-red-600">{create.error.message}</p> : null}
      <Button
        className="px-3 py-1.5"
        disabled={create.isPending}
        onClick={() =>
          create.mutate({
            applicationId,
            offerId,
            feeAmount: fee ? parseInt(fee, 10) : null,
            currency: currency.trim() || null,
            startDate: startDate || null,
            note: note.trim() || null
          })
        }
      >
        {create.isPending ? "Saving..." : "Confirm placement"}
      </Button>
    </div>
  );
}

export function OffersPanel({
  applicationId,
  canWrite
}: {
  applicationId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const [generating, setGenerating] = useState(false);
  const [placingFor, setPlacingFor] = useState<string | null>(null);
  const offers = trpc.offers.byApplication.useQuery({ applicationId });
  const placement = trpc.placements.forApplication.useQuery({ applicationId });

  const refresh = () => {
    utils.offers.byApplication.invalidate({ applicationId });
    utils.placements.forApplication.invalidate({ applicationId });
    utils.applications.get.invalidate({ id: applicationId });
  };
  const send = trpc.offers.send.useMutation({ onSuccess: refresh });
  const accept = trpc.offers.accept.useMutation({ onSuccess: refresh });
  const decline = trpc.offers.decline.useMutation({ onSuccess: refresh });
  const withdraw = trpc.offers.withdraw.useMutation({ onSuccess: refresh });
  const busy = send.isPending || accept.isPending || decline.isPending || withdraw.isPending;

  const rows = offers.data ?? [];
  const placed = placement.data;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {rows.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">No offers yet.</span>
        ) : (
          <span className="text-sm text-[var(--muted)]">
            {rows.length} offer{rows.length === 1 ? "" : "s"}
          </span>
        )}
        {canWrite && !placed ? (
          <Button className="px-3 py-1.5" onClick={() => setGenerating((v) => !v)}>
            {generating ? "Close" : "Generate offer"}
          </Button>
        ) : null}
      </div>

      {generating ? (
        <GenerateOfferForm
          applicationId={applicationId}
          onDone={() => {
            setGenerating(false);
            refresh();
          }}
        />
      ) : null}

      {placed ? (
        <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm">
          <span className="font-medium text-green-700">Placed</span> · {placed.humanId} ·{" "}
          {formatMoney(placed.feeAmount, placed.currency)} fee
          {placed.startDate ? ` · starts ${placed.startDate}` : ""}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((offer) => {
            const countdown = offer.status === "sent" ? expiryCountdown(offer.expiresAt) : null;
            return (
              <li key={offer.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {formatMoney(offer.salaryAmount, offer.currency)}
                      </span>
                      <OfferStatusBadge status={offer.status} />
                      <span className="text-xs text-[var(--muted)]">{offer.humanId}</span>
                      {countdown ? (
                        <span
                          className={cn(
                            "text-xs",
                            offer.overdue ? "text-amber-600" : "text-[var(--muted)]"
                          )}
                        >
                          {countdown}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {offer.startDate ? `Start ${offer.startDate}` : "No start date"}
                      {offer.sentByName ? ` · sent by ${offer.sentByName}` : ""}
                    </p>
                    {offer.declineReason ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        Reason: {offer.declineReason}
                      </p>
                    ) : null}
                  </div>
                </div>

                {canWrite ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {offer.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const days = window.prompt("Expiry in days (blank = no expiry):", "7");
                          if (days === null) return;
                          const n = days.trim() ? parseInt(days, 10) : null;
                          send.mutate({
                            id: offer.id,
                            expiresInDays: n && n > 0 ? n : null
                          });
                        }}
                        className="text-xs text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                      >
                        Send offer
                      </button>
                    ) : null}
                    {offer.status === "sent" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => accept.mutate({ id: offer.id })}
                          className="text-xs text-green-600 hover:underline disabled:opacity-50"
                        >
                          Mark accepted
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Decline reason (optional):") ?? "";
                            decline.mutate({ id: offer.id, reason: reason || null });
                          }}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Declined
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Withdrawal reason (optional):") ?? "";
                            withdraw.mutate({ id: offer.id, reason: reason || null });
                          }}
                          className="text-xs text-[var(--muted)] hover:underline disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      </>
                    ) : null}
                    {offer.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt("Withdrawal reason (optional):") ?? "";
                          withdraw.mutate({ id: offer.id, reason: reason || null });
                        }}
                        className="text-xs text-[var(--muted)] hover:underline disabled:opacity-50"
                      >
                        Discard
                      </button>
                    ) : null}
                    {offer.status === "accepted" && !placed ? (
                      <button
                        type="button"
                        onClick={() => setPlacingFor(placingFor === offer.id ? null : offer.id)}
                        className="text-xs text-green-700 hover:underline"
                      >
                        {placingFor === offer.id ? "Close" : "Record placement"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {placingFor === offer.id && !placed ? (
                  <RecordPlacementForm
                    applicationId={applicationId}
                    offerId={offer.id}
                    defaultCurrency={offer.currency}
                    onDone={() => {
                      setPlacingFor(null);
                      refresh();
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
