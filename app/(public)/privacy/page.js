export const metadata = { title: 'Privacy & data handling' };

const SECTIONS = [
  {
    title: 'What is stored',
    items: [
      'Your account email and display name (authentication is handled by Supabase Auth; passwords are hashed by Supabase and never stored by FlowPilot).',
      'Workspace data you create: leads, workflows, execution logs, notifications and audit entries.',
      'Webhook secrets are stored only as SHA-256 hashes and shown once when generated.',
    ],
  },
  {
    title: 'Who can see it',
    items: [
      'Workspace data is visible only to members of that workspace, enforced by PostgreSQL Row Level Security.',
      'Notifications are visible only to their recipient. Audit logs and webhook settings are visible only to owners and admins.',
    ],
  },
  {
    title: 'AI processing',
    items: [
      'By default all “AI” features are deterministic rules running inside FlowPilot. No lead data is sent to any external model.',
      'If an operator configures an external model, only business context (first name, company, title, size, budget, source and a message with emails and phone numbers removed) is sent. Email addresses, phone numbers, notes and IDs are never included.',
    ],
  },
  {
    title: 'Integrations and email',
    items: [
      'CRM and email actions are simulations. They record what would have been sent in the lead activity log and never contact external services.',
      'The only emails sent are Supabase authentication emails (confirmation and password reset).',
    ],
  },
  {
    title: 'Logs and redaction',
    items: [
      'Execution step inputs and outputs are stored to make automation auditable. Keys that look like secrets, tokens, passwords or authorization headers are redacted before storage, and large values are truncated.',
      'Recipient emails in simulated sends are masked in execution logs.',
    ],
  },
  {
    title: 'Deleting data',
    items: [
      'Admins can delete leads and workflows. Owners can delete a workspace, which removes all of its data.',
      'Demo data can be removed at any time from Settings.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy &amp; data handling</h1>
      <p className="mt-3 text-ink-muted">
        FlowPilot AI is a demonstration project. Please don&apos;t enter real personal data you are
        not allowed to process. This page describes how the application handles data.
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-10">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
