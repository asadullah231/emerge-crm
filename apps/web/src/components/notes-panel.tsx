"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/form";
import { MentionTextarea, type MentionMember } from "@/components/mention-textarea";
import { mentionIdsInBody, type NotableEntityType } from "@/lib/notes";
import { relativeTime } from "@/lib/time";
import { trpc } from "@/lib/trpc/client";

/** Highlight "@Name" spans for known mentioned names inside a note body. */
function renderBody(body: string, mentionNames: string[]) {
  if (mentionNames.length === 0) return body;
  const escaped = mentionNames
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts = body.split(re);
  return parts.map((part, i) =>
    mentionNames.includes(part) ? (
      <span key={i} className="font-medium text-[var(--brand-secondary)]">
        @{part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/** Reusable Notes tab for any record (candidate, job, company, contact, application). */
export function NotesPanel({
  entityType,
  entityId,
  canWrite
}: {
  entityType: NotableEntityType;
  entityId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const [order, setOrder] = useState<"recent" | "oldest">("recent");
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionMember[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editMentions, setEditMentions] = useState<MentionMember[]>([]);

  const notes = trpc.notes.list.useQuery({ entityType, entityId, order });
  const membersQ = trpc.members.list.useQuery();
  const templates = trpc.notes.templates.useQuery(undefined, { enabled: canWrite });

  const members: MentionMember[] = (membersQ.data ?? [])
    .filter((m) => !m.deactivatedAt)
    .map((m) => ({ userId: m.userId, name: m.name }));

  const refresh = () =>
    Promise.all([
      utils.notes.list.invalidate({ entityType, entityId }),
      utils.timeline.forRecord.invalidate({ entityType, entityId }),
      utils.notifications.unreadCount.invalidate(),
      utils.notifications.list.invalidate()
    ]);

  const create = trpc.notes.create.useMutation({
    onSuccess: async () => {
      setBody("");
      setMentions([]);
      await refresh();
    }
  });
  const update = trpc.notes.update.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await refresh();
    }
  });
  const remove = trpc.notes.remove.useMutation({ onSuccess: refresh });

  // Only mentions whose "@Name" survives in the final body are notified.
  const presentMentionIds = mentionIdsInBody;

  const submit = () => {
    if (!body.trim()) return;
    create.mutate({
      entityType,
      entityId,
      body: body.trim(),
      mentionUserIds: presentMentionIds(body, mentions)
    });
  };

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="space-y-2">
          <MentionTextarea
            value={body}
            onChange={setBody}
            members={members}
            onMentionsChange={setMentions}
          />
          <div className="flex items-center justify-between gap-2">
            {templates.data && templates.data.length > 0 ? (
              <select
                aria-label="Insert template"
                value=""
                onChange={(e) => {
                  const t = templates.data?.find((x) => x.id === e.target.value);
                  if (t) setBody((b) => (b ? `${b}\n\n${t.body}` : t.body));
                }}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--muted)]"
              >
                <option value="">Insert template...</option>
                {templates.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <Button
              className="px-3 py-1.5"
              onClick={submit}
              disabled={create.isPending || !body.trim()}
            >
              {create.isPending ? "Adding..." : "Add note"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted)]">
          {notes.data?.length ?? 0} {notes.data?.length === 1 ? "note" : "notes"}
        </span>
        <button
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={() => setOrder((o) => (o === "recent" ? "oldest" : "recent"))}
        >
          {order === "recent" ? "Recent first" : "Oldest first"}
        </button>
      </div>

      {notes.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading notes...</p>
      ) : notes.data && notes.data.length > 0 ? (
        <ul className="space-y-3">
          {notes.data.map((n) => {
            const mine = me.data?.user.id === n.authorId;
            const canEdit = canWrite && (mine || me.data?.role === "admin");
            const mentionNames = n.mentions.map((m) => m.name).filter(Boolean) as string[];
            return (
              <li
                key={n.id}
                className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{n.authorName ?? "Unknown"}</span>
                  <span className="text-xs text-[var(--muted)]">{relativeTime(n.createdAt)}</span>
                </div>
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <MentionTextarea
                      value={editBody}
                      onChange={setEditBody}
                      members={members}
                      onMentionsChange={setEditMentions}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="px-3 py-1"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="px-3 py-1"
                        disabled={update.isPending || !editBody.trim()}
                        onClick={() =>
                          update.mutate({
                            id: n.id,
                            body: editBody.trim(),
                            mentionUserIds: presentMentionIds(editBody, editMentions)
                          })
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm">
                      {renderBody(n.body, mentionNames)}
                    </p>
                    {canEdit ? (
                      <div className="mt-1.5 flex gap-3">
                        <button
                          className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditBody(n.body);
                            setEditMentions(
                              n.mentions
                                .filter((m) => m.userId && m.name)
                                .map((m) => ({ userId: m.userId!, name: m.name! }))
                            );
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs text-[var(--muted)] hover:text-red-600"
                          onClick={() => {
                            if (window.confirm("Delete this note?")) remove.mutate({ id: n.id });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">No notes yet.</p>
      )}
    </div>
  );
}
