import { BACKEND } from '../runtime.js';

// Keep provider Base URLs intact. Only the transport changes when the site
// is served by our backend. Injected fetch implementations remain testable.
export function providerFetch(url, init = {}, fetchImpl = globalThis.fetch, backend = BACKEND) {
  if (!backend) return fetchImpl(url, init);
  const headers = new Headers(init.headers);
  headers.set('x-schematica-target', String(url));
  headers.set('x-schematica-client', '1');
  return fetchImpl('/api/ai', { ...init, headers, credentials: 'same-origin', redirect: 'error' });
}
