export default function Help() {
  const steps = [
    [
      "1. Start a campaign",
      "In Slack, open #bd-outreach and type hi. Fill the form: campaign name, the LinkedIn jobs search link, who the emails should be sent as, and your email for the results."
    ],
    [
      "2. Collecting job ads",
      "The system reads the job ads from LinkedIn and keeps only real companies. Staffing agencies and companies we already work with are removed."
    ],
    [
      "3. Finding decision makers",
      "For each company it finds up to three people: the person who posted the job, the head of that department, and senior HR. It looks up and verifies their work emails. About one minute per company, so 100 companies take about 100 minutes. Progress updates appear in the Slack thread every 30 minutes."
    ],
    [
      "4. Sending emails",
      "Emails go out from the chosen mailbox, Monday to Friday, 7:00 to 19:00 UK, spread through the day up to the daily limit. Each person gets one email. Nobody gets emailed twice in 60 days."
    ],
    [
      "5. Replies",
      "Replies land in the sender's own Gmail. This dashboard lists who replied so the sender can follow up. Out-of-office and automatic replies are detected and kept apart, they do not count as replies."
    ],
    [
      "6. Finished",
      "When nothing is left to send, the sender gets one Excel with everyone emailed and everyone skipped with the reason."
    ]
  ];
  const faq = [
    [
      "What does Skipped mean?",
      'A person the system found but decided not to email. Open the campaign and read the "Skipped on purpose" box: every reason is listed with why it exists, and you can expand each one to see the people. Common reasons: no work email found, the email would bounce, the company is already a client or in contact, it is a recruitment agency, or they were emailed in the last 60 days.'
    ],
    [
      "What is the Team page?",
      "One card per mailbox: how many emails went out today against the daily limit, total sent, replies and waiting. Open a name for the last 14 days, day by day. If Gmail refuses a mailbox, the card says so: the emails are kept and go out again once that mailbox is reconnected in n8n."
    ],
    [
      "What do job ads, companies and people mean on a card?",
      "Job ads is how many LinkedIn job ads the search gave. Companies is how many different companies posted them, after agencies and existing clients are removed. People found is how many decision makers with a work email were found across those companies. Each person gets one email."
    ],
    [
      "When should I upload the next search?",
      "The banner on the Campaigns page tells you. When it says the queue runs out today, start a new campaign so tomorrow is not empty."
    ],
    ["Can I pause sending?", "Yes. Ask Asad, or post pause in #bd-outreach. Resume the same way."],
    [
      "Why did the same search give fewer jobs the second time?",
      "Jobs and companies already handled in the last 60 days are skipped on purpose, so nobody gets the same email twice."
    ]
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">How it works</h1>
        <p className="text-sm text-mute">From a LinkedIn search to replies in the inbox.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map(([t, b]) => (
          <li key={t} className="card px-6 py-5">
            <div className="font-semibold">{t}</div>
            <p className="mt-1 text-sm text-mute">{b}</p>
          </li>
        ))}
      </ol>
      <section className="card px-6 py-5">
        <h2 className="font-semibold">Questions</h2>
        <dl className="mt-2 space-y-3 text-sm">
          {faq.map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium">{q}</dt>
              <dd className="text-mute">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
