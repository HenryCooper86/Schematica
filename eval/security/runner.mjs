#!/usr/bin/env node
// Live-provider security-analysis evaluation runner.
//
// Exercises the production analyzeSecurity() against a real provider (an
// OpenAI-compatible chat-completions endpoint, or any injected { chat }
// instance) over the synthetic corpus, then records full provenance: corpus
// hash, provider/model, input source identities (id + SHA-256 hash), the
// observed validated analysis, and every rubric check's expected vs actual.
//
// A scripted/canned provider is used only in tests/security-eval.test.js as a
// contract test of this runner; it is never accepted as evidence of live
// semantic success, and the CLI always talks to a real endpoint.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeSecurity, sourcesFromDocuments, sha256Hex } from '../../src/ai/security.js';
import { openaiProvider } from '../../src/ai/providers/openai.js';
import { loadCases, corpusHash, CORPUS_NOTICE } from './corpus.mjs';
import { evaluateCase } from './rubric.mjs';

const DEFAULT_TIMEOUT_MS = 120000;

function usage() {
  return `Usage: node eval/security/runner.mjs [options]

Runs the production security analyzer against a live provider for every
synthetic corpus case and writes a provenance-complete results file.

Options:
  --base-url <url>   OpenAI-compatible base URL (env SECURITY_EVAL_BASE_URL).
                     The CLI always uses a real chat-completions endpoint.
  --model <id>       Model id (env SECURITY_EVAL_MODEL).
  --api-key <key>    Optional Bearer key (env SECURITY_EVAL_API_KEY). Never
                     written to any output file.
  --case <id>        Run a single case id instead of the whole corpus.
  --out <path>       Results file (default eval/security/results/<stamp>.json).
  --timeout <ms>     Per-case timeout (default ${DEFAULT_TIMEOUT_MS}).
  --list             Print case ids and titles, then exit.

Exit codes: 0 = every case passed; 1 = at least one case failed or was not
fully assessed; 2 = no analysis was produced, invalid usage, or corpus error.`;
}

function env(name, fallback = '') {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

// Build the document list for a case and derive per-source identities. The
// analyzer retains sources in order, so index alignment ties each corpus key
// to the retained id/hash.
async function buildSources(caseDef) {
  const sources = await sourcesFromDocuments(caseDef.sources.map((s) => ({ name: s.name, text: s.text })));
  const identities = caseDef.sources.map((s, i) => ({
    key: s.key, name: s.name, id: sources[i]?.id ?? '', hash: sources[i]?.hash ?? '', totalLines: sources[i]?.totalLines ?? 0,
  }));
  return { sources, identities };
}

function providerLabel(provider) {
  return provider ? 'injected' : 'openai';
}

// Evaluate the corpus (or a subset) against a provider. `provider` (a
// { chat } instance) takes precedence; without one, `baseUrl` + `model`
// construct an OpenAI-compatible provider. Returns the full evidence record;
// nothing here needs `baseUrl` when `provider` is supplied.
export async function evaluateSecurityCases({
  provider,
  model = '',
  baseUrl = '',
  apiKey = '',
  allowTools = false,
  cases,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onCase,
} = {}) {
  const all = loadCases();
  let selected;
  if (cases === undefined) {
    selected = all;
  } else {
    const wanted = (Array.isArray(cases) ? cases : [cases]).map((c) => (typeof c === 'string' ? c : c?.id));
    selected = all.filter((c) => wanted.includes(c.id));
    const missing = wanted.filter((id) => !all.some((c) => c.id === id));
    if (missing.length) throw Error(`Unknown case id(s): ${missing.join(', ')}`);
    if (!selected.length) throw Error('No cases selected.');
  }

  let liveProvider = provider;
  if (!liveProvider) {
    if (!baseUrl || !model) throw Error('Provide --base-url and --model (or a provider instance) to run the evaluation.');
    liveProvider = openaiProvider({ baseUrl, apiKey, model, fetchImpl: globalThis.fetch });
  }
  if (!liveProvider || typeof liveProvider.chat !== 'function') throw Error('A provider with a chat() function is required.');

  let evidenceEndpoint = '';
  const secrets = new Set(apiKey ? [apiKey, encodeURIComponent(apiKey)] : []);
  if (baseUrl) {
    try {
      const endpoint = new URL(baseUrl);
      evidenceEndpoint = endpoint.origin + endpoint.pathname;
      if (endpoint.password) secrets.add(decodeURIComponent(endpoint.password));
      for (const [name, value] of endpoint.searchParams) {
        if (value && /^(?:api[-_]?key|token|secret|password|auth|access[-_]?token|signature|sig)$/i.test(name)) {
          secrets.add(value);
          secrets.add(encodeURIComponent(value));
        }
      }
    } catch { evidenceEndpoint = '[invalid endpoint]'; }
  }
  const redact = value => {
    let text = String(value);
    if (baseUrl) text = text.replaceAll(baseUrl, evidenceEndpoint);
    for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
    return text;
  };
  const redactRecord = value => {
    if (!secrets.size && (!baseUrl || baseUrl === evidenceEndpoint)) return;
    for (const key of Object.keys(value)) {
      if (typeof value[key] === 'string') value[key] = redact(value[key]);
      else if (value[key] && typeof value[key] === 'object') redactRecord(value[key]);
    }
  };

  const hash = await corpusHash();
  const evaluatorHash = await sha256Hex(await readFile(new URL('./rubric.mjs', import.meta.url), 'utf8'));
  const startedAt = new Date().toISOString();
  const results = [];

  for (const caseDef of selected) {
    const caseStarted = Date.now();
    const { sources, identities } = await buildSources(caseDef);
    const record = {
      caseId: caseDef.id,
      title: caseDef.title,
      description: caseDef.description,
      cveId: caseDef.cveId,
      status: caseDef.status,
      verdict: 'error',
      durationMs: 0,
      input: {
        userText: caseDef.userText,
        sources: identities,
      },
      analysis: null,
      checks: [],
      warnings: [],
      error: null,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`evaluation timed out after ${timeoutMs} ms`)), timeoutMs);
    const caseSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      record.analysis = await analyzeSecurity({
        provider: liveProvider,
        sources,
        cveId: caseDef.cveId,
        status: caseDef.status,
        userText: caseDef.userText,
        allowTools,
        signal: caseSignal,
      });
    } catch (error) {
      record.error = redact(error?.message || error).slice(0, 2000);
    } finally {
      clearTimeout(timer);
    }
    record.durationMs = Date.now() - caseStarted;
    const evaluated = evaluateCase(caseDef, record.analysis);
    record.verdict = evaluated.verdict;
    record.checks = evaluated.checks;
    if (record.analysis) record.warnings = record.analysis.warnings || [];
    // Score the original output; redact owned records before any callback or
    // publication. A credential-echoing endpoint must not leak through success.
    redactRecord(record);
    results.push(record);
    if (onCase) await onCase(record);
  }

  const counts = { total: results.length, passed: 0, failed: 0, notAssessed: 0, errored: 0 };
  for (const r of results) {
    if (r.verdict === 'pass') counts.passed++;
    else if (r.verdict === 'fail') counts.failed++;
    else if (r.verdict === 'not-assessed') counts.notAssessed++;
    else counts.errored++;
  }
  const finishedAt = new Date().toISOString();
  return {
    version: 1,
    kind: 'security-eval',
    notice: CORPUS_NOTICE,
    startedAt,
    finishedAt,
    provider: providerLabel(provider),
    model: redact(model),
    baseUrl: provider ? '' : redact(evidenceEndpoint),
    allowTools,
    corpusHash: hash,
    evaluatorHash,
    redactionPolicy: 'Configured credentials and sensitive endpoint material are redacted after scoring, before publication. Redacted analysis text is not a byte-for-byte copy of the provider reply.',
    summary: { ...counts, targetMet: counts.passed === counts.total },
    cases: results,
  };
}

// CLI entry: build an OpenAI-compatible provider from args/env and write the
// full record. No api key is ever persisted.
async function cli(argv) {
  const args = { case: null, out: '', timeout: DEFAULT_TIMEOUT_MS, list: false };
  const flags = new Map([['--base-url', 'baseUrl'], ['--model', 'model'], ['--api-key', 'apiKey'], ['--case', 'case'], ['--out', 'out'], ['--timeout', 'timeout'], ['--list', 'list']]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { console.log(usage()); return 0; }
    const key = flags.get(arg);
    if (!key) throw Error(`Unknown argument ${arg}\n\n${usage()}`);
    if (arg === '--list') { args.list = true; continue; }
    const value = argv[++i];
    if (value === undefined) throw Error(`Missing value for ${arg}`);
    if (key === 'case') args.case = value;
    else if (key === 'out') args.out = value;
    else if (key === 'timeout') { args.timeout = Number(value); if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw Error('--timeout must be a positive number'); }
    else args[key] = value;
  }

  if (args.list) {
    const rows = loadCases().map((c) => ({ id: c.id, title: c.title, cveId: c.cveId, status: c.status }));
    console.log(JSON.stringify({ version: 1, kind: 'security-eval-cases', notice: CORPUS_NOTICE, cases: rows }, null, 2));
    return 0;
  }

  const model = args.model ?? env('SECURITY_EVAL_MODEL');
  const baseUrl = args.baseUrl ?? env('SECURITY_EVAL_BASE_URL');
  const apiKey = args.apiKey ?? env('SECURITY_EVAL_API_KEY');
  if (!baseUrl || !model) throw Error('--base-url and --model (or SECURITY_EVAL_BASE_URL/SECURITY_EVAL_MODEL) are required.\n\n' + usage());

  const record = await evaluateSecurityCases({
    model, baseUrl, apiKey, allowTools: false,
    cases: args.case ? [args.case] : undefined,
    timeoutMs: args.timeout,
    onCase: (r) => console.log(`[${r.caseId}] ${r.verdict}`),
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = args.out || `eval/security/results/security-eval-${stamp}.json`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(record, null, 2) + '\n');

  console.log(JSON.stringify({ version: 1, kind: 'security-eval', summary: record.summary, results: outPath, corpusHash: record.corpusHash }, null, 2));
  return record.summary.targetMet ? 0 : (record.summary.errored === record.summary.total ? 2 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = await cli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
