"use server";
// Team actions. Each one writes to NocoDB or calls an n8n webhook, then refreshes the pages. No n8n or NocoDB knowledge needed on the team side.
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { fetchAll, writeRows, T } from "@/bd/lib/noco";
import { whereForKey } from "@/bd/lib/campaigns";
import { assertBdWrite } from "@/bd/access"; // CRM login + workspace flag + not a read-only member

const N8N = (process.env.N8N_BASE_URL || "").replace(/\/$/, "");
const clean = (s) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ");

async function upsertMeta(batch, patch) {
  const rows = await fetchAll(T.campaigns, { where: `(batch_id,eq,${batch})` });
  if (rows.length) await writeRows(T.campaigns, "PATCH", [{ Id: rows[0].Id, ...patch }]);
  else await writeRows(T.campaigns, "POST", [{ batch_id: batch, ...patch }]);
}

export async function renameCampaign(formData) {
  await assertBdWrite();
  const batch = clean(formData.get("batch")),
    name = clean(formData.get("name")).slice(0, 80);
  if (!batch || !name) return;
  await upsertMeta(batch, { name, updated_by: "dashboard" });
  // the name also goes onto the rows, so Excel files, subjects and Slack messages use it from now on (and the campaign keeps one key)
  for (const t of [T.jobs, T.companies, T.outbox]) {
    const rows = await fetchAll(t, { fields: "Id", where: whereForKey(batch) });
    if (rows.length)
      await writeRows(
        t,
        "PATCH",
        rows.map((r) => ({ Id: r.Id, campaign: name }))
      );
  }
  revalidateTag("noco");
  revalidatePath("/bd");
  redirect(`/bd/campaign/${encodeURIComponent("c:" + name)}`);
}

export async function archiveCampaign(formData) {
  await assertBdWrite();
  const batch = clean(formData.get("batch")),
    on = formData.get("archived") === "yes";
  if (!batch) return;
  await upsertMeta(batch, { archived: on ? "yes" : "no", updated_by: "dashboard" });
  revalidateTag("noco");
  revalidatePath("/bd");
  revalidatePath("/bd/archived");
  revalidatePath(`/bd/campaign/${batch}`);
  if (on) redirect("/bd");
}

export async function cancelRemaining(formData) {
  await assertBdWrite();
  const batch = clean(formData.get("batch"));
  if (!batch) return;
  const rows = await fetchAll(T.outbox, {
    fields: "Id,status",
    where: `${whereForKey(batch)}~and(status,eq,queued)`
  });
  if (rows.length)
    await writeRows(
      T.outbox,
      "PATCH",
      rows.map((r) => ({
        Id: r.Id,
        status: "blocked",
        block_reason: "cancelled from the dashboard"
      }))
    );
  revalidateTag("noco");
  revalidatePath("/bd");
  revalidatePath(`/bd/campaign/${batch}`);
}

/** A 'known relationship' skip the team wants to send after all: back into the queue. */
export async function sendAnyway(formData) {
  await assertBdWrite();
  const id = Number(formData.get("id")),
    batch = clean(formData.get("batch"));
  if (!id) return;
  await writeRows(T.outbox, "PATCH", [
    { Id: id, status: "queued", block_reason: "", not_before: new Date().toISOString(), error: "" }
  ]);
  revalidateTag("noco");
  revalidatePath("/bd");
  if (batch) revalidatePath(`/bd/campaign/${batch}`);
}

/** A 'known relationship' skip goes to the account manager who knows the company: row marked, note posted in #bd-outreach. */
export async function handToOwner(formData) {
  await assertBdWrite();
  const id = Number(formData.get("id")),
    batch = clean(formData.get("batch")),
    owner = clean(formData.get("owner"));
  if (!id) return;
  await writeRows(T.outbox, "PATCH", [
    {
      Id: id,
      block_reason: `handed to ${owner || "the account manager"} on ${new Date().toISOString().slice(0, 10)}`
    }
  ]);
  try {
    await fetch(`${N8N}/webhook/bd-outreach-relcheck`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "handoff", outbox_id: id, owner, batch_id: batch })
    });
  } catch {
    /* the Slack note is best effort */
  }
  revalidateTag("noco");
  revalidatePath("/bd");
  if (batch) revalidatePath(`/bd/campaign/${batch}`);
}

export async function setPaused(formData) {
  await assertBdWrite();
  const action = formData.get("action") === "pause" ? "pause" : "resume";
  const res = await fetch(`${N8N}/webhook/bd-outreach-send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, by: "dashboard" })
  });
  if (!res.ok) throw new Error("n8n " + res.status);
  // the webhook answers before the state row is written; give it a moment so the page shows the new state
  await new Promise((r) => setTimeout(r, 2500));
  revalidateTag("noco");
  revalidatePath("/bd");
  revalidatePath("/bd/today");
}

export async function startCampaign(formData) {
  await assertBdWrite();
  const campaign = clean(formData.get("campaign")).slice(0, 80);
  let url = clean(formData.get("url")).replace(/&amp;/g, "&");
  const location = clean(formData.get("location")).slice(0, 60); // only used when the LinkedIn link has no location (the new LinkedIn page leaves it out)
  if (/linkedin\.com\/jobs/i.test(url) && !/[?&](geoId|location)=/i.test(url) && location)
    url += (url.includes("?") ? "&" : "?") + "location=" + encodeURIComponent(location);
  const sender = clean(formData.get("sender")).toLowerCase();
  const email = clean(formData.get("email")).toLowerCase();
  const max_jobs = 1000,
    min_size = 10; // 4 Nov 2026 (Asad): fixed, not asked in the form
  // 4 Nov 2026 (Mo): Hunting = cold BD; Farming = existing account, approved-supplier email with the signed contract attached
  const channel =
    clean(formData.get("channel")).toLowerCase() === "farming" ? "farming" : "hunting";
  const contract = await readPdf(formData.get("contract"));
  if (channel === "farming" && !contract) redirect("/bd/start?e=4");
  const stored = contract ? await storeContract(contract) : null; // 4 Nov 2026 evening: NocoDB file storage, the path travels to Part 01 (no base64 in any text field)
  if (channel === "farming" && !stored) redirect("/bd/start?e=5");
  if (
    !campaign ||
    !/linkedin\.com\/jobs/i.test(url) ||
    !sender ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    redirect("/bd/start?e=1");
  if (!/[?&](geoId|location)=/i.test(url)) redirect("/bd/start?e=3"); // no location in the search: LinkedIn would fall back to US
  const body = {
    test_form: {
      campaign,
      url,
      location,
      sender,
      email,
      max_jobs,
      min_size,
      channel,
      ...(contract
        ? {
            contract_name: contract.contract_name,
            contract_size: contract.contract_size,
            contract_mime: contract.contract_mime
          }
        : {}),
      ...(stored || {})
    },
    channel: process.env.SLACK_BD_CHANNEL || "C0C78BL6611",
    user: "dashboard"
  };
  const res = await fetch(`${N8N}/webhook/bd-outreach-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) redirect("/bd/start?e=2");
  redirect("/bd?started=1");
}

/** A PDF from a form field -> { contract_name, contract_size, contract_b64 }, or null when nothing was chosen. 8 MB max. */
async function readPdf(file) {
  if (!file || typeof file === "string" || !file.size) return null;
  if (file.size > 8 * 1024 * 1024) return null;
  const ext = (String(file.name || "").match(/\.(pdf|docx?)$/i) || [])[1]; // 4 Nov 2026: PDF or Word
  if (!ext) return null;
  const contract_mime =
    ext.toLowerCase() === "pdf"
      ? "application/pdf"
      : ext.toLowerCase() === "doc"
        ? "application/msword"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const buf = Buffer.from(await file.arrayBuffer());
  const name =
    clean(file.name || "agreement.pdf")
      .replace(/[^\w .()-]+/g, "_")
      .slice(0, 120) || "agreement.pdf";
  return { contract_name: name, contract_size: file.size, contract_mime, buf };
}

/** 4 Nov 2026 evening: the file goes to NocoDB file storage (any size up to 8 MB), the row only keeps the path. LongText fields stop at 100,000 chars. */
async function storeContract(c) {
  const base = (process.env.NOCODB_BASE_URL || "").replace(/\/$/, "");
  const fd = new FormData();
  fd.append("file", new Blob([c.buf], { type: c.contract_mime }), c.contract_name);
  try {
    const r = await fetch(`${base}/api/v2/storage/upload?path=noco/bd/contracts`, {
      method: "POST",
      headers: { "xc-token": process.env.NOCODB_TOKEN || "" },
      body: fd
    });
    if (!r.ok) return null;
    const j = await r.json();
    const a = Array.isArray(j) ? j[0] : j;
    if (!a || !a.path) return null;
    return {
      contract_path: String(a.path),
      contract_url: `${base}/${String(a.path).replace(/^\//, "")}`
    };
  } catch {
    return null;
  }
}

/** Farming campaign: upload (or replace) the signed contract, then put the rows that waited for it back in the queue. */
export async function uploadContract(formData) {
  await assertBdWrite();
  const batch = clean(formData.get("batch"));
  const batches = clean(formData.get("batches"))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const contract = await readPdf(formData.get("contract"));
  if (!batch || !batches.length || !contract)
    redirect(`/bd/campaign/${encodeURIComponent(batch)}?e=contract`);
  const stored = await storeContract(contract);
  if (!stored) redirect(`/bd/campaign/${encodeURIComponent(batch)}?e=contract`);
  for (const b of batches)
    await upsertMeta(b, {
      bd_channel: "farming",
      contract_name: contract.contract_name,
      contract_size: contract.contract_size,
      contract_mime: contract.contract_mime,
      ...stored,
      contract_b64: "",
      updated_by: "dashboard"
    });
  const waiting = await fetchAll(T.outbox, {
    fields: "Id,batch_id,block_reason,status",
    where: `(status,eq,blocked)~and(block_reason,eq,signed contract not attached yet)`,
    fresh: true
  });
  const rows = waiting
    .filter((r) => batches.includes(r.batch_id))
    .map((r) => ({
      Id: r.Id,
      status: "queued",
      block_reason: "",
      not_before: new Date().toISOString(),
      error: ""
    }));
  if (rows.length) await writeRows(T.outbox, "PATCH", rows);
  revalidateTag("noco");
  revalidatePath("/bd");
  revalidatePath(`/bd/campaign/${batch}`);
  redirect(`/bd/campaign/${encodeURIComponent(batch)}?contract=1&requeued=${rows.length}`);
}
