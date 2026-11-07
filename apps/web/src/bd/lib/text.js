// Plain English for the team. Every technical reason from the pipeline gets a short human sentence.

export function friendlyReason(reason) {
  const r = String(reason || "");
  if (!r) return "Not sent";
  if (/^no work email/i.test(r)) return "No work email could be found for this person";
  if (/catch-all/i.test(r))
    return "Email address could not be verified (catch-all domain), skipped to protect the sender";
  if (/invalid by the verifier|Reoon verifier/i.test(r))
    return "Email address would bounce, skipped";
  if (/^existing client/i.test(r)) return r.replace(/^existing client: /, "Existing client: ");
  if (/^known contact of/i.test(r)) return r.replace(/^known contact of/, "Known contact of");
  if (/^handed to/i.test(r)) return r.replace(/^handed to/, "Handed to");
  if (/existing lead/i.test(r)) return "Already a client or already in contact with us";
  if (/recruitment agency|staffing/i.test(r)) return "This is a recruitment agency, not a client";
  if (/suppression/i.test(r)) return "On the do-not-contact list";
  if (/emailed in the last 60 days/i.test(r)) return "Emailed in the last 60 days already";
  if (/draft check flag/i.test(r))
    return "Draft needed a human check (greeting or wording), not sent";
  if (/placeholder/i.test(r)) return "Draft had a placeholder left in it";
  if (/spam-trigger/i.test(r)) return "Draft wording could trigger spam filters";
  if (/role address/i.test(r)) return "Generic mailbox (info@, hr@), not a person";
  if (/same address already/i.test(r)) return "Same person appears twice in this batch";
  if (/illustrative/i.test(r)) return "Needs real candidate profiles before sending";
  if (/no active sender/i.test(r)) return "No active sender mailbox for this batch";
  return r;
}

// Short bucket for a skip reason, used on the campaign cards and the reason list. Same wording everywhere.
export function skipBucket(reason) {
  const r = String(reason || "");
  if (/^no work email/i.test(r)) return "no work email";
  if (/^existing client/i.test(r)) return "existing client";
  if (/^known contact of/i.test(r)) return "known relationship";
  if (/^handed to/i.test(r)) return "handed to the account manager";
  if (/^signed contract not attached/i.test(r)) return "contract not attached";
  if (/existing lead/i.test(r)) return "already a client or in contact";
  if (/catch-all|invalid by the verifier|Reoon/i.test(r)) return "email would bounce";
  if (/recruitment agency|staffing/i.test(r)) return "recruitment agency";
  if (/emailed in the last 60 days|same address already/i.test(r)) return "emailed recently";
  if (/suppression/i.test(r)) return "do-not-contact list";
  if (/draft check flag|placeholder|spam-trigger|illustrative/i.test(r))
    return "draft needed a check";
  if (/role address/i.test(r)) return "generic mailbox";
  if (/cancelled/i.test(r)) return "cancelled by the team";
  return "other";
}

// Why each bucket exists, in one sentence the team can repeat to a client.
export const skipWhy = {
  "no work email":
    "The person was found but no tool (FullEnrich, Reoon) could find a work email for them. Nothing to send to.",
  "existing client":
    "The company is in the Zoho Clients module. We work with them already, so no cold email goes out.",
  "known relationship":
    "Someone on the team has real email history with this company (found in their mailbox). The account manager decides: send anyway, or take it over.",
  "handed to the account manager":
    "The account manager who knows this company took it over from here.",
  "contract not attached":
    "This is a Farming (existing account) campaign and the signed contract is not uploaded yet. Upload it at the top of this page (PDF or Word), or drop it in the Slack thread of the campaign, and the emails go into the queue.",
  "already a client or in contact":
    "The company is in one of the team's existing lead tables (Replied, Existing or In Smartlead). Emailing them again would step on a live conversation.",
  "email would bounce":
    "The address failed verification or sits on a catch-all domain. A bounce hurts the sender's reputation, so it is not sent.",
  "recruitment agency":
    "The company is a staffing agency or recruiter, so it is a competitor, not a client.",
  "emailed recently":
    "This person or company was emailed in the last 60 days. One email per person per 60 days.",
  "do-not-contact list": "The person or company is on the do-not-contact list.",
  "draft needed a check":
    "The draft had something a human should look at (greeting, placeholder, wording). Better not sent than sent wrong.",
  "generic mailbox": "The address is a shared inbox such as info@ or hr@, not a person.",
  "cancelled by the team":
    "Someone cancelled the remaining emails of this campaign from the dashboard.",
  other:
    "A reason that does not fit the usual buckets. The exact text is in the campaign's Excel file."
};

// Companies that were researched but gave nobody to email.
export function companySkipReason(reason) {
  const r = String(reason || "");
  if (/nobody found|nobody at this company|no plausible owner/i.test(r))
    return "nobody suitable found at the company";
  if (/staffing agency|recruiter|recruitment agency/i.test(r)) return "recruitment agency";
  if (/^existing client/i.test(r)) return "existing client";
  if (/^known contact of/i.test(r)) return "known relationship";
  if (/^handed to/i.test(r)) return "handed to the account manager";
  if (/existing lead/i.test(r)) return "already a client or in contact";
  return r ? r.replace(/\s*\(.*$/, "").slice(0, 80) : "no reason recorded";
}

export function stageLabel(stage) {
  return (
    {
      scraping: "Collecting job ads",
      researching: "Finding decision makers",
      sending: "Sending emails",
      complete: "Complete",
      nothing: "Nothing to send",
      paused: "Paused"
    }[stage] || stage
  );
}

export function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London"
  });
}
export function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  });
}
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
