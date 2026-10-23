import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDoc } from '../src/drc.js';
import { securityChecks } from '../src/security-checks.js';
import { initI18n, setLang } from '../src/i18n.js';

const node = (id, kind, extra = {}) => ({ id, kind, x: 0, y: 0, label: id, sublabel: '', color: null, addr: '', rail: '',
  notes: '', status: null, flags: [], ...extra });
const link = (id, a, b) => ({ id, bus: 'link', from: { node: a, port: 'e' }, to: { node: b, port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null });
const doc = (nodes, wires = []) => ({ schema: 2, title: '', nodes, wires, zones: [], notes: [], journey: [] });
const rules = (d) => securityChecks(d).map((f) => `${f.rule}:${f.ids.join(',')}`).sort();

test('an unlinked threat is reported by the security rule, not as a floating part', () => {
  const d = doc([node('apt', 'threatactor', { fields: { severity: 'high' } })]);
  assert.deepEqual(rules(d), ['threat-unlinked:apt']);
  assert.ok(!checkDoc(d).some((f) => f.rule === 'floating-node'), 'no duplicate floating-node finding');
});

test('a victim is fine when any chain of wires reaches a threat or adversary', () => {
  const d = doc([
    node('mal', 'malware', { fields: { severity: 'high' } }),
    node('reg', 'server'),
    node('tgt', 'server', { disposition: 'victim' }),
  ], [link('w1', 'mal', 'reg'), link('w2', 'reg', 'tgt')]);
  assert.deepEqual(rules(d), []);
  const adversary = doc([node('op', 'hostpc', { disposition: 'adversary' }), node('tgt', 'server', { disposition: 'victim' })], [link('w', 'op', 'tgt')]);
  assert.deepEqual(rules(adversary), [], 'an adversary disposition counts as hostile');
});

test('a victim that nothing hostile reaches is reported', () => {
  const d = doc([node('a', 'server'), node('tgt', 'server', { disposition: 'victim' })], [link('w', 'a', 'tgt')]);
  assert.deepEqual(rules(d), ['victim-no-threat:tgt']);
});

test('a threat without a severity is an info finding', () => {
  const d = doc([node('apt', 'threatactor'), node('srv', 'server')], [link('w', 'apt', 'srv')]);
  const f = securityChecks(d);
  assert.deepEqual(f.map((x) => [x.rule, x.level]), [['threat-no-severity', 'info']]);
});

test('security messages follow the interface language', () => {
  initI18n({ storage: null });
  const d = doc([node('apt', 'threatactor', { fields: { severity: 'low' } })]);
  setLang('zh');
  try {
    assert.match(securityChecks(d)[0].message, /威胁/);
  } finally {
    setLang('en');
  }
});
