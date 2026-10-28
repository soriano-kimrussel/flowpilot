// Rule-based workflow step suggestions: maps goal keywords to known action sequences.

const RULES = [
  {
    keywords: ['qualif', 'score', 'hot', 'prioriti'],
    reason: 'Qualifying leads usually means validating, classifying and scoring them.',
    steps: ['lead.validate', 'lead.classify', 'lead.score'],
  },
  {
    keywords: ['follow', 'reply', 'respond', 'email', 'draft'],
    reason: 'Follow-ups combine a drafted reply with a (simulated) send.',
    steps: ['ai.draft_reply', 'email.demo_send'],
  },
  {
    keywords: ['route', 'assign', 'owner', 'team'],
    reason: 'Routing uses a condition plus a lead update to set the assignee.',
    steps: ['condition.evaluate', 'lead.update'],
  },
  {
    keywords: ['notify', 'alert', 'tell', 'slack'],
    reason: 'In-app notifications keep the team informed without paid messaging services.',
    steps: ['notification.create'],
  },
  {
    keywords: ['crm', 'sync', 'hubspot', 'salesforce'],
    reason: 'CRM sync is simulated in demo mode; no external request is made.',
    steps: ['crm.demo_sync'],
  },
  {
    keywords: ['summar', 'brief', 'overview'],
    reason: 'Summaries give reps a quick overview of each lead.',
    steps: ['lead.summarize'],
  },
  {
    keywords: ['clean', 'normaliz', 'format', 'transform'],
    reason: 'Safe transforms normalize values without running custom code.',
    steps: ['data.transform'],
  },
  {
    keywords: ['webhook', 'form', 'intake', 'capture'],
    reason: 'Form intake validates the payload, then creates the lead.',
    steps: ['lead.validate', 'lead.create'],
  },
];

export function suggestSteps(goal) {
  const text = String(goal ?? '')
    .toLowerCase()
    .slice(0, 500);
  const matched = RULES.filter((rule) => rule.keywords.some((k) => text.includes(k)));
  const chosen = matched.length ? matched : [RULES[0], RULES[1]];

  const steps = [];
  for (const rule of chosen) {
    for (const type of rule.steps) if (!steps.includes(type)) steps.push(type);
  }
  if (!steps.includes('execution.log')) steps.push('execution.log');

  return {
    steps,
    reasons: chosen.map((r) => r.reason),
    matchedGoal: matched.length > 0,
  };
}
