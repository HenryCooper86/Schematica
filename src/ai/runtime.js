// Static hosting uses direct browser requests. Schematica's Node server
// serves this module with BACKEND=true; no client-side discovery or fallback
// can accidentally send a key to a different destination.
export const BACKEND = false;
// True when the server forwards /api/cve/{id} to an operator's CVE database.
export const CVE_PROXY = false;
