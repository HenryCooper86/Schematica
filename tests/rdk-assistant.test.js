import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, updateItem, duplicateItems } from '../src/state.js';
import { createExecutor } from '../src/ai/tools.js';
import { serialize, deserialize } from '../src/serialize.js';
import { boardText } from '../src/ai/context.js';
import { presetPatch, presetsFor } from '../src/presets.js';
import { filterParts } from '../src/search.js';
const add = (store, kind, x, y, patch) => {
  const id = addNode(store, kind, x, y);
  updateItem(store, id, patch);
  return store.doc.nodes.find((n) => n.id === id);
};
const setup = () => {
  const store = new Store();
  return {
    store,
    ex: createExecutor({
      getDoc: () => store.doc,
      commit: (fn) => store.mutate(fn),
    }),
  };
};
test('RDK reference and board context are source-aware read-only data', () => {
  const { store, ex } = setup();
  add(store, 'aisbc', 0, 0, { sublabel: 'RDK X5' });
  const before = serialize(store.doc);
  for (const query of ['X5', 'GS130W']) {
    const r = ex.run('rdk_reference', { query });
    assert.equal(r.isError, false);
    assert.match(r.text, /https:\/\/d-robotics/);
    if (query === 'GS130W') {
      assert.match(r.text, /csi-right/);
      assert.match(r.text, /Unsupported boards: rdk-x3/);
    }
  }
  assert.match(ex.run('rdk_reference', { query: 'nonsense' }).text, /No RDK/);
  assert.match(ex.run('get_board').text, /effective RDK|RDK profiles/);
  assert.match(boardText(store.doc), /Checked:/);
  assert.equal(serialize(store.doc), before);
});
test('real executor resolves software target refs and rejects unknown targets atomically', () => {
  const { store, ex } = setup();
  const r = ex.run('apply_edits', {
    ops: [
      { op: 'add_part', kind: 'aisbc', ref: 'host', sublabel: 'RDK X5' },
      {
        op: 'add_part',
        kind: 'rdksoftware',
        ref: 'stage',
        fields: { package: 'hobot_dnn', runtime: '', target: 'host' },
      },
    ],
  });
  assert.equal(r.isError, false, r.text);
  const [board, stage] = store.doc.nodes;
  assert.equal(stage.fields.target, board.id);
  assert.equal(
    deserialize(serialize(store.doc)).doc.nodes[1].fields.package,
    'hobot_dnn',
  );
  const before = serialize(store.doc);
  const bad = ex.run('apply_edits', {
    ops: [
      { op: 'set_title', title: 'partial' },
      { op: 'update_part', id: stage.id, fields: { target: 'missing-ref' } },
    ],
  });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /target|no node/);
  assert.equal(serialize(store.doc), before);
  assert.equal(
    ex.run('apply_edits', {
      ops: [{ op: 'update_part', id: stage.id, fields: { target: board.id } }],
    }).isError,
    false,
  );
});
test('software presets set authoritative package and are searchable', () => {
  for (const p of presetsFor('rdksoftware'))
    assert.equal(
      presetPatch(
        { kind: 'rdksoftware', fields: { target: 'board', package: 'old' } },
        p.name,
      ).fields.package,
      p.sublabel,
    );
  assert.equal(presetsFor('rdksoftware').length, 4);
  assert.ok(filterParts('hobot_dnn').has('rdksoftware'));
});
test('copying board and stage remaps target; stage-only preserves it', () => {
  const { store } = setup();
  const b = add(store, 'aisbc', 0, 0, { sublabel: 'RDK X5' });
  const s = add(store, 'rdksoftware', 200, 0, {
    fields: { package: 'hobot_dnn', target: b.id },
  });
  const ids = duplicateItems(store, [s.id, b.id]);
  const copies = store.doc.nodes.filter((n) => ids.includes(n.id));
  assert.equal(
    copies.find((n) => n.kind === 'rdksoftware').fields.target,
    copies.find((n) => n.kind === 'aisbc').id,
  );
  const [id] = duplicateItems(store, [s.id]);
  assert.equal(store.doc.nodes.find((n) => n.id === id).fields.target, b.id);
});

test('stale software target survives import and board profiles are deduplicated and bounded', () => {
  const { store } = setup();
  const board = add(store, 'aisbc', 0, 0, { sublabel: 'RDK X5' });
  add(store, 'rdksoftware', 200, 0, {
    fields: {
      package: 'hobot_dnn',
      runtime: 'unknown',
      target: 'deleted-board',
    },
  });
  assert.equal(
    deserialize(serialize(store.doc)).doc.nodes[1].fields.target,
    'deleted-board',
  );
  for (let i = 0; i < 100; i++)
    store.doc.nodes.push({ ...board, id: `copy${i}` });
  assert.equal((boardText(store.doc).match(/Checked:/g) || []).length, 2);
});
test('non-board and forward target refs reject batches without leaving newly added stages', () => {
  const { store, ex } = setup();
  const camera = add(store, 'mipicam', 0, 0, {});
  for (const target of [camera.id, 'later']) {
    const before = serialize(store.doc);
    const result = ex.run('apply_edits', {
      ops: [
        {
          op: 'add_part',
          kind: 'rdksoftware',
          ref: 'stage',
          fields: { package: 'hobot_sensor', target },
        },
        { op: 'add_part', kind: 'aisbc', ref: 'later', sublabel: 'RDK X5' },
      ],
    });
    assert.equal(result.isError, true);
    assert.match(result.text, /no node|not a board/);
    assert.equal(serialize(store.doc), before);
  }
});
test('generic and unrecognized board targets reject earlier changes atomically', () => {
  for (const sublabel of ['', 'Unknown RDK board']) {
    const { store, ex } = setup();
    const before = serialize(store.doc);
    const result = ex.run('apply_edits', {
      ops: [
        { op: 'set_title', title: 'Must not persist' },
        { op: 'add_part', kind: 'aisbc', ref: 'host', sublabel },
        {
          op: 'add_part',
          kind: 'rdksoftware',
          ref: 'stage',
          fields: { package: 'hobot_sensor', target: 'host' },
        },
      ],
    });
    assert.equal(result.isError, true);
    assert.match(result.text, /recognized RDK board/);
    assert.equal(serialize(store.doc), before);
  }
});
test('editing another software field preserves an imported stale target', () => {
  const { store, ex } = setup();
  const stage = add(store, 'rdksoftware', 0, 0, {
    fields: { package: 'hobot_sensor', target: 'deleted-board' },
  });
  store.doc = deserialize(serialize(store.doc)).doc;
  const result = ex.run('apply_edits', {
    ops: [
      { op: 'update_part', id: stage.id, fields: { package: 'hobot_dnn' } },
    ],
  });
  assert.equal(result.isError, false, result.text);
  assert.equal(store.doc.nodes[0].fields.target, 'deleted-board');
  assert.equal(store.doc.nodes[0].fields.package, 'hobot_dnn');
});

test('real preset tool includes bounded dated official references and software package identity', () => {
  const { store, ex } = setup();
  const before = serialize(store.doc);
  for (const kind of ['aisbc', 'rdksoftware']) {
    const result = ex.run('list_presets', { kind });
    assert.equal(result.isError, false);
    assert.match(result.text, /Checked: \d{4}-\d{2}-\d{2}/);
    assert.match(result.text, /https:\/\/d-robotics/);
    assert.ok(result.text.length <= 18000);
    if (kind === 'aisbc') {
      assert.match(result.text, /GS130WI/);
      assert.match(result.text, /csi1/);
    } else
      for (const name of [
        'hobot_sensor',
        'hobot_dnn',
        'hobot_codec',
        'hobot_render',
      ])
        assert.ok(result.text.includes(`fields.package=${name}`));
  }
  assert.equal(serialize(store.doc), before);
});
