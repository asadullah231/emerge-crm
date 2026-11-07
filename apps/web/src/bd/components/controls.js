import {
  renameCampaign,
  archiveCampaign,
  cancelRemaining,
  setPaused,
  sendAnyway,
  handToOwner,
  uploadContract
} from "@/bd/actions";

const btn = "btn";
const danger = "btn-danger";

export function PauseResume({ paused }) {
  return (
    <form action={setPaused}>
      <input type="hidden" name="action" value={paused ? "resume" : "pause"} />
      <button className={paused ? "btn-ok" : btn}>
        {paused ? "Resume sending" : "Pause all sending"}
      </button>
    </form>
  );
}

export function RenameForm({ batch, name }) {
  return (
    <form action={renameCampaign} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="batch" value={batch} />
      <input
        name="name"
        defaultValue={name}
        maxLength={80}
        placeholder="Campaign name"
        className="input w-64"
      />
      <button className={btn}>Save name</button>
    </form>
  );
}

export function ArchiveButton({ batch, archived }) {
  return (
    <form action={archiveCampaign}>
      <input type="hidden" name="batch" value={batch} />
      <input type="hidden" name="archived" value={archived ? "no" : "yes"} />
      <button
        className={btn}
        title={
          archived
            ? "Show it on the Campaigns page again"
            : "Hide it from the Campaigns page. Nothing is deleted."
        }
      >
        {archived ? "Unarchive" : "Archive"}
      </button>
    </form>
  );
}

export function CancelButton({ batch, queued }) {
  if (!queued) return null;
  return (
    <form action={cancelRemaining}>
      <input type="hidden" name="batch" value={batch} />
      <button
        className={danger}
        title="The emails still waiting in this campaign will not be sent. Already sent ones are not affected."
      >
        Cancel remaining {queued}
      </button>
    </form>
  );
}

/** Two small buttons on a 'known relationship' skip: send it after all, or hand the company to the account manager who knows it. */
export function RelationshipButtons({ row, batch, ownerName }) {
  const small = "rounded border border-line bg-white px-2 py-0.5 text-xs text-ink hover:bg-paper";
  return (
    <span className="ml-2 inline-flex gap-1.5 align-middle">
      <form action={sendAnyway} className="inline">
        <input type="hidden" name="id" value={row.Id} />
        <input type="hidden" name="batch" value={batch} />
        <button
          className={small}
          title="Put this email back in the queue. It goes out in the normal window."
        >
          Send anyway
        </button>
      </form>
      <form action={handToOwner} className="inline">
        <input type="hidden" name="id" value={row.Id} />
        <input type="hidden" name="batch" value={batch} />
        <input type="hidden" name="owner" value={ownerName || ""} />
        <button
          className={small}
          title="Mark it as taken over by the account manager who knows this company. A note goes to #bd-outreach."
        >
          Hand to {ownerName || "the account manager"}
        </button>
      </form>
    </span>
  );
}

/** Farming campaign: the signed contract that goes out with every email. Upload once; replacing it is fine. */
export function ContractUpload({ batch, batches, contract }) {
  return (
    <form action={uploadContract} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="batch" value={batch} />
      <input type="hidden" name="batches" value={batches.join(",")} />
      <input
        name="contract"
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required
        className="input max-w-xs"
      />
      <button className={btn}>{contract ? "Replace contract" : "Upload signed contract"}</button>
    </form>
  );
}
