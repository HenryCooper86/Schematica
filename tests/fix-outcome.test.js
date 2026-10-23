import test from 'node:test';
import assert from 'node:assert/strict';
import { fixOutcome } from '../src/ai/fix-outcome.js';

const f = (rule, ids, message = rule, level = 'warning') => ({ rule, ids, message, level });

test('a target missing after the draft is fixed; one still present is reported with its new text', () => {
  const pins = f('unconnected-power', ['t'], "Temp's VCC and GND pins are unconnected.");
  const addr = f('i2c-addr-conflict', ['a', 'b']);
  const out = fixOutcome({
    targets: [pins, addr],
    before: [pins, addr],
    after: [f('unconnected-power', ['t'], "Temp's GND pin is unconnected.")],
  });
  assert.deepEqual(out.targets.map((t) => t.resolved), [false, true]);
  assert.equal(out.targets[0].now.message, "Temp's GND pin is unconnected.");
});

test('ids match regardless of order, and new warnings are listed but info notes are not', () => {
  const out = fixOutcome({
    targets: [f('i2c-addr-conflict', ['b', 'a'])],
    before: [f('i2c-addr-conflict', ['a', 'b'])],
    after: [f('i2c-addr-conflict', ['a', 'b']), f('bus-mismatch', ['w9']), f('battery-runtime', ['n1'], 'x', 'info')],
  });
  assert.equal(out.targets[0].resolved, false);
  assert.deepEqual(out.introduced.map((x) => x.rule), ['bus-mismatch']);
});

test('removed parts, wires, zones and notes are surfaced; journey edits and moves are not', () => {
  const out = fixOutcome({ changes: [
    { type: 'removed', collection: 'nodes', id: 'n1', label: 'Telephony server' },
    { type: 'removed', collection: 'journey', id: 'j1', label: 'Step' },
    { type: 'moved', collection: 'nodes', id: 'n2', label: 'MCU' },
    { type: 'removed', collection: 'wires', id: 'w1', label: '' },
  ] });
  assert.deepEqual(out.removed.map((c) => c.id), ['n1', 'w1']);
});

test('a finding that disappears because its item was deleted is not counted as fixed', () => {
  const pins = f('unconnected-power', ['t'], "Temp's VCC and GND pins are unconnected.");
  const out = fixOutcome({
    targets: [pins], before: [pins], after: [],
    changes: [
      { type: 'removed', collection: 'nodes', id: 't', label: 'Temp sensor' },
      { type: 'removed', collection: 'wires', id: 'w6', label: '', before: { label: '', from: { node: 'm' }, to: { node: 't' } } },
    ],
    board: { nodes: [{ id: 't', label: 'Temp sensor' }, { id: 'm', label: 'MCU' }] },
  });
  assert.equal(out.targets[0].resolved, false);
  assert.deepEqual(out.targets[0].deleted, ['Temp sensor']);
  assert.equal(out.removed[1].label, 'MCU → Temp sensor', 'an unlabelled wire is named by its ends');
});
