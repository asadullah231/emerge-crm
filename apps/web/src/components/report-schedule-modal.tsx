"use client";

import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import type { ReportFilters } from "@/lib/reports";
import { trpc } from "@/lib/trpc/client";

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Create a scheduled email delivery for the report the user is currently
 * viewing. The report key + filters are captured from the Reports page.
 */
export function ReportScheduleModal({
  open,
  onClose,
  reportKey,
  reportLabel,
  filters,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  reportKey: string;
  reportLabel: string;
  filters: ReportFilters;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [hourUtc, setHourUtc] = useState("7");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [recipients, setRecipients] = useState("");

  const create = trpc.reportSchedules.create.useMutation({
    onSuccess: () => {
      onSaved();
      reset();
      onClose();
    }
  });

  const reset = () => {
    setName("");
    setCadence("weekly");
    setHourUtc("7");
    setRecipients("");
  };

  const submit = () => {
    const emails = recipients
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    create.mutate({
      name: name.trim() || reportLabel,
      reportKey: reportKey as Parameters<typeof create.mutate>[0]["reportKey"],
      filters,
      cadence,
      recipients: emails,
      hourUtc: parseInt(hourUtc, 10),
      dayOfWeek: cadence === "weekly" ? parseInt(dayOfWeek, 10) : null,
      dayOfMonth: cadence === "monthly" ? parseInt(dayOfMonth, 10) : null,
      active: true
    });
  };

  return (
    <Modal title={`Schedule "${reportLabel}"`} open={open} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-[var(--muted)]">
          Emails this report as a CSV on your chosen cadence, using the filters you have set.
        </p>
        <div>
          <Label htmlFor="sch-name">Name</Label>
          <Input
            id="sch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={reportLabel}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sch-cadence">Cadence</Label>
            <select
              id="sch-cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as typeof cadence)}
              className={inputClass}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sch-hour">Hour (UTC)</Label>
            <select
              id="sch-hour"
              value={hourUtc}
              onChange={(e) => setHourUtc(e.target.value)}
              className={inputClass}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
        </div>
        {cadence === "weekly" ? (
          <div>
            <Label htmlFor="sch-dow">Day of week</Label>
            <select
              id="sch-dow"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className={inputClass}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {cadence === "monthly" ? (
          <div>
            <Label htmlFor="sch-dom">Day of month (1-28)</Label>
            <select
              id="sch-dom"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className={inputClass}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="sch-recipients">Recipients (comma-separated emails)</Label>
          <textarea
            id="sch-recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            rows={2}
            placeholder="jane@agency.com, sam@agency.com"
            className={inputClass}
          />
        </div>
        <FormError message={create.error?.message} />
        <div className="flex gap-2">
          <Button disabled={create.isPending || !recipients.trim()} onClick={submit}>
            {create.isPending ? "Saving..." : "Create schedule"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
