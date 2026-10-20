import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSecurityReader, sourcesFromDocuments, readSecuritySource, rawFileTarget, normalizeCveId,
  selectAdvisories, sha256Hex, SECURITY_SOURCE_CHARS, SECURITY_SOURCE_LIMIT, READ_SPAN_CHARS,
} from '../src/ai/security.js';
import { validateSecurityAnalysis } from '../src/security-analysis.js';

const FETCHED = '2026-10-20T00:00:00Z';
const textSource = (content, url = 'https://example.com/a.js') =>
  ({ url, contentType: 'text/plain', encoding: 'text', content, fetchedAt: FETCHED });

// A source collection is contract-valid only if it survives the parent model.
const checkSources = async (sources, { cveId = '', status = 'not-provided' } = {}) => validateSecurityAnalysis({
  version: 1, id: 'check', title: 'Check', cveId, status, summary: '', generatedAt: FETCHED,
  sources, findings: [], relationships: [], warnings: [],
});

test('CVE ids normalize and file URLs map to raw selected files', () => {
  assert.equal(normalizeCveId(' cve-2021-44228 '), 'CVE-2021-44228');
  assert.equal(normalizeCveId('CVE-21-1'), null);
  assert.equal(normalizeCveId('log4shell'), null);
  const gh = rawFileTarget('https://github.com/apache/log4j/blob/2.x/src/JndiLookup.java#L40');
  assert.equal(gh.url, 'https://raw.githubusercontent.com/apache/log4j/2.x/src/JndiLookup.java');
  assert.equal(gh.name, 'apache/log4j/2.x/src/JndiLookup.java');
  const raw = rawFileTarget('https://raw.githubusercontent.com/o/r/v1.2/dir/file.c');
  assert.equal(raw.url, 'https://raw.githubusercontent.com/o/r/v1.2/dir/file.c');
  assert.equal(rawFileTarget('https://example.com/base/CVE-1.html?x=1').name, 'CVE-1.html');
  assert.equal(rawFileTarget('https://example.com/').name, 'example.com');
  assert.throws(() => rawFileTarget('not a url'), /Invalid URL/);
});

test('readUrl fetches through the protected backend and returns canonical, hash-verified sources', async () => {
  const seen = [];
  const content = 'import jndi\nlookup\nrun';
  const reader = createSecurityReader({
    backend: true,
    fetchImpl: async (path, options) => {
      seen.push({ path, options });
      return Response.json(textSource(content, 'https://example.com/a.js'));
    },
  });
  const result = await reader.readUrl('https://github.com/o/r/blob/main/a.js');
  assert.deepEqual(result.warnings, []);
  const source = result.sources[0];
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, '/api/web');
  assert.equal(JSON.parse(seen[0].options.body).url, 'https://raw.githubusercontent.com/o/r/main/a.js');
  assert.equal(seen[0].options.headers['x-schematica-client'], '1');
  assert.equal(seen[0].options.headers.authorization, undefined);
  assert.equal(source.url, 'https://example.com/a.js');
  assert.equal(source.retrievedAt, FETCHED);
  assert.equal(source.hash, await sha256Hex(content));
  assert.equal(source.startLine, 1);
  assert.equal(source.totalLines, 3);
  assert.equal(source.partial, false);
  await checkSources([source]);
  assert.equal((await reader.readUrl('https://github.com/o/r/blob/main/a.js')).sources[0].id, source.id);
  assert.equal(seen.length, 1); // cached
});

test('long sources are retained partially with warnings and a retained-text hash', async () => {
  const content = Array.from({ length: 30000 }, (_, i) => `line ${i + 1}`).join('\n');
  const reader = createSecurityReader({ backend: true, fetchImpl: async () => Response.json(textSource(content)) });
  const { sources: [source] } = await reader.readUrl('https://example.com/big.txt');
  assert.equal(source.text.length, SECURITY_SOURCE_CHARS);
  assert.equal(source.partial, true);
  assert.match(source.warnings[0], /Partial source: only the first 100,000 characters/);
  assert.equal(source.hash, await sha256Hex(source.text));
  assert.equal(source.totalLines, 30000);
  await checkSources([source]);
});

test('HTML and PDF extraction warnings prevent a falsely complete source record', async () => {
  for (const format of ['html', 'pdf']) {
    const warning = `The ${format} reader omitted unsupported content.`;
    const parsed = { text: 'Extracted evidence', warnings: [warning] };
    const reader = createSecurityReader({
      backend: true,
      fetchImpl: async () => Response.json({
        ...textSource(format === 'pdf' ? 'JVBERg==' : '<main>Evidence</main>'),
        contentType: format === 'pdf' ? 'application/pdf' : 'text/html',
        encoding: format === 'pdf' ? 'base64' : 'text',
      }),
      parseHtml: () => parsed,
      parsePdf: async () => parsed,
    });
    const result = await reader.readUrl(`https://example.com/advisory.${format}`);
    assert.equal(result.sources[0].partial, true, format);
    assert.deepEqual(result.sources[0].warnings, [warning], format);
    await checkSources(result.sources);
  }
});

test('cancelled PDF extraction neither publishes nor caches a late parser result', async () => {
  const controller = new AbortController();
  let first = true;
  const reader = createSecurityReader({
    backend: true,
    fetchImpl: async () => Response.json({ ...textSource('JVBERg=='), contentType: 'application/pdf', encoding: 'base64' }),
    parsePdf: async (_content, signal) => {
      if (!first) throw Error('Extraction failed on retry.');
      first = false;
      controller.abort();
      // An uncooperative parser may still settle after cancellation.
      return { text: signal.aborted ? 'Late extraction' : 'Not cancelled', warnings: [] };
    },
  });
  await assert.rejects(reader.readUrl('https://example.com/advisory.pdf', { signal: controller.signal }),
    error => error.name === 'AbortError');
  const retry = await reader.readUrl('https://example.com/advisory.pdf');
  assert.deepEqual(retry.sources, []);
});

test('a CVE response arriving after cancellation cannot establish a record', async () => {
  const controller = new AbortController();
  const reader = createSecurityReader({
    backend: true,
    fetchImpl: async () => {
      controller.abort();
      return Response.json(textSource(JSON.stringify({
        cveMetadata: { cveId: 'CVE-2025-12345', state: 'PUBLISHED' }, containers: { cna: {} },
      })));
    },
  });
  await assert.rejects(reader.lookupCve('CVE-2025-12345', { signal: controller.signal }),
    error => error.name === 'AbortError');
});

test('reader failures surface as warnings without fake sources; cancellation propagates', async () => {
  const boom = async () => { throw Error('must not fetch'); };
  const staticReader = createSecurityReader({ backend: false, fetchImpl: boom });
  const degraded = await staticReader.readUrl('https://example.com/x');
  assert.deepEqual(degraded.sources, []);
  assert.match(degraded.warnings[0], /Node-backed Schematica site/);
  const failed = await createSecurityReader({ backend: true, fetchImpl: async () => Response.json({ error: { message: 'Source returned HTTP 403' } }, { status: 502 }) })
    .readUrl('https://example.com/x');
  assert.deepEqual(failed.sources, []);
  assert.match(failed.warnings[0], /Could not read https:\/\/example\.com\/x: Source returned HTTP 403/);
  const malformed = await createSecurityReader({ backend: true, fetchImpl: async () => Response.json(textSource('x')) }).readUrl('not a url');
  assert.equal(malformed.warnings[0], 'Invalid source URL.');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(createSecurityReader({ backend: true, fetchImpl: boom }).readUrl('https://example.com/x', { signal: controller.signal }),
    error => error.name === 'AbortError');
});

const CVE = 'CVE-2021-44228';
const cveRecord = {
  cveMetadata: { cveId: CVE, state: 'PUBLISHED' },
  containers: {
    cna: {
      title: 'Remote code execution in Log4j',
      descriptions: [{ lang: 'en', value: 'Apache Log4j2 JNDI features allow remote code execution.' }],
      references: [
        { url: 'https://github.com/advisories/GHSA-jfh8-c2jp-5v3q', tags: ['vendor-advisory'] },
        { url: 'https://logging.apache.org/log4j/2.x/security.html', tags: ['vendor-advisory'] },
        { url: 'https://example.com/poc.js', tags: ['exploit'] },
        { url: 'https://example.com/lists/thread', tags: ['mailing-list'] },
      ],
    },
    adp: [{ descriptions: [{ lang: 'en', value: 'ADP enrichment' }], references: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228' }] }],
  },
};
const lookupReader = record => {
  const calls = [];
  const reader = createSecurityReader({
    backend: true,
    fetchImpl: async (path, options) => {
      const wanted = JSON.parse(options.body).url;
      calls.push(wanted);
      if (wanted === `https://cveawg.mitre.org/api/cve/${CVE}`) {
        return Response.json({ url: wanted, contentType: 'application/json', encoding: 'text', content: JSON.stringify(record), fetchedAt: FETCHED });
      }
      return Response.json(textSource(`Advisory body for ${wanted}\nsecond line`, wanted));
    },
  });
  return { reader, calls };
};

test('lookupCve reads the official CVE API and conservatively follows tagged vendor advisories', async () => {
  const { reader, calls } = lookupReader(cveRecord);
  const result = await reader.lookupCve(CVE);
  assert.equal(result.cveId, CVE);
  assert.equal(result.status, 'published');
  assert.equal(result.title, 'Remote code execution in Log4j');
  assert.match(result.description, /Apache Log4j2 JNDI features/);
  assert.ok(result.references.some(r => r.url === 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228'));
  assert.equal(result.sources.length, 3); // record + two tagged advisories
  assert.equal(result.sources[0].id, `cve:${CVE}`);
  assert.equal(result.sources[0].url, `https://cveawg.mitre.org/api/cve/${CVE}`);
  assert.match(result.sources[0].text, /"cveMetadata"/);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(calls, [
    `https://cveawg.mitre.org/api/cve/${CVE}`,
    'https://github.com/advisories/GHSA-jfh8-c2jp-5v3q',
    'https://logging.apache.org/log4j/2.x/security.html',
  ]); // exploit and mailing-list references are never fetched
  await checkSources(result.sources, { cveId: CVE, status: 'published' });
  assert.equal((await reader.lookupCve(CVE)).sources.length, 3);
  assert.equal(calls.length, 3); // cached
});

test('lookupCve maps reserved, rejected, missing and conflicting records', async () => {
  const reservedPair = lookupReader({ cveMetadata: { cveId: CVE, state: 'RESERVED' } });
  const reserved = await reservedPair.reader.lookupCve(CVE);
  assert.equal(reservedPair.calls.length, 1);
  assert.equal(reserved.status, 'reserved');
  assert.equal(reserved.sources.length, 1);
  assert.match(reserved.warnings[0], /is RESERVED: no vulnerability details/);

  const { reader: rejectReader } = lookupReader({ cveMetadata: { cveId: CVE, state: 'REJECTED' }, containers: { cna: { rejectedReasons: [{ lang: 'en', value: 'Withdrawn.' }] } } });
  const rejected = await rejectReader.lookupCve(CVE);
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.warnings[0], /is REJECTED/);
  assert.match(rejected.description, /Withdrawn\./);

  const missing = await lookupReader({ error: 'NOT_FOUND', message: 'CVE_RECORD_DNE' }).reader.lookupCve(CVE);
  assert.equal(missing.status, 'unknown');
  assert.deepEqual(missing.sources, []);
  assert.match(missing.warnings[0], /No CVE record exists for CVE-2021-44228/);

  const conflictPair = lookupReader({ cveMetadata: { cveId: 'CVE-2020-1234', state: 'PUBLISHED' } });
  const conflicting = await conflictPair.reader.lookupCve(CVE);
  assert.equal(conflicting.status, 'unknown');
  assert.deepEqual(conflicting.sources, []);
  assert.match(conflicting.warnings[0], /Conflicting record: CVE\.org returned CVE-2020-1234/);
  assert.equal(conflictPair.calls.length, 1);
  const invalidPair = lookupReader(cveRecord);
  const invalid = await invalidPair.reader.lookupCve('log4shell');
  assert.equal(invalidPair.calls.length, 0);
  assert.equal(invalid.status, 'unknown');
  assert.deepEqual(invalid.sources, []);
  assert.match(invalid.warnings[0], /is not a CVE identifier/);
});

test('advisory selection is conservative: tagged or known hosts only, exploits and lists excluded', () => {
  const chosen = selectAdvisories([
    { url: 'https://example.com/random', tags: [] },
    { url: 'https://example.com/poc', tags: ['exploit'] },
    { url: 'https://example.com/list', tags: ['mailing-list'] },
    { url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228', tags: [] },
    { url: 'https://vendor.example/patch', tags: ['patch'] },
    { url: 'https://other.example/adv', tags: ['third-party-advisory'] },
    { url: 'https://vendor.example/notes', tags: ['release-notes'] },
    { url: 'javascript:alert(1)', tags: ['vendor-advisory'] },
  ]).map(r => r.url);
  assert.deepEqual(chosen, ['https://vendor.example/patch', 'https://vendor.example/notes']);
});

test('sourcesFromDocuments produces canonical uploaded sources preserving warnings', async () => {
  const sources = await sourcesFromDocuments([
    { id: 'x:3:abc', name: 'poc.py', kind: 'text', size: 3, text: 'import jndi\nrun', warnings: [] },
    { id: 'y:4:def', name: 'advisory.md', kind: 'text', size: 4, text: 'Title\r\n\r\nBody', warnings: ['Partial extraction: stopped at 100,000 characters.'] },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, '');
  assert.equal(sources[0].text, 'import jndi\nrun');
  assert.equal(sources[0].totalLines, 2);
  assert.equal(sources[0].partial, false);
  assert.equal(sources[0].hash, await sha256Hex('import jndi\nrun'));
  assert.equal(sources[1].text, 'Title\n\nBody');
  assert.equal(sources[1].partial, true);
  assert.deepEqual(sources[1].warnings, ['Partial extraction: stopped at 100,000 characters.']);
  await checkSources(sources);
  await assert.rejects(sourcesFromDocuments(Array.from({ length: SECURITY_SOURCE_LIMIT + 1 }, () => ({ name: 'a', text: 'x' }))), /at most 20 sources/);
  await assert.rejects(sourcesFromDocuments('nope'), /array of imported documents/);
});

const bigSource = (id = 's') => ({
  id, name: 'file.txt', url: '', retrievedAt: FETCHED, hash: '0'.repeat(64),
  text: Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n'),
  startLine: 1, totalLines: 600, partial: false, warnings: [],
});

test('readSecuritySource returns coverage and clips to retained lines and read caps', () => {
  const sources = [bigSource()];
  const exact = readSecuritySource(sources, { sourceId: 's', startLine: 10, endLine: 12 });
  assert.equal(exact.text, 'line 10\nline 11\nline 12');
  assert.deepEqual(exact.warnings, []);
  assert.deepEqual(exact.coverage, { startLine: 1, endLine: 600, totalLines: 600, retainedLines: 600, partial: false });
  const clipped = readSecuritySource(sources, { sourceId: 's', startLine: 599, endLine: 700 });
  assert.equal(clipped.endLine, 600);
  assert.match(clipped.warnings[0], /clipped to retained lines 599-600/);
  const span = readSecuritySource(sources, { sourceId: 's', startLine: 1, endLine: 9999 });
  assert.equal(span.endLine, 400);
  assert.match(span.warnings[0], /clipped to retained lines 1-400/);
  const beyond = readSecuritySource(sources, { sourceId: 's', startLine: 700, endLine: 800 });
  assert.equal(beyond.startLine, 600);
  assert.equal(beyond.text, 'line 600');
  const wide = [{ ...bigSource(), text: Array.from({ length: 600 }, () => 'x'.repeat(1000)).join('\n') }];
  const capped = readSecuritySource(wide, { sourceId: 's', startLine: 1, endLine: 400 });
  assert.ok(capped.text.length <= READ_SPAN_CHARS);
  assert.match(capped.warnings.join(' '), /truncated at 24,000 characters/);
  assert.throws(() => readSecuritySource(sources, { sourceId: 'ghost', startLine: 1, endLine: 1 }), /Unknown source: ghost/);
  assert.throws(() => readSecuritySource('nope', {}), /Supply the retained sources/);
});

test('one oversized source line is bounded and explicitly marked as a prefix', () => {
  const input = { ...bigSource(), text: 'x'.repeat(90000), totalLines: 1 };
  const result = readSecuritySource([input], { sourceId: 's', startLine: 1, endLine: 1 });
  assert.ok(result.text.length <= READ_SPAN_CHARS);
  assert.equal(result.partialLine, true);
  assert.equal(result.coverage.retainedLines, 1);
  assert.ok(result.warnings.length > 0);
});

test('an official response without matching CVE identity cannot establish published status', async () => {
  const { reader } = lookupReader({ cveMetadata: { state: 'PUBLISHED' }, containers: { cna: { title: 'Unattributed record' } } });
  const result = await reader.lookupCve(CVE);
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.sources, []);
  assert.ok(result.warnings.length > 0);
});
