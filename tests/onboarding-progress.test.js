import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { firstProjectProgress } from '../src/onboarding-progress.js';
import { designFingerprint } from '../src/workflows.js';

test('first project does not count declarations or handoff before actual readiness', () => {
  const doc = structuredClone(EXAMPLES.find(e => e.id === 'sensor-node-clean').doc);
  const mark = designFingerprint(doc);
  const progress = firstProjectProgress(doc, { checked: mark, exported: mark });
  assert.deepEqual(progress.checks, [true, true, false, true, false]);
  assert.equal(progress.ready, false);
});

test('ready declared board completes handoff after checking and exporting its current revision', () => {
  const doc = structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
  const mark = designFingerprint(doc);
  assert.deepEqual(firstProjectProgress(doc, { checked: mark, exported: mark }).checks, [true, true, true, true, true]);
  doc.wires[0].spec.source = '';
  assert.equal(firstProjectProgress(doc, { checked: mark, exported: mark }).checks[4], false);
});
