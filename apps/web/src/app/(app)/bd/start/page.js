import { startCampaign } from "@/bd/actions";
import { loadAll } from "@/bd/lib/data";
import { Back } from "@/bd/components/ui";
import { ChannelPicker } from "@/bd/components/channel-picker";

export const dynamic = "force-dynamic";

export default async function Start({ searchParams }) {
  const sp = await searchParams;
  const { senders } = await loadAll();
  const active = senders.filter(
    (s) => String(s.active).toLowerCase() === "yes" && s.mailbox !== "asad"
  );
  const field = "input w-full";
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Back />
      <div>
        <h1 className="text-2xl font-semibold">Start a campaign</h1>
        <p className="text-sm text-mute">
          Paste a LinkedIn jobs search. The system collects the job ads, finds the decision makers,
          writes the emails and sends them from the mailbox you pick. Nothing is sent to staffing
          agencies or existing clients.
        </p>
      </div>
      {sp?.e === "1" && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-5 py-3 text-sm text-red-900">
          Check the form: campaign name, a linkedin.com/jobs link, a sender and a valid results
          email are all needed.
        </div>
      )}
      {sp?.e === "3" && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-5 py-3 text-sm text-red-900">
          The LinkedIn link has no location in it (the new LinkedIn search page leaves it out). Type
          the country or city in the Location box.
        </div>
      )}
      {sp?.e === "4" && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-5 py-3 text-sm text-red-900">
          A Farming campaign needs the signed contract (PDF or Word, up to 8 MB). Attach it and
          start again.
        </div>
      )}
      {sp?.e === "5" && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-5 py-3 text-sm text-red-900">
          The signed contract could not be stored. Try again; if it fails again, tell Asad.
        </div>
      )}
      {sp?.e === "2" && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-5 py-3 text-sm text-red-900">
          The system did not accept the start. Try again in a minute or tell Asad.
        </div>
      )}
      <form action={startCampaign} className="card space-y-4 px-5 py-5">
        <label className="block text-sm">
          <span className="font-medium">Campaign name</span>
          <input
            name="campaign"
            required
            maxLength={80}
            placeholder="Germany Engineering, Nov 2026"
            className={field + " mt-1"}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">LinkedIn jobs search link</span>
          <input
            name="url"
            required
            placeholder="https://www.linkedin.com/jobs/search/?keywords=Engineering%20Manager&location=United%20Kingdom"
            className={field + " mt-1"}
          />
          <span className="text-xs text-mute">
            Open LinkedIn Jobs, set your keywords, location and filters, then copy the address bar.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Location (country or city)</span>
          <input
            name="location"
            required
            maxLength={60}
            placeholder="Germany"
            className={field + " mt-1"}
          />
          <span className="mt-1 block text-xs text-mute">
            The country or city of the search. The new LinkedIn search page leaves it out of the
            link, so it is always asked here.
          </span>
        </label>
        <ChannelPicker field={field} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Send the emails as</span>
            <select name="sender" required className={field + " mt-1"} defaultValue="mo">
              {active.map((s) => (
                <option key={s.mailbox} value={s.mailbox}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Send the results to</span>
            <input
              name="email"
              type="email"
              required
              placeholder="you@emergetech.co.uk"
              className={field + " mt-1"}
            />
          </label>
        </div>
        <p className="text-xs text-mute">
          Every job ad of the search is scraped (up to 1,000). Companies with fewer than 10 staff,
          and staffing or recruiting firms, are left out.
        </p>
        <button className="btn-primary w-full">Start campaign</button>
        <p className="text-xs text-mute">
          Collecting takes 10 to 20 minutes, finding decision makers about 1 minute per company. The
          campaign appears on the Campaigns page right away and emails start on the next working day
          window (7:00 to 19:00 UK).
        </p>
      </form>
    </div>
  );
}
