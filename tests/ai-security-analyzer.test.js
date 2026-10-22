import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSecurity, sha256Hex, SECURITY_READ_ROUNDS, READ_SPAN_CHARS } from '../src/ai/security.js';
import { buildSecurityIllustration } from '../src/security-diagrams.js';
import { newDoc } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';

const time = '2026-10-20T00:00:00.000Z';
async function source(text = 'The parser trusts the supplied length.\nThe fix checks the buffer size.') {
  return { id: 's1', name: 'advisory.md', url: '', retrievedAt: time, hash: await sha256Hex(text), text,
    startLine: 1, totalLines: text.split('\n').length, partial: false, warnings: [] };
}
function finding(overrides = {}) {
  return { id: 'cause', kind: 'root_cause', title: 'Unchecked length', detail: 'The supplied advisory describes missing bounds validation.',
    basis: 'source', view: 'exploit', evidence: [{ sourceId: 's1', startLine: 1, endLine: 1 }], ...overrides };
}
function plan(overrides = {}) {
  return { title: 'Static parser analysis', summary: 'The advisory describes an unchecked length; reproduction is not established.',
    findings: [finding()], relationships: [], warnings: [], ...overrides };
}
const reply = value => ({ stop: 'end', text: JSON.stringify(value) });
function provider(rounds) {
  let index = 0;
  return { chat: async input => {
    const next = rounds[Math.min(index++, rounds.length - 1)];
    return typeof next === 'function' ? next(input) : next;
  } };
}

test('model metadata cannot replace retained evidence, CVE status, or board references', async () => {
  const retained = await source();
  const malicious = plan({ id: 'forged', generatedAt: '1999-01-01T00:00:00Z', cveId: 'CVE-0000-0001', status: 'published',
    sources: [{ id: 'forged', text: 'Invented proof' }], findings: [finding({ targets: ['unrelated-board-node'] })] });
  const result = await analyzeSecurity({ provider: provider([reply(malicious)]), sources: [retained], cveId: 'CVE-2025-12345', status: 'rejected' });
  assert.equal(result.cveId, 'CVE-2025-12345');
  assert.equal(result.status, 'rejected');
  assert.notEqual(result.id, 'forged');
  assert.notEqual(result.generatedAt, malicious.generatedAt);
  assert.deepEqual(result.sources, [retained]);
  assert.deepEqual(result.findings[0].targets, []);
  assert.ok(result.warnings.length > 0, 'Rejected records must retain an explicit caveat');
});

test('invalid, oversized, and unread citations never become different source-backed evidence', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `Advisory line ${i + 1}`).join('\n'));
  const variants = [
    finding({ id: 'good', evidence: [{ sourceId: 's1', startLine: 1, endLine: 2 }] }),
    finding({ id: 'past-end', evidence: [{ sourceId: 's1', startLine: 10, endLine: 999 }] }),
    finding({ id: 'unread', evidence: [{ sourceId: 's1', startLine: 450, endLine: 455 }] }),
    finding({ id: 'ghost', evidence: [{ sourceId: 'missing', startLine: 1, endLine: 1 }] }),
    finding({ id: 'fraction', evidence: [{ sourceId: 's1', startLine: 1.5, endLine: 2 }] }),
    finding({ id: 'partial', evidence: [{ sourceId: 's1', startLine: 1, endLine: 1 }, { sourceId: 'missing', startLine: 1, endLine: 1 }] }),
  ];
  const result = await analyzeSecurity({ provider: provider([reply(plan({ findings: variants }))]), sources: [retained] });
  assert.equal(result.findings[0].basis, 'source');
  assert.deepEqual(result.findings[0].evidence, variants[0].evidence);
  for (const row of result.findings.slice(1, variants.length)) assert.equal(row.basis, 'unknown');
  for (const row of result.findings.slice(1, variants.length - 1)) assert.deepEqual(row.evidence, []);
  assert.deepEqual(result.findings[variants.length - 1].evidence, [{ sourceId: 's1', startLine: 1, endLine: 1 }]);
  // Required assessment areas the model omitted become explicit, app-authored unknowns.
  assert.ok(result.findings.some(f => f.kind === 'consistency' && f.basis === 'unknown'));
});

test('targeted reads make omitted lines eligible for citations without granting other tools', async () => {
  const retained = await source(Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n'));
  let observedResults;
  const result = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: [
      { id: 'read', name: 'read_source', input: { sourceId: 's1', startLine: 450, endLine: 455 } },
      { id: 'unsafe', name: 'run_shell', input: { command: 'must not run' } },
    ] },
    input => { observedResults = input.messages.at(-1).content; return reply(plan({ findings: [finding({ evidence: [{ sourceId: 's1', startLine: 451, endLine: 452 }] })] })); },
  ]) });
  assert.equal(result.findings[0].basis, 'source');
  assert.deepEqual(result.findings[0].evidence, [{ sourceId: 's1', startLine: 451, endLine: 452 }]);
  assert.equal(observedResults[0].isError, false);
  assert.ok(observedResults[0].text.includes('451\tline 451'));
  assert.equal(observedResults[1].isError, true);
});

test('a citation spanning adjacent complete read windows retains source authority', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  const reference = { sourceId: 's1', startLine: 250, endLine: 350 };
  const result = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: [
      { id: 'a', name: 'read_source', input: { sourceId: 's1', startLine: 200, endLine: 300 } },
      { id: 'b', name: 'read_source', input: { sourceId: 's1', startLine: 301, endLine: 400 } },
    ] }, reply(plan({ findings: [finding({ evidence: [reference] })] })),
  ]) });
  assert.equal(result.findings[0].basis, 'source');
  assert.deepEqual(result.findings[0].evidence, [reference]);
});

test('incomplete or empty model output is an error, not a fabricated successful analysis', async () => {
  const retained = await source();
  for (const invalid of [{}, plan({ findings: [] }), plan({ summary: '' }), plan({ findings: [finding({ detail: '' })] })]) {
    await assert.rejects(analyzeSecurity({ sources: [retained], provider: provider([reply(invalid)]) }), /incomplete analysis|without an explanation/);
  }
});

test('a complete-looking response stopped by refusal or token limit is not saved', async () => {
  const retained = await source();
  for (const stop of ['max_tokens', 'refusal']) {
    let calls = 0;
    await assert.rejects(analyzeSecurity({ sources: [retained], provider: { chat: async () => { calls++; return { ...reply(plan()), stop }; } } }), /stopped before a complete response/);
    assert.equal(calls, 1);
  }
});

test('read output remains bounded and cannot loop or consume an unbounded provider context', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `${i}: ${'x'.repeat(97)}`).join('\n'));
  let results;
  await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: 'read_source', input: { sourceId: 's1', startLine: 1, endLine: 400 } })) },
    input => { results = input.messages.at(-1).content; return reply(plan({ findings: [finding({ basis: 'unknown', evidence: [] })] })); },
  ]) });
  assert.ok(results.some(row => row.isError));
  assert.ok(results.filter(row => !row.isError).every(row => row.text.length <= READ_SPAN_CHARS + 6000));
  let calls = 0;
  await assert.rejects(analyzeSecurity({ sources: [retained], provider: { chat: async () => { calls++; return { stop: 'tool_use', toolCalls: [{ id: `r${calls}`, name: 'read_source', input: { sourceId: 's1', startLine: 1, endLine: 1 } }] }; } } }), /did not return a valid analysis object/);
  assert.equal(calls, SECURITY_READ_ROUNDS);
});

test('clipped context lines cannot be cited until a complete targeted read delivers them', async () => {
  const retained = await source('x'.repeat(3000));
  const unobserved = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan())]) });
  assert.equal(unobserved.findings[0].basis, 'unknown');
  const observed = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: [{ id: 'r', name: 'read_source', input: { sourceId: 's1', startLine: 1, endLine: 1 } }] }, reply(plan()),
  ]) });
  assert.equal(observed.findings[0].basis, 'source');
});

test('cancelled analysis cannot return late provider results', async () => {
  const controller = new AbortController();
  await assert.rejects(analyzeSecurity({ sources: [await source()], signal: controller.signal,
    provider: { chat: async () => { controller.abort(); return reply(plan()); } } }), error => error.name === 'AbortError');
});

test('malformed retained evidence is rejected before contacting the provider', async () => {
  let calls = 0;
  await assert.rejects(analyzeSecurity({ sources: [{ id: 'bad' }], provider: { chat: async () => { calls++; return reply(plan()); } } }), /Retained sources are not valid/);
  assert.equal(calls, 0);
});

test('single-shot providers cannot obtain omitted lines through unsolicited tool calls', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  let readResult;
  const result = await analyzeSecurity({ sources: [retained], allowTools: false, provider: provider([
    { stop: 'tool_use', toolCalls: [{ id: 'r', name: 'read_source', input: { sourceId: 's1', startLine: 450, endLine: 451 } }] },
    input => { readResult = input.messages.at(-1).content[0]; return reply(plan({ findings: [finding({ evidence: [{ sourceId: 's1', startLine: 450, endLine: 451 }] })] })); },
  ]) });
  assert.equal(readResult.isError, true);
  assert.equal(result.findings[0].basis, 'unknown');
  assert.deepEqual(result.findings[0].evidence, []);
  assert.ok(result.warnings.length > 0);
});

test('a 500-line source with no tool calls records the 120 delivered lines and flags the rest unassessed', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan())]) });
  assert.deepEqual(result.readCoverage, [{ sourceId: 's1', ranges: [{ startLine: 1, endLine: 120 }] }]);
  assert.ok(result.warnings.some(w => w.includes('121-500') && w.includes('not delivered')), 'undelivered retained lines must be disclosed');
});

test('tool reads merge into canonical coverage; disjoint reads stay separate', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  const result = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: [
      { id: 'a', name: 'read_source', input: { sourceId: 's1', startLine: 121, endLine: 200 } },
      { id: 'b', name: 'read_source', input: { sourceId: 's1', startLine: 201, endLine: 250 } },
      { id: 'c', name: 'read_source', input: { sourceId: 's1', startLine: 400, endLine: 410 } },
    ] },
    reply(plan({ findings: [finding({ basis: 'unknown', evidence: [] })] })),
  ]) });
  assert.deepEqual(result.readCoverage, [{ sourceId: 's1', ranges: [{ startLine: 1, endLine: 250 }, { startLine: 400, endLine: 410 }] }]);
});

test('clipped prefix reads never count as delivered coverage', async () => {
  const retained = await source(`line 1\n${'x'.repeat(READ_SPAN_CHARS + 100)}`);
  const result = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: [{ id: 'a', name: 'read_source', input: { sourceId: 's1', startLine: 2, endLine: 2 } }] },
    reply(plan({ findings: [finding({ basis: 'unknown', evidence: [] })] })),
  ]) });
  assert.deepEqual(result.readCoverage, [{ sourceId: 's1', ranges: [{ startLine: 1, endLine: 1 }] }]);
});

test('model-supplied readCoverage is ignored; coverage reflects this run only', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
  const spoof = plan({ readCoverage: [{ sourceId: 's1', ranges: [{ startLine: 1, endLine: 500 }] }] });
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(spoof)]) });
  assert.deepEqual(result.readCoverage, [{ sourceId: 's1', ranges: [{ startLine: 1, endLine: 120 }] }]);
});

test('coverage range cap is enforced at read time; over-cap reads are declined, not silently dropped', async () => {
  const retained = await source(Array.from({ length: 4000 }, (_, i) => `line ${i + 1}`).join('\n'));
  const reads = Array.from({ length: 1100 }, (_, n) => ({ id: `r${n}`, name: 'read_source', input: { sourceId: 's1', startLine: 130 + n * 2, endLine: 130 + n * 2 } }));
  let results;
  const result = await analyzeSecurity({ sources: [retained], provider: provider([
    { stop: 'tool_use', toolCalls: reads },
    input => { results = input.messages.at(-1).content; return reply(plan({ findings: [finding({ basis: 'unknown', evidence: [] })] })); },
  ]) });
  assert.equal(result.readCoverage[0].ranges.length, 1000);
  assert.ok(results.some(row => row.isError && row.text.includes('read coverage limit')), 'over-cap reads must be declined explicitly');
});

test('omitted assessment areas become explicit not-assessed outcomes, not invented conclusions', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan())]) });
  const kinds = new Set(result.findings.map(f => f.kind));
  for (const kind of ['affected', 'root_cause', 'prerequisite', 'step', 'impact', 'severity', 'mitigation', 'unknown', 'consistency']) {
    assert.ok(kinds.has(kind), `${kind} must have an explicit outcome`);
  }
  const consistency = result.findings.find(f => f.kind === 'consistency');
  assert.equal(consistency.basis, 'unknown');
});

test('severity cannot be inferred; only retained-source severity or explicit unknown', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ findings: [finding({ id: 'sev', kind: 'severity', basis: 'inference', evidence: [] })] }))]) });
  const severity = result.findings.find(f => f.id === 'sev');
  assert.equal(severity.basis, 'unknown');
});

test('boundaryRelation is accepted only with exactly one boundary endpoint', async () => {
  const retained = await source();
  const valid = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding({ id: 'comp', kind: 'component' }), finding({ id: 'trust', kind: 'boundary', basis: 'unknown', evidence: [] })],
    relationships: [{ id: 'r1', from: 'comp', to: 'trust', label: 'inside trust', basis: 'unknown', view: 'architecture', boundaryRelation: 'inside', evidence: [] }],
  }))]) });
  assert.equal(valid.relationships[0].boundaryRelation, 'inside');

  const noBoundary = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding({ id: 'a', kind: 'component' }), finding({ id: 'b', kind: 'component' })],
    relationships: [{ id: 'r2', from: 'a', to: 'b', label: 'x', basis: 'unknown', view: 'architecture', boundaryRelation: 'inside', evidence: [] }],
  }))]) });
  assert.equal(noBoundary.relationships[0].boundaryRelation, 'none');

  const badValue = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding({ id: 'c', kind: 'component' }), finding({ id: 'd', kind: 'boundary', basis: 'unknown', evidence: [] })],
    relationships: [{ id: 'r3', from: 'c', to: 'd', label: 'y', basis: 'unknown', view: 'architecture', boundaryRelation: 'diagonal', evidence: [] }],
  }))]) });
  assert.equal(badValue.relationships[0].boundaryRelation, 'none');
});

test('finding limit preserves the only assessment of a required area at the tail', async () => {
  const retained = await source('The parser trusts the supplied length.\nThe fix checks the buffer size.\nSeverity: High.');
  const findings = Array.from({ length: 99 }, (_, i) => finding({ id: `affected-${i}`, kind: 'affected' }));
  findings.push(finding({ id: 'severity-tail', kind: 'severity', title: 'Advisory severity', detail: 'The advisory labels the severity High.',
    evidence: [{ sourceId: 's1', startLine: 3, endLine: 3 }] }));
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ findings }))]) });
  assert.ok(result.findings.length <= 100);
  for (const kind of ['affected', 'root_cause', 'prerequisite', 'step', 'impact', 'severity', 'mitigation', 'unknown', 'consistency']) {
    assert.ok(result.findings.some(f => f.kind === kind), `${kind} must survive or be explicitly unassessed`);
  }
  assert.equal(result.findings.find(f => f.kind === 'severity').basis, 'source');
});

test('model warning floods cannot hide application finding-omission disclosures', async () => {
  const retained = await source(Array.from({ length: 500 }, (_, i) => `Advisory line ${i + 1}`).join('\n'));
  const sources = Array.from({ length: 20 }, (_, i) => ({ ...retained, id: i ? `source-${i}` : 's1', name: `advisory-${i}.md` }));
  const findings = Array.from({ length: 100 }, (_, i) => finding({ id: `cause-${i}` }));
  const modelWarnings = Array.from({ length: 30 }, (_, i) => `Model warning ${i}`);
  const result = await analyzeSecurity({ sources, allowTools: false, provider: provider([reply(plan({ findings, warnings: modelWarnings }))]) });
  const omitted = findings.length - result.findings.filter(f => f.kind === 'root_cause').length;
  assert.ok(omitted > 0);
  const applicationWarnings = result.warnings.filter(warning => !modelWarnings.includes(warning));
  assert.ok(applicationWarnings.some(warning => warning.includes(String(omitted)) && /findings/.test(warning)));
  assert.ok(result.warnings.length <= 50);
});

test('reserved and rejected records keep applicability and attack relations unknown without losing record facts', async () => {
  for (const status of ['reserved', 'rejected']) {
    const retained = await source(`Record state: ${status.toUpperCase()}.\nAssociated material does not establish applicability to this identifier.`);
    const result = await analyzeSecurity({ sources: [retained], cveId: 'CVE-2026-99006', status,
      provider: provider([reply(plan({
        findings: [finding({ id: 'affected', kind: 'affected', view: 'architecture' }),
          finding({ id: 'cause', kind: 'root_cause' }), finding({ id: 'state', kind: 'consistency', view: 'none' })],
        relationships: [{ id: 'claims-cause', from: 'affected', to: 'cause', label: 'contains', basis: 'source', view: 'exploit',
          evidence: [{ sourceId: 's1', startLine: 1, endLine: 1 }] }],
      }))]) });
    for (const kind of ['affected', 'root_cause']) {
      const area = result.findings.find(f => f.kind === kind);
      assert.equal(area.basis, 'unknown');
      assert.equal(area.view, 'none');
      assert.deepEqual(area.evidence, [{ sourceId: 's1', startLine: 1, endLine: 1 }]);
    }
    assert.equal(result.findings.find(f => f.id === 'state').basis, 'source');
    assert.equal(result.relationships[0].basis, 'unknown');
  }
});

test('CVE-relevant advisory excerpts retain absolute citations without legitimizing skipped lines', async () => {
  const text = Array.from({ length: 500 }, (_, index) => index === 299
    ? 'CVE-2026-31431: this advisory attributes an impact to its affected product.'
    : `Source line ${index + 1}`).join('\n');
  const retained = await source(text);
  const result = await analyzeSecurity({
    cveId: 'CVE-2026-31431', status: 'published', sources: [retained], allowTools: false,
    provider: provider([reply(plan({ findings: [
      finding({ id: 'focused', evidence: [{ sourceId: 's1', startLine: 300, endLine: 300 }] }),
      finding({ id: 'skipped', evidence: [{ sourceId: 's1', startLine: 200, endLine: 200 }] }),
      finding({ id: 'crosses-gap', evidence: [{ sourceId: 's1', startLine: 190, endLine: 300 }] }),
    ] }))]),
  });
  assert.equal(result.findings.find(item => item.id === 'focused').basis, 'source');
  assert.deepEqual(result.findings.find(item => item.id === 'focused').evidence,
    [{ sourceId: 's1', startLine: 300, endLine: 300 }]);
  assert.equal(result.findings.find(item => item.id === 'skipped').basis, 'unknown');
  assert.equal(result.findings.find(item => item.id === 'crosses-gap').basis, 'unknown');
  assert.deepEqual(result.sources, [retained], 'selection does not alter retained text or its identity');
});

test('the final admitted CVE window includes its matching line when the context budget is nearly full', async () => {
  const matches = [100, 250, 450];
  const retained = await source(Array.from({ length: 500 }, (_, index) => matches.includes(index + 1)
    ? `CVE-2026-31431: attributed statement at line ${index + 1}.`
    : `Background line ${index + 1}`).join('\n'));
  const result = await analyzeSecurity({
    cveId: 'CVE-2026-31431', status: 'published', sources: [retained], allowTools: false,
    provider: provider([reply(plan({ findings: matches.map(line => finding({
      id: `claim-${line}`, evidence: [{ sourceId: 's1', startLine: line, endLine: line }],
    })) }))]),
  });
  for (const line of matches) {
    assert.equal(result.findings.find(item => item.id === `claim-${line}`).basis, 'source');
  }
});

test('model asset hints survive only on established findings and never leak into app-authored unknowns', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ findings: [
    finding({ id: 'cited', assetKind: 'linux' }),
    finding({ id: 'inferred', kind: 'component', view: 'architecture', basis: 'inference', evidence: [], assetKind: 'firewall' }),
    finding({ id: 'unclear', basis: 'unknown', evidence: [], assetKind: 'linux' }),
    finding({ id: 'invented', assetKind: 'quantum-router' }),
  ] }))]) });
  assert.equal(result.findings.find(f => f.id === 'cited').assetKind, 'linux');
  assert.equal(result.findings.find(f => f.id === 'inferred').assetKind, 'firewall',
    'an explicit inferred asset persists with its visible inference basis');
  assert.equal(result.findings.find(f => f.id === 'unclear').assetKind, undefined);
  assert.equal(result.findings.find(f => f.id === 'invented').assetKind, undefined);
  const warnings = result.warnings.join('\n');
  assert.match(warnings, /unsupported assetKind "quantum-router"; omitted/);
  assert.match(warnings, /asset "linux" was dropped/);
  for (const row of result.findings.filter(f => f.id.startsWith('not-assessed'))) {
    assert.equal(row.assetKind, undefined, 'not-assessed outcomes stay without asset hints');
  }
});

test('a citation downgrade drops the claimed asset rather than keeping an unsupported one', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding({ id: 'overrun', assetKind: 'linux', evidence: [{ sourceId: 's1', startLine: 1, endLine: 999 }] })],
  }))]) });
  const row = result.findings.find(f => f.id === 'overrun');
  assert.equal(row.basis, 'unknown');
  assert.equal(row.assetKind, undefined);
  assert.match(result.warnings.join('\n'), /asset "linux" was dropped/);
});

test('reserved and rejected records never gain speculative concrete assets', async () => {
  for (const status of ['reserved', 'rejected']) {
    const retained = await source(`Record state: ${status.toUpperCase()}.\nAssociated material does not establish applicability to this identifier.`);
    const result = await analyzeSecurity({ sources: [retained], cveId: 'CVE-2026-99007', status,
      provider: provider([reply(plan({ findings: [
        finding({ id: 'affected', kind: 'affected', view: 'architecture', assetKind: 'webserver' }),
        finding({ id: 'state', kind: 'consistency', view: 'none' }),
      ] }))]) });
    const affected = result.findings.find(f => f.id === 'affected');
    assert.equal(affected.basis, 'unknown');
    assert.equal(affected.assetKind, undefined);
    assert.match(result.warnings.join('\n'), /asset "webserver" was dropped/);
    assert.equal(result.findings.find(f => f.id === 'state').basis, 'source');
  }
});

function scene(overrides = {}) {
  return { id: 'layout', title: 'Buffer layout', kind: 'memory', detail: 'Schematic reading of the retained lines.',
    panels: [{ id: 'cells', title: 'Declared storage', items: [
      { id: 'len', label: 'Supplied length', value: 'attacker-chosen', role: 'input', findingIds: ['cause'] },
      { id: 'buf', label: 'Fixed buffer', value: '', role: 'storage', findingIds: ['cause'] },
    ] }],
    links: [{ from: 'len', to: 'buf', label: 'overwrites when unchecked', findingIds: ['cause'] }], ...overrides };
}

test('valid explanation plans survive analysis while omitted explanations stay absent', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ explanations: [scene()] }))]) });
  assert.deepEqual(result.explanations, [{
    id: 'layout', title: 'Buffer layout', kind: 'memory', detail: 'Schematic reading of the retained lines.',
    panels: [{ id: 'cells', title: 'Declared storage', items: [
      { id: 'len', label: 'Supplied length', value: 'attacker-chosen', role: 'input', findingIds: ['cause'] },
      { id: 'buf', label: 'Fixed buffer', value: '', role: 'storage', findingIds: ['cause'] },
    ] }],
    links: [{ from: 'len', to: 'buf', label: 'overwrites when unchecked', findingIds: ['cause'] }],
  }]);
  const without = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan())]) });
  assert.equal(without.explanations, undefined, 'model-omitted explanations are not fabricated');
});

test('malformed scenes are dropped whole without changing independent valid scenes', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ explanations: [
    scene({ id: 'valid' }),
    scene({ id: 'ghost-item', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'len', label: 'Supplied length', value: '', role: 'input', findingIds: ['ghost'] }] }] }),
    scene({ id: 'dangling-link', links: [{ from: 'len', to: 'absent', label: 'flows into', findingIds: ['cause'] }] }),
    scene({ id: 'bad-kind', kind: 'layout' }),
    scene({ id: 'bad-role', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'len', label: 'Length', value: '', role: 'widget', findingIds: ['cause'] }] }] }),
  ] }))]) });
  assert.deepEqual(result.explanations.map(scene => scene.id), ['valid']);
});

test('duplicate model item ids never silently re-link a scene', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({ explanations: [scene({
    id: 'dup', links: [{ from: 'cell', to: 'len', label: 'flows into', findingIds: ['cause'] }],
    panels: [{ id: 'p', title: 'P', items: [
      { id: 'cell', label: 'First cell', value: '', role: 'storage', findingIds: ['cause'] },
      { id: 'cell', label: 'Second cell', value: '', role: 'storage', findingIds: ['cause'] },
      { id: 'len', label: 'Supplied length', value: '', role: 'input', findingIds: ['cause'] },
    ] }],
  })] }))]) });
  assert.equal(result.explanations, undefined, 'an ambiguous scene cannot preserve the narrative grounding');
});

test('over-limit scenes are dropped whole rather than keeping a partially grounded narrative', async () => {
  const retained = await source();
  const pairs = [];
  for (let a = 0; a < 8 && pairs.length < 25; a++) for (let b = a + 1; b < 8 && pairs.length < 25; b++) pairs.push([`i-${a}`, `i-${b}`]);
  const wide = scene({ id: 'wide', links: pairs.map(([from, to], n) => ({ from, to, label: `Link ${n}`, findingIds: ['cause'] })),
    panels: [{ id: 'p', title: 'P', items: Array.from({ length: 9 }, (_, n) => ({ id: `i-${n}`, label: `Item ${n}`, value: '', role: 'neutral', findingIds: ['cause'] })) }] });
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    explanations: [wide, ...Array.from({ length: 7 }, (_, i) => scene({ id: `scene-${i + 1}` }))],
  }))]) });
  assert.equal(result.explanations.length, 5);
  assert.equal(result.explanations.some(scene => scene.id === 'wide'), false);
  assert.equal(result.explanations.every(scene => scene.panels[0].items.length === 2), true);
});

test('reserved records keep scenes only through downgraded findings, never confident grounds', async () => {
  const retained = await source('Record state: RESERVED.\nAssociated material does not establish applicability to this identifier.');
  const result = await analyzeSecurity({ sources: [retained], cveId: 'CVE-2026-99008', status: 'reserved',
    provider: provider([reply(plan({ explanations: [scene()] }))]) });
  assert.equal(result.explanations.length, 1);
  const grounding = new Set(result.explanations.flatMap(e => [
    ...e.panels.flatMap(p => p.items.flatMap(i => i.findingIds)), ...e.links.flatMap(l => l.findingIds)]));
  assert.ok(grounding.size > 0);
  for (const id of grounding) {
    assert.equal(result.findings.find(f => f.id === id).basis, 'unknown',
      'the scene can only be grounded in findings whose applicability was downgraded');
  }
});

test('partial, pruned or ambiguous finding grounding drops the element instead of strengthening it', async () => {
  const retained = await source();
  // Partial grounding: one valid ref beside one unknown ref must not survive
  // as a lone (and now source-backed) ref.
  const partial = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    explanations: [scene({ id: 'partial', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'len', label: 'Supplied length', value: '', role: 'input', findingIds: ['cause', 'ghost'] },
      { id: 'buf', label: 'Fixed buffer', value: '', role: 'storage', findingIds: ['cause'] },
    ] }] })],
  }))]) });
  assert.equal(partial.explanations, undefined, 'the unchanged scene narrative must not survive loss of its uncertain dependency');

  // A finding pruned by the 100-finding cap, referenced beside a surviving
  // one, is equally fatal to the element.
  const pruned = await analyzeSecurity({ sources: [retained], allowTools: false, provider: provider([reply(plan({
    findings: [...Array.from({ length: 100 }, (_, i) => finding({ id: `cause-${i}` })), finding({ id: 'pruned-tail' })],
    explanations: [scene({ id: 'pruned', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'len', label: 'Supplied length', value: '', role: 'input', findingIds: ['cause-0', 'pruned-tail'] },
    ] }] })],
  }))]) });
  assert.equal(pruned.explanations, undefined, 'the scene cannot keep its lone item on partial grounding');
  assert.match(pruned.warnings.join('\n'), /finding "pruned-tail" did not survive validation/);

  // Duplicate model finding ids: a ref to the shared id must not attach to
  // whichever duplicate kept the id after renaming.
  const duplicated = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding(), finding({ id: 'cause', kind: 'impact', title: 'Same id, second claim', view: 'exploit' }),
      finding({ id: 'anchor', kind: 'impact', view: 'exploit' })],
    explanations: [scene({ id: 'dupes', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'len', label: 'Supplied length', value: '', role: 'input', findingIds: ['cause'] },
      { id: 'buf', label: 'Fixed buffer', value: '', role: 'storage', findingIds: ['anchor'] },
    ] }] })],
  }))]) });
  assert.equal(duplicated.explanations, undefined, 'the unchanged scene narrative cannot resolve ambiguous grounding');
});

test('scene item asset hints survive only on exact same-asset non-unknown grounding', async () => {
  const retained = await source();
  const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [
      finding({ id: 'host', kind: 'component', view: 'architecture', assetKind: 'webserver' }),
      finding({ id: 'plain', kind: 'component', view: 'architecture' }),
      finding({ id: 'downgraded', kind: 'component', view: 'architecture', assetKind: 'webserver',
        evidence: [{ sourceId: 's1', startLine: 1, endLine: 999 }] }),
    ],
    explanations: [scene({ id: 'assets', links: [], panels: [{ id: 'p', title: 'P', items: [
      { id: 'drawn', label: 'Described host', value: '', role: 'neutral', assetKind: 'webserver', findingIds: ['host'] },
      { id: 'no-match', label: 'Plain component', value: '', role: 'neutral', assetKind: 'webserver', findingIds: ['plain'] },
      { id: 'mixed', label: 'Mixed grounding', value: '', role: 'neutral', assetKind: 'webserver', findingIds: ['host', 'downgraded'] },
      { id: 'invented', label: 'Invented asset', value: '', role: 'neutral', assetKind: 'quantum-router', findingIds: ['host'] },
    ] }] })],
  }))]) });
  const items = result.explanations[0].panels[0].items;
  assert.equal(items.length, 4, 'asset-only omissions never drop items or poison the scene narrative');
  assert.equal(items.find(i => i.id === 'drawn').assetKind, 'webserver',
    'the same assetKind on the grounding finding and the scene item rides through');
  assert.equal(items.find(i => i.id === 'no-match').assetKind, undefined,
    'a hint no referenced finding carries is omitted, not adopted');
  assert.equal(items.find(i => i.id === 'mixed').assetKind, undefined,
    'an unknown-basis reference omits the hint; a finding downgrade never upgrades evidence');
  assert.equal(items.find(i => i.id === 'invented').assetKind, undefined);
  const warnings = result.warnings.join('\n');
  assert.match(warnings, /unsupported assetKind "quantum-router" was omitted/);
  assert.match(warnings, /asset "webserver" was omitted/);
});

test('actor hint completion never resurrects a rejected hint or promotes uncertain grounding', async () => {
  for (const variation of ['omitted', 'null', 'unsupported', 'incompatible', 'unknown', 'ambiguous', 'other-panel']) {
    const retained = await source('An external attacker and an insider send input.');
    const actor = finding({ id: 'actor', kind: 'component', view: 'architecture', assetKind: 'attacker' });
    if (variation === 'unknown') { actor.basis = 'unknown'; actor.evidence = []; }
    const cell = { id: 'actor-cell', label: 'External actor', value: '', role: 'input', findingIds: ['actor'] };
    if (variation === 'null') cell.assetKind = null;
    if (variation === 'unsupported') cell.assetKind = 'invented-actor';
    if (variation === 'incompatible') cell.assetKind = 'insider';
    const findings = [actor];
    if (variation === 'ambiguous') {
      findings.push(finding({ id: 'insider', kind: 'component', assetKind: 'insider' }));
      cell.findingIds.push('insider');
    }
    const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
      findings, explanations: [scene({ kind: 'attack', links: [], panels: [{
        id: 'actor-panel', title: 'Actor', placement: variation === 'other-panel' ? 'target' : 'actor', items: [cell],
      }] })],
    }))]) });
    const doc = newDoc();
    buildSecurityIllustration(doc, result);
    const rendered = doc.nodes.find(node => node.label.startsWith('External actor ['));
    assert.equal(rendered.kind, variation === 'omitted' ? 'attacker' : 'custom', variation);
    const saved = deserialize(serialize(doc)).doc.securityAnalysis.explanations[0].panels[0].items[0];
    assert.equal(saved.assetKind, variation === 'omitted' ? 'attacker' : undefined, variation);
  }
});

test('attack and parallel compositions keep placements and rows or drop the scene whole', async () => {
  const retained = await source();
  const attack = { id: 'attack-scene', title: 'Oversized request against the host', kind: 'attack',
    detail: 'Semantic composition of the referenced findings.',
    panels: [
      { id: 'a-actor', title: 'Requester', placement: 'actor', items: [
        { id: 'a-who', label: 'Requesting client', value: 'sends the length', role: 'input', findingIds: ['cause'] }] },
      { id: 'a-exchange', title: 'Request', placement: 'exchange', items: [
        { id: 'a-req', label: 'Oversized length', value: '', role: 'input', findingIds: ['cause'] }] },
      { id: 'a-target', title: 'Parser host', placement: 'target', items: [
        { id: 'a-host', label: 'Parser buffer', value: '', role: 'storage', row: 0, assetKind: 'webserver', findingIds: ['cause'] }] },
    ],
    links: [{ from: 'a-req', to: 'a-host', label: 'overflows when unchecked', findingIds: ['cause'] }] };
  const parallel = { id: 'parallel-scene', title: 'Same mechanism across deployments', kind: 'parallel',
    detail: 'One row per described deployment.',
    panels: [
      { id: 'p-actor', title: 'Shared requester', placement: 'actor', items: [
        { id: 'p-who', label: 'Requesting client', value: '', role: 'input', findingIds: ['cause'] }] },
      { id: 'p-targets', title: 'Affected deployments', placement: 'target', items: [
        { id: 'p-t0', label: 'Deployment A', value: '', role: 'storage', row: 0, findingIds: ['cause'] },
        { id: 'p-t1', label: 'Deployment B', value: '', role: 'storage', row: 7, findingIds: ['cause'] }] },
      { id: 'p-outcomes', title: 'Conditional outcomes', placement: 'outcome', items: [
        { id: 'p-o1', label: 'Parser failure', value: '', role: 'result', row: 1, findingIds: ['cause'] }] },
    ],
    links: [] };
  const kept = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
    findings: [finding({ assetKind: 'webserver' })], explanations: [attack, parallel] }))]) });
  assert.deepEqual(kept.explanations, [attack, parallel],
    'fully supported placements, rows and grounded item assets persist without any rewriting');

  const withRow = value => ({ ...parallel, panels: parallel.panels.map((panel, i) => i === 1
    ? { ...panel, items: panel.items.map((item, n) => n === 0 ? { ...item, row: value } : item) } : panel) });
  const broken = [
    [{ ...attack, id: 'no-placement', panels: attack.panels.map(({ placement, ...panel }) => panel) }, /place every panel/],
    [{ ...attack, id: 'bad-placement', panels: attack.panels.map((panel, i) => i === 1 ? { ...panel, placement: 'network' } : panel) }, /placement "network"/],
    [{ ...parallel, id: 'no-row', panels: parallel.panels.map((panel, i) => i === 1
      ? { ...panel, items: panel.items.map((item, n) => n === 0 ? (({ row, ...rest }) => rest)(item) : item) } : panel) }, /non-actor items of parallel scenes need an explicit row/],
    [{ ...withRow(8), id: 'row-high' }, /row must be an integer 0-7/],
    [{ ...withRow(1.5), id: 'row-fraction' }, /row must be an integer 0-7/],
    [{ ...withRow('2'), id: 'row-text' }, /row must be an integer 0-7/],
  ];
  for (const [variant, pattern] of broken) {
    const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
      findings: [finding({ assetKind: 'webserver' })], explanations: [scene({ id: 'valid' }), variant] }))]) });
    assert.deepEqual(result.explanations.map(s => s.id), ['valid'],
      'an incompletely composed scene drops whole instead of saving a partial layout');
    assert.match(result.warnings.join('\n'), pattern);
  }
});

test('malformed link collections cannot discard an uncertain narrative dependency', async () => {
  const retained = await source();
  for (const links of [undefined, null, 'not a collection',
    { from: 'len', to: 'buf', label: 'may permit an unestablished outcome', findingIds: ['uncertain'] }]) {
    const result = await analyzeSecurity({ sources: [retained], provider: provider([reply(plan({
      findings: [finding(), finding({ id: 'uncertain', kind: 'unknown', basis: 'unknown', view: 'none', evidence: [] })],
      explanations: [scene({ id: 'valid-empty-links', links: [] }),
        scene({ id: 'malformed', detail: 'The uncertain link is essential to this scene.', links })],
    }))]) });
    assert.deepEqual(result.explanations.map(scene => scene.id), ['valid-empty-links']);
    assert.equal(result.findings.find(finding => finding.id === 'uncertain').basis, 'unknown');
  }
});

