import { loadAll, buildCampaigns, withBodies } from "@/bd/lib/data";
import {
  friendlyReason,
  skipBucket,
  skipWhy,
  companySkipReason,
  fmtDate,
  fmtDateTime,
  plural
} from "@/bd/lib/text";
import { StagePill, Progress, Stat, Back } from "@/bd/components/ui";
import {
  RenameForm,
  ArchiveButton,
  CancelButton,
  RelationshipButtons,
  ContractUpload
} from "@/bd/components/controls";
import { EmailRow } from "@/bd/components/email-row";
import { keyOf } from "@/bd/lib/campaigns";

export const dynamic = "force-dynamic";

export default async function Campaign({ params, searchParams }) {
  const sp = await searchParams;
  const { batch: raw } = await params;
  let batch = raw;
  try {
    batch = decodeURIComponent(raw);
  } catch {
    /* already plain */
  } // the segment sometimes arrives still encoded (c%3AName)
  const all = await loadAll();
  const c = buildCampaigns(all).find((x) => x.key === batch);
  if (!c)
    return (
      <div className="space-y-3">
        <Back />
        <div className="card px-5 py-6">This campaign does not exist.</div>
      </div>
    );
  const rows = all.outbox.filter((r) => keyOf(r) === batch);
  const sent = await withBodies(
    rows
      .filter((r) => ["sent", "replied", "bounced", "auto_reply"].includes(r.status))
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
  );
  const waiting = rows
    .filter((r) => ["queued", "sending"].includes(r.status))
    .sort((a, b) => String(a.not_before).localeCompare(String(b.not_before)));
  const skipped = rows.filter((r) => r.status === "blocked");
  // 'known contact of paula, last email ...' -> the account manager's display name for the Hand-to button
  const senderNames = Object.fromEntries(
    (all.senders || []).map((s) => [s.mailbox, s.name || s.mailbox])
  );
  const ownerNameOf = (reason) => {
    const mm = /^known contact of (\S+)/.exec(String(reason || ""));
    return mm ? senderNames[mm[1].replace(/,$/, "")] || mm[1].replace(/,$/, "") : "";
  };
  const reasons = Object.entries(
    skipped.reduce((a, r) => {
      const k = skipBucket(r.block_reason);
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const skippedBy = reasons.map(([k]) => [
    k,
    skipped.filter((r) => skipBucket(r.block_reason) === k)
  ]);
  // 4 Nov 2026: Farming (existing account) campaigns carry the signed contract; it lives on the bd_campaigns row of the batch
  const metaRows = (all.meta || []).filter((mr) => c.batches.includes(mr.batch_id));
  const channel = metaRows.some((mr) => String(mr.bd_channel).toLowerCase() === "farming")
    ? "farming"
    : "hunting";
  const contractRow = metaRows.find((mr) => mr.contract_name);
  const contractWaiting = skipped.filter((r) =>
    /^signed contract not attached/i.test(r.block_reason || "")
  ).length;
  const companiesSkipped = all.companies.filter(
    (co) => keyOf(co) === batch && (co.status === "skip" || co.status === "low")
  );

  return (
    <div className="space-y-6">
      <Back />
      {channel === "farming" && (
        <div className="card px-6 py-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-mute">
              Farming
            </span>
            <span className="text-sm font-medium">Existing account campaign</span>
          </div>
          <p className="text-sm text-mute">
            Emails use the approved-supplier text, sign as Business Relationship Manager and carry
            the signed contract. The company is not blocked as an existing client.
          </p>
          <p className="text-sm">
            {contractRow ? (
              <>
                Signed contract: <span className="font-medium">{contractRow.contract_name}</span>
                {contractRow.contract_size ? (
                  <span className="text-mute">
                    {" "}
                    ({Math.round(contractRow.contract_size / 1024)} KB)
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-warn">
                No signed contract yet.{" "}
                {contractWaiting
                  ? `${contractWaiting} emails are waiting for it.`
                  : "Emails will wait for it."}
              </span>
            )}
          </p>
          {sp?.contract === "1" ? (
            <p className="text-sm text-ok">
              Contract saved
              {Number(sp?.requeued) ? `, ${sp.requeued} waiting emails are back in the queue` : ""}.
            </p>
          ) : null}
          {sp?.e === "contract" ? (
            <p className="text-sm text-bad">Choose a PDF or Word file up to 8 MB.</p>
          ) : null}
          <ContractUpload batch={batch} batches={c.batches} contract={contractRow} />
        </div>
      )}
      <div className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{c.name}</h1>
            <div className="text-sm text-mute">
              Started {fmtDate(c.started)} · requested by {c.requester || "unknown"} · emails sent
              as {c.senderLabel}
            </div>
          </div>
          <StagePill stage={c.stage} />
        </div>
        <div className="mt-4">
          <Progress value={c.progress} />
        </div>
        <div className="mt-1 text-xs text-mute">
          {c.toSend > 0
            ? `${c.sent} of ${c.toSend} emails sent${c.progress === 100 ? ". All done." : ""}`
            : "No emails to send yet"}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-7">
          <Stat label="Job ads" value={c.jobs} />
          <Stat label="Companies" value={c.researched} />
          <Stat label="People found" value={c.contacts} />
          <Stat label="Sent" value={c.sent} />
          <Stat label="Replies" value={c.replied} tone={c.replied ? "text-ok" : ""} />
          <Stat label="Waiting" value={c.queued} />
          <Stat label="Skipped" value={c.blocked} tone="text-mute" />
        </div>
        <p className="mt-3 text-xs text-mute">
          {plural(c.jobs, "job ad")} from LinkedIn came from{" "}
          {plural(c.jobCompanies || c.researched, "company", "companies")}. {c.researched} were
          researched and {c.contacts} decision makers with a work email were found. {c.sent} emailed
          so far, {c.queued} waiting, {c.blocked} skipped on purpose (reasons below).
          {c.followups > 0
            ? ` ${c.followups} follow-ups have gone out as replies in the same email threads (up to 5 per person, over about a month, stopping as soon as someone answers).`
            : ""}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-5">
          <RenameForm batch={c.batch} name={c.campaign || c.name} />
          <ArchiveButton batch={c.batch} archived={c.archived} />
          <CancelButton batch={c.batch} queued={c.queued} />
        </div>
        {c.failed > 0 && (
          <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3 text-sm text-red-900">
            {c.failed} emails could not be sent: Gmail refused the sender mailbox. They are kept and
            go out automatically once the mailbox is reconnected in n8n. See the Team page.
          </div>
        )}
        {c.queued > 0 && (
          <div className="mt-3 text-sm text-mute">
            {c.queued} emails still to go, about {plural(c.daysLeft, "working day")} at {c.dailyCap}{" "}
            a day. Emails go out Monday to Friday, 7:00 to 19:00 UK.
          </div>
        )}
      </div>

      <Table
        title={`Replies (${sent.filter((r) => r.status === "replied").length})`}
        rows={sent.filter((r) => r.status === "replied")}
        empty="No replies yet."
        cols={["When", "Company", "Person", "Email"]}
        render={(r) => [
          fmtDateTime(r.UpdatedAt || r.sent_at),
          r.company,
          `${r.contact_name || ""} ${r.contact_title ? "· " + r.contact_title : ""}`,
          r.to_email
        ]}
      />

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-2 font-semibold tracking-tight">
          Emails sent ({sent.length})
        </div>
        {c.autoReplies > 0 && (
          <p className="px-5 pb-1 text-xs text-mute">
            {c.autoReplies} came back as out-of-office or automatic replies. They are marked below
            and not counted as replies.
          </p>
        )}
        <p className="px-5 pb-3 text-xs text-mute">
          Click a line to read the exact email that went out.
        </p>
        {!sent.length ? (
          <div className="px-5 pb-4 text-sm text-mute">Nothing sent yet.</div>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {sent.map((r) => (
              <EmailRow key={r.Id} r={r} />
            ))}
          </div>
        )}
      </section>

      <Table
        title={`Waiting to send (${waiting.length})`}
        rows={waiting.slice(0, 200)}
        empty="Nothing waiting."
        cols={["Company", "Person", "Email", "Sent as"]}
        render={(r) => [
          r.company,
          `${r.contact_name || ""} ${r.contact_title ? "· " + r.contact_title : ""}`,
          r.to_email,
          r.sender_name || r.sender
        ]}
      />

      <section className="card px-6 py-5">
        <h2 className="font-semibold tracking-tight">Skipped on purpose ({skipped.length})</h2>
        <p className="mt-1 text-sm text-mute">
          Skipped means the person was found but the system decided not to email them. Every skip
          has a reason, listed here with why it exists. This protects the sender's mailbox and the
          client list. It is not an error.
        </p>
        <div className="mt-3 divide-y divide-line border-t border-line">
          {skippedBy.map(([k, list]) => (
            <details key={k} className="group">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-2.5 text-sm hover:bg-paper">
                <span>
                  <span className="font-medium capitalize">{k}</span>
                  <span className="block text-xs text-mute">{skipWhy[k] || skipWhy.other}</span>
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="num text-mute">{list.length}</span>
                  <span className="text-mute transition group-open:rotate-90">&rsaquo;</span>
                </span>
              </summary>
              <ul className="bg-paper px-3 pb-3 text-xs text-mute">
                {list.slice(0, 150).map((r) => (
                  <li key={r.Id} className="py-1">
                    <span className="text-ink">{r.company}</span> ·{" "}
                    {r.contact_name || r.to_email || "unknown"}
                    {r.contact_title ? ` · ${r.contact_title}` : ""}
                    {k === "known relationship" && (
                      <RelationshipButtons
                        row={r}
                        batch={batch}
                        ownerName={ownerNameOf(r.block_reason)}
                      />
                    )}
                    <span className="block">{friendlyReason(r.block_reason)}</span>
                  </li>
                ))}
                {list.length > 150 && (
                  <li className="py-1">
                    and {list.length - 150} more, all in the campaign Excel file
                  </li>
                )}
              </ul>
            </details>
          ))}
          {!reasons.length && <div className="py-2 text-sm text-mute">Nothing skipped.</div>}
        </div>
      </section>

      {companiesSkipped.length > 0 && (
        <section className="card px-5 py-4">
          <h2 className="font-semibold">
            Companies with nobody to email ({companiesSkipped.length})
          </h2>
          <p className="mt-1 text-sm text-mute">
            These companies were researched but gave no decision maker worth emailing. They count in
            Companies above, not in People found.
          </p>
          <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
            {companiesSkipped.map((co) => (
              <li key={co.Id} className="flex justify-between gap-4 py-1.5">
                <span>{co.company}</span>
                <span className="text-right text-xs text-mute">
                  {companySkipReason(co.skip_reason)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Table({ title, rows, cols, render, empty }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3 font-semibold tracking-tight">{title}</div>
      {!rows.length ? (
        <div className="px-5 pb-4 text-sm text-mute">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-mute">
              <tr>
                {cols.map((h) => (
                  <th key={h} className="px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Id} className="border-t border-line">
                  {render(r).map((v, i) => (
                    <td key={i} className="px-5 py-2 align-top">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
