// Corpus loading, validation and integrity hashing. The corpus is data: this
// module only checks shape and computes identities, never runs anything.
import { sha256Hex, normalizeCveId } from '../../src/ai/security.js';
import { SECURITY_EVAL_CASES, CORPUS_NOTICE } from './cases.mjs';
import { RUBRIC_PRIMITIVES } from './rubric.mjs';

const STATUSES = ['published', 'reserved', 'rejected', 'unknown', 'not-provided'];
const LINE_LIMIT = 120; // sources must fit the initial inline context (single-shot)

export function validateCase(c, index) {
  const where = (msg) => `case #${index + 1} (${c?.id || '?'}): ${msg}`;
  if (!c || typeof c !== 'object') throw Error(`case #${index + 1} is not an object`);
  for (const field of ['id', 'title', 'description', 'cveId', 'status', 'userText', 'sources', 'rubric']) {
    if (typeof c[field] === 'undefined') throw Error(where(`missing field ${field}`));
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id)) throw Error(where('id must be a lowercase kebab identifier'));
  const normalized = normalizeCveId(c.cveId);
  if (!normalized || normalized !== c.cveId) throw Error(where(`cveId ${JSON.stringify(c.cveId)} is not a normalized CVE identifier`));
  if (!STATUSES.includes(c.status)) throw Error(where(`status ${JSON.stringify(c.status)} is not recognized`));
  if (!Array.isArray(c.sources) || !c.sources.length) throw Error(where('sources must be a non-empty array'));
  const keys = new Set();
  c.sources.forEach((s, i) => {
    if (!s || typeof s.key !== 'string' || !s.key || typeof s.name !== 'string' || !s.name.trim()
      || typeof s.text !== 'string' || !s.text.trim()) {
      throw Error(where(`source #${i + 1} needs key, name and non-empty text`));
    }
    if (keys.has(s.key)) throw Error(where(`duplicate source key ${s.key}`));
    keys.add(s.key);
    if (s.text.split('\n').length > LINE_LIMIT) {
      throw Error(where(`source ${s.key} is ${s.text.split('\n').length} lines; keep <= ${LINE_LIMIT} for single-shot inline delivery`));
    }
  });
  if (!Array.isArray(c.rubric) || !c.rubric.length) throw Error(where('rubric must be a non-empty array'));
  const ids = new Set();
  c.rubric.forEach((r, i) => {
    if (!r || typeof r.id !== 'string' || !r.id) throw Error(where(`rubric #${i + 1} needs an id`));
    if (ids.has(r.id)) throw Error(where(`duplicate rubric id ${r.id}`));
    ids.add(r.id);
    if (typeof r.primitive !== 'string' || !(r.primitive in RUBRIC_PRIMITIVES)) {
      throw Error(where(`rubric ${r.id} uses unknown primitive ${JSON.stringify(r.primitive)}`));
    }
    if (typeof r.describe !== 'string' || !r.describe.trim()) throw Error(where(`rubric ${r.id} needs a describe (expected observation)`));
    if (typeof r.params !== 'object' || r.params === null) throw Error(where(`rubric ${r.id} needs params`));
    if (typeof r.required !== 'undefined' && typeof r.required !== 'boolean') throw Error(where(`rubric ${r.id} required must be boolean`));
    for (const [name, val] of Object.entries(r.params)) {
      if (name === 'source' || name === 'sources') {
        const refs = name === 'source' ? [val] : (Array.isArray(val) ? val : []);
        for (const ref of refs) {
          if (!keys.has(ref)) throw Error(where(`rubric ${r.id} references unknown source key ${JSON.stringify(ref)}`));
        }
      }
    }
  });
  return c;
}

export function loadCases() {
  const seen = new Set();
  return SECURITY_EVAL_CASES.map((c, i) => {
    const valid = validateCase(c, i);
    if (seen.has(valid.id)) throw Error(`duplicate case id ${valid.id}`);
    seen.add(valid.id);
    return valid;
  });
}

// Include analyst notes and human-readable expectations as well as source text:
// changing the question or rubric must change the recorded evaluation identity.
export async function corpusHash() {
  return sha256Hex(JSON.stringify(SECURITY_EVAL_CASES));
}

export { CORPUS_NOTICE };
