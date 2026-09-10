import test from 'node:test';
import assert from 'node:assert/strict';
import { newDoc } from '../src/state.js';
import { rdkGuide, safeSources, referenceText } from '../src/rdk/guide.js';
import { rdkDetails, targetOptions } from '../src/ui/rdk-details.js';
import { initI18n, setLang } from '../src/i18n.js';
import { EXAMPLES } from '../src/examples.js';
const node = (id, kind, sublabel, fields) => ({
  id,
  kind,
  sublabel,
  fields,
  label: id,
  rail: '',
  notes: '',
  x: 0,
  y: 0,
});
const sample = () => ({
  ...newDoc('RDK design'),
  nodes: [
    node('host', 'aisbc', 'RDK X5'),
    node('camera', 'depthcam', 'GS130W'),
    node('stage', 'rdksoftware', 'hobot_render', {
      package: 'hobot_dnn',
      target: 'host',
    }),
  ],
  wires: [
    {
      id: 'w1',
      bus: 'mipi',
      from: { node: 'camera', port: 'csi' },
      to: { node: 'host', port: 'csi1' },
    },
  ],
});
test('document-only guide includes BOM, endpoints, checks, software mapping and sources', () => {
  const g = rdkGuide(sample()).replace(/&#(\d+);/g, (_, n) =>
    String.fromCharCode(Number(n)),
  );
  for (const re of [
    /RDK X5/,
    /camera.csi/,
    /host.csi1/,
    /rdk-stereo-links/,
    /hobot_dnn/,
    /target: host/,
    /Runtime: not selected/,
    /https:\/\/d-robotics/,
    /5V/,
  ])
    assert.match(g, re);
  assert.doesNotMatch(g, /```|sudo |apt install|hardware tested/i);
  assert.equal(rdkGuide(newDoc()), '');
});
test('hostile text cannot introduce markdown blocks or HTML; stale target visible', () => {
  const d = sample();
  d.title = '<script>\n# [bad](javascript:x) `x`';
  d.nodes[0].label = d.title;
  d.nodes[2].fields.target = 'deleted<board>';
  const g = rdkGuide(d);
  assert.doesNotMatch(g, /<script>|\n# \[bad\]|`x`/);
  assert.match(g, /missing/);
  const h = rdkDetails(d.nodes[0], d);
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /rel="noopener noreferrer"/);
  assert.match(targetOptions(d.nodes[2], d), /Missing.*deleted&lt;board&gt;/);
});
test('unknown connector profile and authoritative package remain explicit', () => {
  const d = sample();
  d.nodes[0].sublabel = 'RDK S100';
  d.nodes[2].fields.package = 'unknown';
  assert.match(rdkDetails(d.nodes[0], d), /unverified/);
  assert.match(rdkDetails(d.nodes[2], d), /unverified/);
  assert.doesNotMatch(rdkDetails(d.nodes[2], d), /Web\/HDMI/);
});

test('a BOM line without a part number names the part, not the kind id', () => {
  initI18n({ storage: null });
  const d = sample();
  d.nodes.push(node('psu', 'jack', ''), node('link', 'custom', ''));
  const g = rdkGuide(d).replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  assert.match(g, /- psu \(psu\): Power jack/);
  assert.match(g, /- link \(link\): Custom box/);
  assert.doesNotMatch(g, /\(psu\): jack/);
  setLang('zh');
  try {
    const zh = rdkGuide(d).replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
    assert.match(zh, /- psu \(psu\): 电源插座/);
  } finally {
    setLang('en');
  }
});

test('source links allow HTTPS only and escape hostile source labels', () => {
  assert.deepEqual(
    safeSources({
      sources: [
        { url: 'javascript:alert(1)' },
        { url: 'http://example.com' },
        { url: 'not a URL' },
        { url: 'https://user:pass@example.com' },
        { url: 'https://example.com' },
      ],
    }),
    [{ url: 'https://example.com' }],
  );
});

test('perception guide exports every current check and escaped assumptions with preparation steps', async () => {
  const { RDK_EXAMPLES } = await import('../src/rdk/examples.js');
  const { checkDoc } = await import('../src/drc.js');
  const { markdownText } = await import('../src/rdk/guide.js');
  const doc = structuredClone(
    RDK_EXAMPLES.find((e) => e.id === 'rdk-perception').doc,
  );
  doc.nodes[0].notes =
    'component assumption <script>\n# [link](javascript:x) `test`';
  doc.notes.push({
    id: 'hostile',
    text: 'diagram assumption <script>\n# [link](javascript:x) `test`',
  });
  const guide = rdkGuide(doc);
  for (const finding of checkDoc(doc))
    assert.ok(guide.includes(markdownText(finding.message)), finding.message);
  assert.match(guide, /battery return/);
  assert.ok(guide.includes(markdownText(doc.nodes[0].notes)));
  assert.ok(guide.includes(markdownText(doc.notes.at(-1).text)));
  assert.doesNotMatch(guide, /<script>|\n# \[link\]|`test`/);
  for (const term of [
    'Preparation checklist',
    'hardware revision',
    'carrier',
    'cables',
    'power',
    'runtime',
    'validation record',
  ])
    assert.ok(guide.includes(term), term);
});
test('board properties show only documented peripheral relationships and conditional requirements', () => {
  const doc = sample();
  const x5 = rdkDetails(doc.nodes[0], doc);
  assert.match(x5, /Documented peripherals/);
  assert.match(x5, /GS130W/);
  assert.match(x5, /GS130WI/);
  assert.doesNotMatch(x5, /IMX219|RS800W/);
  for (const sublabel of ['RDK S100', 'RDK S100P']) {
    doc.nodes[0].sublabel = sublabel;
    const detail = rdkDetails(doc.nodes[0], doc);
    assert.match(detail, /GS130WI/);
    assert.match(detail, /Camera expansion board/);
    assert.match(detail, /unverified/);
  }
  doc.nodes[0].sublabel = 'RDK X3';
  assert.doesNotMatch(
    rdkDetails(doc.nodes[0], doc),
    /Documented peripherals:.*GS130W/,
  );
});

test('the setup guide headings follow the interface language while ids and URLs stay', () => {
  initI18n({ storage: null });
  const rover = EXAMPLES.find((e) => e.id === 'rdk-rover').doc;
  setLang('zh');
  try {
    const md = rdkGuide(rover);
    assert.match(md, /^# RDK 搭建指南：/m);
    assert.match(md, /^## 物料清单$/m);
    assert.match(md, /^## 准备清单$/m);
    assert.match(md, /- n3\.csi1 → n5\.csi \(mipi\)/, 'connection lines are ids');
    assert.match(md, /https:\/\/d-robotics\.github\.io\//);
  } finally {
    setLang('en');
  }
  assert.match(rdkGuide(rover), /^## Bill of materials$/m);
});

test('referenceText stays safe when a requirement contains literal braces, in any language', () => {
  initI18n({ storage: null });
  const profile = {
    kind: 'aisbc',
    name: 'Synthetic board',
    notes: '',
    checkedOn: '2026-09-08',
    ports: null,
    power: null,
    compatibility: { boardIds: null, unsupportedBoardIds: [] },
    sources: [],
    requirements: ['first', 'keep {brace} literal'],
  };
  assert.doesNotThrow(() => referenceText(profile));
  assert.match(referenceText(profile), /keep \{brace\} literal/);
  setLang('zh');
  try {
    assert.doesNotThrow(() => referenceText(profile));
    assert.match(referenceText(profile), /keep \{brace\} literal/);
  } finally {
    setLang('en');
  }
});
