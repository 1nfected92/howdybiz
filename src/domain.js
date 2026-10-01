export const STAGES = ['New', 'Reviewing', 'Qualified', 'Email Drafted', 'Contacted', 'Proposal Sent', 'Follow-up', 'Negotiating', 'Accepted', 'In Progress', 'Completed', 'Not Interested', 'On Hold', 'Do Not Contact'];
export const PROPOSAL_STATES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];
export const PAYMENT_STATES = ['Unpaid', 'Deposit Paid', 'Partially Paid', 'Paid', 'Overdue', 'Refunded'];
export const SCORES = ['Potential', 'Possible', 'Not Needed'];
export const qualified = b => Boolean(b.phone?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || ''));
export function assess(b) {
  if (!b.website) return { score: 'Potential', explanation: 'No website is listed in the current source. Confirm with the owner before proposing a new site.' };
  if (b.website_status === 'Unavailable') return { score: 'Potential', explanation: 'Repeated website checks failed. Confirm the outage and investigate before contacting.' };
  if (b.analysis?.findings?.length) return { score: 'Potential', explanation: b.analysis.findings.join(' ') };
  return { score: 'Possible', explanation: 'A listed website alone does not establish need. Review usability, booking, and follow-up opportunities.' };
}
export function matches(b, f = {}) {
  const hay = [b.name, b.category, b.address, b.zip, b.email].join(' ').toLowerCase();
  return (!f.text || hay.includes(f.text.toLowerCase())) && (!f.category || b.category === f.category) && (!f.score || b.score === f.score) && (!f.stage || b.stage === f.stage) && (!f.website || b.website_status === f.website) && (!f.rating || Number(b.rating) >= Number(f.rating));
}
export function mergeDiscovery(previous, incoming) {
  const map = new Map(previous.map(b => [b.place_id || b.id, b]));
  for (const b of incoming) {
    const key = b.place_id || b.id, old = map.get(key);
    map.set(key, old ? { ...old, ...b, id: old.id, stage: old.stage, score: old.score, explanation: old.explanation, notes: old.notes, tasks: old.tasks, activity: old.activity, proposals: old.proposals, payments: old.payments } : b);
  }
  return [...map.values()];
}
export function metrics(records) {
  const leads = records.filter(qualified);
  return { qualified: leads.length, potential: leads.filter(b => b.score === 'Potential').length, proposals: records.reduce((n, b) => n + (b.proposals || []).filter(p => p.status === 'Sent').length, 0), followups: records.filter(b => b.followup && b.followup <= new Date().toISOString().slice(0,10) && !['Completed','Do Not Contact'].includes(b.stage)).length, projects: records.filter(b => b.stage === 'In Progress').length, payments: records.reduce((n,b) => n + (b.payments || []).reduce((s,p) => s + (p.status === 'Refunded' ? -Number(p.amount) : ['Paid','Deposit Paid','Partially Paid'].includes(p.status)?Number(p.amount):0),0),0) };
}
export function emailDraft(b, sender = 'HowdyBiz') {
  const offer = b.website ? 'improving your website and simplifying customer inquiries' : 'creating a professional website that makes it easy for customers to reach you';
  return { subject: `A website idea for ${b.name}`, body: `Hello ${b.name} team,\n\nI’m reaching out with an idea for ${offer}.\n\nI build websites and practical automations, such as appointment requests, inquiry routing, and follow-up reminders. I’d be happy to discuss what would help your business and prepare a tailored scope and quote.\n\nWould you be open to a brief conversation?\n\n${sender}\n\nIf you prefer no further contact, reply “unsubscribe” and I’ll remove you from my outreach list.` };
}
export function csv(records) {
  const keys = ['name','category','address','zip','phone','email','website','website_status','score','stage'];
  const escape = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"','""') + '"';
  return [keys.join(','), ...records.map(b => keys.map(k => escape(b.export_record&&Object.hasOwn(b.export_record,k)?b.export_record[k]:b[k])).join(','))].join('\r\n');
}
export function safeUrl(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
