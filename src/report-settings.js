// Report presentation travels with the board, independently of review approval.
export const REPORT_SECTIONS = ['architecture', 'security', 'interfaces', 'requirements', 'decisions', 'power', 'bom', 'verification', 'changes'];
export const MAX_REPORT_LOGO_BYTES = 256 * 1024;
const text = (value, limit = 20000) => typeof value === 'string' ? value.slice(0, limit) : '';

export function normalizeReportSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const key of ['title', 'organization', 'author', 'recipient']) out[key] = text(raw[key], 240);
  out.revision = text(raw.revision, 80);
  const date = text(raw.date, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  out.date = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
  out.status = ['draft', 'review', 'issued'].includes(raw.status) ? raw.status : 'draft';
  for (const key of ['summary', 'scope', 'architecture', 'risks', 'nextSteps']) out[key] = text(raw[key]);
  out.sections = Array.isArray(raw.sections)
    ? REPORT_SECTIONS.filter(key => raw.sections.includes(key)) : [...REPORT_SECTIONS];
  if (raw.securitySources === true || raw.securitySources === 'on') out.securitySources = true;
  const logo = typeof raw.logo === 'string' ? raw.logo : '';
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
  const payload = match?.[2] || '';
  const bytes = payload.length / 4 * 3 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  const signature = match?.[1] === 'png' ? payload.startsWith('iVBORw0KGgo') : payload.startsWith('/9j/');
  out.logo = match && signature && payload.length % 4 === 0 && bytes <= MAX_REPORT_LOGO_BYTES ? logo : '';
  return out;
}
