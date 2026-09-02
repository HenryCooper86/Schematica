import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare } from '../src/share.js';
import { serialize, deserialize } from '../src/serialize.js';
import { Store, addNode, addWire } from '../src/state.js';

function sampleDoc() {
  const store = new Store();
  const a = addNode(store, 'mcu', 100, 100);
  const b = addNode(store, 'temp', 400, 100);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.doc.title = 'Shared Board';
  return store.doc;
}

test('share link round-trips a document exactly', async () => {
  const doc = sampleDoc();
  const fragment = await encodeShare(doc);
  assert.match(fragment, /^[dj]=[A-Za-z0-9_-]+$/, 'base64url fragment with scheme prefix');
  const text = await decodeShare(fragment);
  const { doc: back, warnings } = deserialize(text);
  assert.deepEqual(warnings, []);
  assert.deepEqual(back, doc);
});

test('decodeShare accepts a leading # and rejects garbage', async () => {
  const fragment = await encodeShare(sampleDoc());
  const text = await decodeShare(`#${fragment}`);
  assert.equal(JSON.parse(text).title, 'Shared Board');
  await assert.rejects(() => decodeShare('#x=abc'), /share link/);
  await assert.rejects(() => decodeShare('not-a-fragment'), /share link/);
});

test('compressed links are much smaller than raw JSON for a real board', async () => {
  const doc = sampleDoc();
  const fragment = await encodeShare(doc);
  if (fragment.startsWith('d=')) {
    assert.ok(fragment.length < serialize(doc).length, 'deflate should beat pretty JSON');
  }
});
