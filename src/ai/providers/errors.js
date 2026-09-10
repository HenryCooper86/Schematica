// One error shape for every provider, with a short code the panel maps to a
// message: auth, rate, network, model, context, refusal, request.
import { tr } from '../../i18n.js';
export class ProviderError extends Error {
  constructor(message, { code = 'request', status = 0, hint = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

// A single tool call's assembled input JSON is capped so a runaway or
// malicious stream can't grow an unbounded string in memory.
export const MAX_TOOL_INPUT = 256 * 1024;
// Text and thinking are capped far above any real reply for the same reason.
export const MAX_STREAM_TEXT = 2 * 1024 * 1024;
// The backend (server/index.js) marks its own refusals with this code: a 403
// from it means the request was not allowed, not that the key was rejected.
export const POLICY_CODE = 'schematica_policy';

export function mapHttpError(status, body, provider) {
  let message = tr('{provider} returned HTTP {status}', { provider, status });
  let policy = false;
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    message = j?.error?.message || j?.message || j?.error || message;
    if (typeof message !== 'string') message = JSON.stringify(message);
    policy = j?.error?.code === POLICY_CODE;
  } catch { if (typeof body === 'string' && body.trim()) message = body.slice(0, 200); }
  let code = 'request';
  // A policy refusal stays a request error: the key is not the problem.
  if ((status === 401 || status === 403) && !policy) code = 'auth';
  else if (status === 429) code = 'rate';
  else if (status === 404) code = 'model';
  else if (status === 400 && /context|too long|too many tokens|maximum context|max_tokens/i.test(message)) code = 'context';
  return new ProviderError(message, { code, status });
}

// A fetch that threw: the network, CORS, or a blocked origin.
export function networkError(provider, err, baseUrl = '') {
  let relay = false;
  try { relay = /^\/(ollama\.com|api\.moonshot\.ai)(\/|$)/.test(new URL(baseUrl).pathname); } catch { /* a malformed URL is reported by fetch */ }
  const hint = relay
    ? tr('Check that the relay is deployed and reachable, then set Base URL to its URL followed by /ollama.com/v1 or /api.moonshot.ai/v1 for your provider. See relay/README.md.')
    : '';
  return new ProviderError(tr('Could not reach {provider}: {error}', { provider, error: err?.message || err }), { code: 'network', hint });
}
