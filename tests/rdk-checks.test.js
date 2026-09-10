import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDoc } from '../src/drc.js';
import { initI18n, setLang } from '../src/i18n.js';
const n = (id, kind, sublabel = '', extra = {}) => ({
  id,
  kind,
  sublabel,
  label: id,
  rail: '',
  ...extra,
});
const w = (id, a, ap, b, bp, bus = 'mipi') => ({
  id,
  bus,
  from: { node: a, port: ap },
  to: { node: b, port: bp },
});
const stereo = (board = 'RDK X5') => ({
  nodes: [n('board', 'aisbc', board), n('camera', 'depthcam', 'GS130W')],
  wires: [
    w('left', 'camera', 'csi', 'board', 'csi1'),
    w('right', 'board', 'csi2', 'camera', 'csi-right'),
  ],
});
const rdk = (d) => checkDoc(d).filter((f) => f.rule.startsWith('rdk-'));
const rule = (d, r) => rdk(d).filter((f) => f.rule === r);
test('valid stereo pair works in either direction', () => {
  const d = stereo();
  assert.deepEqual(rdk(d), []);
  d.wires.forEach((w) => ([w.from, w.to] = [w.to, w.from]));
  assert.deepEqual(rdk(d), []);
});
test('stereo needs left and right on distinct connectors of the same board', () => {
  for (const change of [
    (d) => d.wires.pop(),
    (d) => (d.wires[1].from.port = 'csi1'),
    (d) => {
      d.nodes.push(n('other', 'aisbc', 'RDK X5'));
      d.wires[1].from.node = 'other';
    },
  ]) {
    const d = stereo();
    change(d);
    assert.ok(
      rule(d, 'rdk-stereo-links').some((f) => f.ids.includes('camera')),
    );
  }
});
test('CSI counts distinct endpoints, includes competing wire IDs, and ignores duplicate edges', () => {
  const d = stereo();
  d.wires.push({ ...d.wires[0], id: 'duplicate' });
  assert.equal(rule(d, 'rdk-csi-capacity').length, 0);
  d.nodes.push(n('extra', 'mipicam', 'IMX219'));
  d.wires.push(w('third', 'extra', 'csi', 'board', 'csi1'));
  assert.ok(
    rule(d, 'rdk-csi-capacity').some((f) =>
      ['left', 'third', 'camera', 'extra'].every((id) => f.ids.includes(id)),
    ),
  );
});
test('X3 unavailable connector and documented stereo exclusion are errors with sources', () => {
  const d = stereo('RDK X3');
  assert.ok(
    rule(d, 'rdk-interface').some(
      (f) => f.level === 'error' && f.ids.includes('right'),
    ),
  );
  assert.ok(rule(d, 'rdk-stereo-links').length);
  assert.ok(
    rule(d, 'rdk-compatibility').some(
      (f) => f.level === 'error' && f.message.includes('https://'),
    ),
  );
});
test('availability checks camera endpoint too', () => {
  const d = stereo();
  d.wires[0].from.port = 'usb';
  assert.ok(rule(d, 'rdk-interface').some((f) => f.ids.includes('camera')));
});
test('unknown and carrier board profiles never establish a verified stereo pair', () => {
  for (const name of ['Custom X5', 'RDK S100', 'RDK S100P', 'RDK X3 Module']) {
    const d = stereo(name);
    const findings = rdk(d);
    assert.ok(
      findings.some(
        (f) => f.level === 'warning' && f.message.includes('unverified'),
      ),
    );
    if (name !== 'RDK X3 Module')
      assert.equal(
        rule(d, 'rdk-interface').filter((f) => f.level === 'error').length,
        0,
      );
    if (name.startsWith('RDK S'))
      assert.ok(findings.some((f) => f.message.includes('expansion')));
  }
});
test('sensor families require verification even with unrelated adapter node', () => {
  const d = {
    nodes: [
      n('board', 'aisbc', 'RDK X5'),
      n('cam', 'mipicam', 'IMX219'),
      n('adapter', 'module', 'Camera expansion board'),
    ],
    wires: [w('link', 'cam', 'csi', 'board', 'csi1')],
  };
  assert.ok(
    rule(d, 'rdk-compatibility').some(
      (f) =>
        f.level === 'warning' &&
        f.message.includes('adapter') &&
        f.message.includes('https://'),
    ),
  );
});
test('shared I2C and 3.3V peripherals do not imply board supply or exclusive connector use', () => {
  const d = {
    nodes: [
      n('board', 'aisbc', 'RDK X5'),
      n('a', 'imu', '', { rail: '3.3V' }),
      n('b', 'temp', '', { rail: '3.3V' }),
    ],
    wires: [
      w('a', 'board', 'i2c', 'a', 'i2c', 'i2c'),
      w('b', 'b', 'i2c', 'board', 'i2c', 'i2c'),
    ],
  };
  assert.deepEqual(rdk(d), []);
});
test('power accepts only complete voltage strings/ranges and checks explicit board input', () => {
  for (const [rail, bad] of [
    ['12V', true],
    ['5V', false],
    ['4–6V', true],
    ['12V nominal / 5V output', false],
    ['5V 5A', false],
    ['unknown', false],
  ]) {
    const d = { nodes: [n('board', 'aisbc', 'RDK X5', { rail })], wires: [] };
    assert.equal(rule(d, 'rdk-power').length, bad ? 1 : 0, rail);
  }
});
test('supply links are orientation independent but regulator input is not inferred as output', () => {
  const d = {
    nodes: [
      n('board', 'aisbc', 'RDK X5'),
      n('battery', 'battery', '', { rail: '12V' }),
      n('reg', 'regulator', '', { rail: '12V' }),
    ],
    wires: [w('supply', 'board', 'vcc', 'battery', 'out', 'power')],
  };
  assert.equal(rule(d, 'rdk-power').length, 1);
  d.wires = [
    w('in', 'battery', 'out', 'reg', 'in', 'power'),
    w('out', 'reg', 'out', 'board', 'vcc', 'power'),
  ];
  assert.equal(rule(d, 'rdk-power').length, 0);
});
test('software resolves package rather than decorative sublabel and validates targets', () => {
  for (const target of ['', 'deleted', 'cam']) {
    const d = {
      nodes: [
        n('board', 'aisbc', 'RDK X5'),
        n('cam', 'mipicam'),
        n('sw', 'rdksoftware', 'hobot_dnn', {
          fields: { package: 'hobot_sensor', runtime: '', target },
        }),
      ],
      wires: [],
    };
    assert.ok(rule(d, 'rdk-software').some((f) => f.ids.includes('sw')));
  }
  for (const board of ['RDK X3', 'RDK X5', 'RDK S100']) {
    const d = {
      nodes: [
        n('board', 'aisbc', board),
        n('sw', 'rdksoftware', 'wrong', {
          fields: { package: 'hobot_dnn', target: 'board', runtime: '' },
        }),
      ],
      wires: [],
    };
    assert.equal(rule(d, 'rdk-software').length, 0);
    d.nodes[1].fields.runtime = 'ROS 2 Humble';
    assert.ok(
      rule(d, 'rdk-software').some(
        (f) =>
          f.message.includes('unverified') && f.message.includes('https://'),
      ),
    );
    d.nodes[1].fields.package = 'custom';
    assert.ok(rule(d, 'rdk-software').length);
  }
});
test('S100P omitted software support is unverified, not excluded', () => {
  const d = {
    nodes: [
      n('board', 'aisbc', 'RDK S100P'),
      n('sw', 'rdksoftware', '', {
        fields: { package: 'hobot_dnn', target: 'board' },
      }),
    ],
    wires: [],
  };
  assert.ok(
    rule(d, 'rdk-software').some(
      (f) =>
        f.message.includes('unverified') && !f.message.includes('unsupported'),
    ),
  );
});
test('a pairing with no vendor-profiled side is not an RDK compatibility question', () => {
  const pair = (board, kind, cam) => ({
    nodes: [n('board', 'aisbc', board), n('cam', kind, cam)],
    wires: [w('link', 'cam', 'csi', 'board', 'csi1')],
  });
  assert.deepEqual(
    rule(pair('Raspberry Pi 5', 'depthcam', 'RealSense D435'), 'rdk-compatibility'),
    [],
  );
  // One vendor-profiled side is enough to ask for verification, with a reference.
  for (const d of [pair('RDK X5', 'mipicam', 'Custom'), pair('Custom', 'mipicam', 'IMX219')])
    assert.ok(
      rule(d, 'rdk-compatibility').some((f) => f.message.includes('https://')),
      d.nodes.map((x) => x.sublabel).join(' + '),
    );
});
test('output-only supplies of any kind are checked against the board input range', () => {
  for (const [kind, bad] of [
    ['jack', true],
    ['solar', true],
    ['vbat', true],
    ['battery', true],
    ['regulator', false],
    ['charger', false],
    ['fuse', false],
  ]) {
    const d = {
      nodes: [n('board', 'aisbc', 'RDK X5'), n('psu', kind, '', { rail: '12V' })],
      wires: [w('supply', 'psu', 'out', 'board', 'vcc', 'power')],
    };
    const found = rule(d, 'rdk-power');
    assert.equal(found.length, bad ? 1 : 0, kind);
    if (bad) assert.ok(['psu', 'supply'].every((id) => found[0].ids.includes(id)));
  }
});
test('an unwired stereo camera is left to the floating-node rule', () => {
  const d = { nodes: [n('board', 'aisbc', 'RDK X5'), n('camera', 'depthcam', 'GS130W')], wires: [] };
  assert.deepEqual(rule(d, 'rdk-stereo-links'), []);
  assert.ok(checkDoc(d).some((f) => f.rule === 'floating-node' && f.ids.includes('camera')));
  d.wires.push(w('left', 'camera', 'csi', 'board', 'csi1'));
  assert.equal(rule(d, 'rdk-stereo-links').length, 1);
});
test('messages omit empty requirement and source parts without double spaces', () => {
  const d = stereo('Custom X5');
  const found = rdk(d);
  assert.ok(found.length);
  for (const f of found) {
    assert.doesNotMatch(f.message, /\s{2}/, f.message);
    assert.doesNotMatch(f.message, /\s$/, f.message);
  }
  assert.ok(
    rule(d, 'rdk-stereo-links').some((f) =>
      f.message.startsWith('camera: stereo connector pair is unverified. Two separate'),
    ),
  );
});
test('documented runtime allow-list distinguishes supported and excluded runtime', async () => {
  const { RDK_PRODUCTS } = await import('../src/rdk/catalogue.js');
  const p = RDK_PRODUCTS.find((p) => p.id === 'hobot_dnn'),
    previous = p.software.runtimes;
  try {
    // Hypothetical support metadata tests the rule, not current product claims.
    p.software.runtimes = ['fixture-runtime'];
    const d = {
      nodes: [
        n('board', 'aisbc', 'RDK X5'),
        n('sw', 'rdksoftware', '', {
          fields: {
            package: 'hobot_dnn',
            target: 'board',
            runtime: 'fixture-runtime',
          },
        }),
      ],
      wires: [],
    };
    assert.equal(rule(d, 'rdk-software').length, 0);
    d.nodes[1].fields.runtime = 'excluded-runtime';
    assert.ok(
      rule(d, 'rdk-software').some(
        (f) =>
          f.level === 'warning' &&
          f.message.includes('outside') &&
          f.message.includes('https://'),
      ),
    );
  } finally {
    p.software.runtimes = previous;
  }
});

test('RDK messages follow the interface language; rule ids and source URLs do not', () => {
  initI18n({ storage: null });
  const doc = { schema: 2, title: '', nodes: [n('b', 'aisbc', 'RDK X5'), n('c', 'mipicam', 'IMX219')], wires: [
    { id: 'w', bus: 'mipi', from: { node: 'b', port: 'csi1' }, to: { node: 'c', port: 'csi' }, label: '', arrow: null, style: null, flow: null },
  ], zones: [], notes: [], journey: [] };
  const en = checkDoc(doc).filter((f) => f.rule.startsWith('rdk-'));
  setLang('zh');
  try {
    const zh = checkDoc(doc).filter((f) => f.rule.startsWith('rdk-'));
    assert.deepEqual(zh.map((f) => f.rule), en.map((f) => f.rule));
    for (const f of zh) {
      assert.match(f.message, /[一-鿿]/, f.rule);
      assert.match(f.message, /https:\/\/d-robotics\.github\.io\//, 'sources stay');
    }
  } finally {
    setLang('en');
  }
});
