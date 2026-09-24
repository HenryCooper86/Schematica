import test from 'node:test';
import assert from 'node:assert/strict';
import { newDoc } from '../src/state.js';

test('layout moves a zone passenger but leaves an independently selected item on its target', async () => {
  const { selectionRects, applyMoves } = await import('../src/tools-layout.js');
  const doc = newDoc();
  doc.zones.push({ id: 'z', x: 0, y: 0, w: 200, h: 150 });
  doc.notes.push({ id: 'passenger', x: 20, y: 20, text: 'Inside' });
  doc.notes.push({ id: 'own', x: 80, y: 20, text: 'Selected' });
  const rects = selectionRects(doc, ['z', 'own']);
  assert.deepEqual(rects.map(r => r.id), ['z', 'own']);
  applyMoves(doc, [{ id: 'z', x: 100, y: 0 }], new Set(rects.map(r => r.id)));
  assert.deepEqual(doc.notes.map(n => n.x), [120, 80]);
});
