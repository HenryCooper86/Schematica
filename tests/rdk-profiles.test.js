import test from 'node:test';
import assert from 'node:assert/strict';
import { newDoc } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';
import { diagramMarkup } from '../src/render.js';
import { applyEdits, EDIT_SCHEMA } from '../src/ai/ops.js';
const node = (id, kind, sublabel) => ({
  id,
  kind,
  sublabel,
  label: id,
  x: 0,
  y: 0,
});
const available = (sublabel, kind = 'aisbc') =>
  diagramMarkup({ ...newDoc(), nodes: [node('b', kind, sublabel)] }).match(
    /data-port="csi[^\"]*"/g,
  ) || [];
test('real renderer offers one X3 CSI', () => {
  assert.deepEqual(available('RDK X3'), ['data-port="csi1"']);
});
test('real renderer offers two X5 CSI ports', () => {
  assert.deepEqual(available('RDK X5'), [
    'data-port="csi1"',
    'data-port="csi2"',
  ]);
});
test('real renderer offers two distinct GS130W CSI endpoints', () => {
  assert.deepEqual(available('GS130W', 'depthcam'), [
    'data-port="csi"',
    'data-port="csi-right"',
  ]);
});
test('legacy stereo name retains generic endpoints', () => {
  assert.deepEqual(available('RDK Stereo Camera', 'depthcam'), [
    'data-port="csi"',
  ]);
});
test('real AI batch rejects unavailable X3 CSI atomically', () => {
  assert.ok(EDIT_SCHEMA.properties.ops);
  const doc = newDoc();
  const result = applyEdits(doc, [
    { op: 'add_part', ref: 'b', kind: 'aisbc', sublabel: 'RDK X3' },
    { op: 'add_part', ref: 'c', kind: 'mipicam', sublabel: 'IMX219' },
    {
      op: 'connect',
      from: { node: 'b', port: 'csi2' },
      to: { node: 'c', port: 'csi' },
      bus: 'mipi',
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(doc.nodes.length, 0);
  assert.match(result.errors[0].message, /csi2/);
});
for (const [board, camera, fromPort, toPort] of [
  ['RDK X3', 'IMX219', 'csi2', 'csi'],
  ['RDK X5', 'RDK Stereo Camera', 'csi2', 'csi-right'],
  ['RDK X5', 'unlisted camera', 'csi2', 'csi-right'],
])
  test(`preserved ${board}/${camera} unsupported wire survives save and renders invalid`, () => {
    const doc = {
      ...newDoc(),
      nodes: [
        node('b', 'aisbc', board),
        node('c', toPort === 'csi' ? 'mipicam' : 'depthcam', camera),
      ],
      wires: [
        {
          id: 'w',
          bus: 'mipi',
          from: { node: 'b', port: fromPort },
          to: { node: 'c', port: toPort },
        },
      ],
    };
    const restored = deserialize(
      serialize(deserialize(serialize(doc)).doc),
    ).doc;
    assert.equal(restored.wires.length, 1);
    assert.deepEqual(restored.wires[0].to, doc.wires[0].to);
    assert.deepEqual(restored.wires[0].from, doc.wires[0].from);
    assert.match(
      diagramMarkup(restored),
      /class="portg unsupported"[^>]*data-unsupported="true"/,
    );
    assert.match(diagramMarkup(restored), /class="wire invalid"/);
  });

test('catalogue lookup is exact, searchable and provenance-backed', async () => {
  const { RDK_PRODUCTS, profileFor, searchRdk, rdkPresets, profileSummary } =
    await import('../src/rdk/catalogue.js');
  const { nodePart, knownPorts, displayPart } =
    await import('../src/rdk/profiles.js');
  assert.equal(
    profileFor({ kind: 'aisbc', sublabel: ' rdk x3 ' }).id,
    'rdk-x3',
  );
  assert.equal(profileFor({ kind: 'mcu', sublabel: 'RDK X3' }), null);
  assert.equal(
    profileFor({ kind: 'aisbc', label: 'RDK X3', notes: 'RDK X3' }),
    null,
  );
  assert.equal(profileFor({ kind: 'aisbc', sublabel: 'custom RDK X3' }), null);
  assert.notEqual(
    profileFor({ kind: 'depthcam', sublabel: 'RDK Stereo Camera' })?.id,
    'gs130w',
  );
  assert.equal(searchRdk('X5')[0].id, 'rdk-x5');
  assert.equal(searchRdk('X')[0], undefined);
  assert.ok(searchRdk('rdk').length <= 12);
  // Underscored ids are searchable by either half or in full.
  assert.deepEqual(
    searchRdk('hobot').map((p) => p.id),
    ['hobot_sensor', 'hobot_dnn', 'hobot_codec', 'hobot_render'],
  );
  assert.deepEqual(
    searchRdk('hobot_sensor').map((p) => p.id),
    ['hobot_sensor'],
  );
  assert.ok(searchRdk('sensor').some((p) => p.id === 'hobot_sensor'));
  // A product named by the query outranks one that only mentions it in notes.
  assert.equal(searchRdk('GS130W')[0].id, 'gs130w');
  assert.ok(searchRdk('GS130W').some((p) => p.id === 'rdk-stereo-legacy'));
  assert.ok(rdkPresets('aisbc').some((p) => p.sublabel === 'RDK X3'));
  assert.equal(
    nodePart({ kind: 'aisbc', sublabel: 'RDK X3' }).ports.filter(
      (p) => p.bus === 'mipi',
    ).length,
    1,
  );
  assert.ok(knownPorts({ kind: 'depthcam' }).some((p) => p.id === 'csi-right'));
  assert.equal(
    displayPart(node('b', 'depthcam', 'unknown'), [
      {
        from: { node: 'b', port: 'csi-right' },
        to: { node: 'other', port: 'csi' },
      },
    ]).ports.find((p) => p.id === 'csi-right').unsupported,
    true,
  );
  for (const p of RDK_PRODUCTS) {
    assert.ok(
      p.sources.length &&
        p.sources.every((s) => s.title && s.url.startsWith('https://')),
    );
    assert.equal(p.checkedOn, '2026-09-06');
    assert.ok(profileSummary(p).includes(p.sources[0].url));
  }
  assert.equal(
    profileFor({ kind: 'aisbc', sublabel: 'RDK X3 Module' }).ports,
    null,
  );
  for (const packageName of [
    'hobot_sensor',
    'hobot_dnn',
    'hobot_codec',
    'hobot_render',
  ]) {
    assert.equal(
      profileFor({ kind: 'rdksoftware', sublabel: packageName }).productClass,
      'software component',
    );
  }
});

test('software support preserves broad S100 capability without assuming a runtime', async () => {
  const { profileFor } = await import('../src/rdk/catalogue.js');
  const p = profileFor({ kind: 'rdksoftware', sublabel: 'hobot_dnn' });
  assert.ok(p.software.boardIds?.includes('rdk-s100'));
  assert.equal(p.software.runtimes, null);
});
test('changing a real GS130W node preserves its right wire and user annotations', () => {
  const doc = {
    ...newDoc(),
    nodes: [
      node('b', 'aisbc', 'RDK X5'),
      { ...node('c', 'depthcam', 'GS130W'), rail: 'custom', notes: 'keep me' },
    ],
    wires: [
      {
        id: 'w',
        bus: 'mipi',
        from: { node: 'b', port: 'csi2' },
        to: { node: 'c', port: 'csi-right' },
      },
    ],
  };
  const result = applyEdits(doc, [
    { op: 'update_part', id: 'c', sublabel: 'RDK Stereo Camera' },
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(doc.wires[0].to.port, 'csi-right');
  assert.equal(doc.nodes[1].rail, 'custom');
  assert.equal(doc.nodes[1].notes, 'keep me');
  assert.equal(deserialize(serialize(doc)).doc.wires[0].to.port, 'csi-right');
  assert.match(diagramMarkup(doc), /class="wire invalid"/);
});

test('summary includes exact ports and date for downstream consumers', async () => {
  const { profileFor, profileSummary } =
    await import('../src/rdk/catalogue.js');
  const summary = profileSummary(
    profileFor({ kind: 'depthcam', sublabel: 'GS130W' }),
  );
  assert.match(summary, /csi-right/);
  assert.match(summary, /2026-09-06/);
});

test('legacy ports remain individually visible when their old position is occupied', async () => {
  const { displayPart } = await import('../src/rdk/profiles.js');
  const part = displayPart(node('c', 'depthcam', 'unknown'), [
    { from: { node: 'b', port: 'csi2' }, to: { node: 'c', port: 'csi-right' } },
  ]);
  const positions = part.ports.map((p) => `${p.side}:${p.offset}`);
  assert.equal(new Set(positions).size, positions.length);
});
