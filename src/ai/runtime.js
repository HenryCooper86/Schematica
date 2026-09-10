// Static hosting uses direct browser requests. Schematica's Node server
// serves this module with BACKEND=true; no client-side discovery or fallback
// can accidentally send a key to a different destination.
export const BACKEND = false;
