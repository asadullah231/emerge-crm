"use client";

import { useEffect, useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { contactName } from "@/components/new-contact-modal";
import { INTERVIEW_TYPE_OPTIONS } from "@/lib/interviews";
import { trpc } from "@/lib/trpc/client";

const DURATIONS = [15, 30, 45, 60, 90, 120];

/** Default the picker to the next hour, formatted for datetime-local. */
function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleInterviewModal({
  open,
  onClose,
  applicationId,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  onDone?: () => void;
}) {
  const members = trpc.members.list.useQuery(undefined, { enabled: open });
  const contacts = trpc.contacts.list.useQuery(
    { page: 1, pageSize: 200, sortBy: "lastName", sortDir: "asc", deleted: false },
    { enabled: open }
  );

  const [type, setType] = useState("screen");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState<Set<string>>(new Set());
  const [clientContacts, setClientContacts] = useState<Set<string>>(new Set());

  const schedule = trpc.interviews.schedule.useMutation({
    onSuccess: () => {
      onDone?.();
      onClose();
    }
  });

  useEffect(() => {
    if (open) {
      setType("screen");
      setWhen(defaultWhen());
      setDuration(30);
      setLocation("");
      setMeetingLink("");
      setNotes("");
      setUsers(new Set());
      setClientContacts(new Set());
    }
  }, [open]);

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const submit = () => {
    if (!when) return;
    schedule.mutate({
      applicationId,
      type: type as (typeof INTERVIEW_TYPE_OPTIONS)[number]["value"],
      scheduledAt: new Date(when),
      durationMins: duration,
      location: location.trim() || null,
      meetingLink: meetingLink.trim() || null,
      notes: notes.trim() || null,
      interviewerUserIds: Array.from(users),
      contactIds: Array.from(clientContacts)
    });
  };

  return (
    <Modal title="Schedule interview" open={open} onClose={onClose}>
      <div className="space-y-4">
        <FormError message={schedule.error?.message} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="iv-type">Type</Label>
            <select
              id="iv-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {INTERVIEW_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="iv-duration">Duration</Label>
            <select
              id="iv-duration"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="iv-when">Date & time</Label>
          <Input
            id="iv-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="iv-location">Location</Label>
            <Input
              id="iv-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Office / phone"
            />
          </div>
          <div>
            <Label htmlFor="iv-link">Meeting link</Label>
            <Input
              id="iv-link"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="Meet / Teams / Zoom"
            />
          </div>
        </div>
        <div>
          <Label>Interviewers (internal)</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
            {(members.data ?? [])
              .filter((m) => !m.deactivatedAt)
              .map((m) => (
                <label
                  key={m.userId}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--background)]"
                >
                  <input
                    type="checkbox"
                    checked={users.has(m.userId)}
                    onChange={() => toggle(users, m.userId, setUsers)}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  {m.name}
                </label>
              ))}
          </div>
        </div>
        <div>
          <Label>Client contacts (external)</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
            {(contacts.data?.rows ?? []).length === 0 ? (
              <p className="px-2 py-1 text-xs text-[var(--muted)]">No contacts.</p>
            ) : (
              (contacts.data?.rows ?? []).map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--background)]"
                >
                  <input
                    type="checkbox"
                    checked={clientContacts.has(c.id)}
                    onChange={() => toggle(clientContacts, c.id, setClientContacts)}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{contactName(c)}</span>
                  {c.companyName ? (
                    <span className="shrink-0 text-xs text-[var(--muted)]">{c.companyName}</span>
                  ) : null}
                </label>
              ))
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="iv-notes">Notes</Label>
          <textarea
            id="iv-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={schedule.isPending || !when}>
            {schedule.isPending ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
