import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { importDocuments, documentContext } from '../src/ai/documents.js';
import { extractBinary } from '../src/ai/document-readers.js';

// Run the shipped DOCX worker and Mammoth parser, replacing only browser worker
// delivery. Transfer semantics match postMessage so detached-buffer bugs surface.
function installDocxWorker(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  class DocxWorker {
    constructor(url) {
      this.stopped = false;
      const self = { postMessage: data => { if (!this.stopped) this.onmessage?.({ data: structuredClone(data) }); } };
      const context = { self, ArrayBuffer, Uint8Array, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, DataView,
        TextDecoder, TextEncoder, setTimeout, clearTimeout, console };
      context.importScripts = path => runInNewContext(readFileSync(new URL(path, url), 'utf8'), context);
      runInNewContext(readFileSync(url, 'utf8'), context);
      this.receive = self.onmessage;
    }
    postMessage(data, transfer) {
      const message = structuredClone(data, { transfer });
      this.receive({ data: message }).catch(error => this.onerror?.(error));
    }
    terminate() { this.stopped = true; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: DocxWorker });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous);
    else delete globalThis.Worker;
  });
}

test('binary attachment context comes from the same file snapshot as its duplicate identity', async t => {
  installDocxWorker(t);
  const fixture = readFileSync(new URL('./fixtures/documents/requirements.docx', import.meta.url));
  const original = Uint8Array.from(fixture).buffer;
  let reads = 0;
  const file = { name: 'requirements.docx', size: original.byteLength,
    async arrayBuffer() {
      // A second filesystem read can fail after the selected file changes.
      if (++reads > 1) throw new Error('The selected file is no longer readable.');
      return original;
    } };
  const out = await importDocuments([file]);
  assert.deepEqual(out.issues, []);
  assert.equal(out.documents.length, 1);
  assert.match(out.documents[0].text, /SCHEMATICA_DOCX_CAMERA_73/);
  const context = documentContext(out.documents);
  assert.match(context.text, /SCHEMATICA_DOCX_CAMERA_73/);
  assert.equal(context.entries[0].partial, false);
  // Re-import the same bytes after worker transfer: duplicate detection still
  // uses the original snapshot's hash rather than detached/corrupted bytes.
  const duplicate = await importDocuments([{ ...file, arrayBuffer: async () => Uint8Array.from(fixture).buffer }], { existing: out.documents });
  assert.equal(duplicate.documents.length, 1);
  assert.equal(duplicate.issues[0].code, 'duplicate');
});

test('direct binary readers still extract DOCX files without an imported snapshot', async t => {
  installDocxWorker(t);
  const bytes = readFileSync(new URL('./fixtures/documents/requirements.docx', import.meta.url));
  const out = await extractBinary(new File([bytes], 'source.docx'));
  assert.match(out.text, /SCHEMATICA_DOCX_CAMERA_73/);
  assert.deepEqual(out.warnings, []);
});

test('binary snapshots retain size and cancellation boundaries before worker parsing', async () => {
  const file = { name: 'source.docx', size: 2,
    arrayBuffer() { throw new Error('An imported snapshot must not reread its file.'); } };
  await assert.rejects(extractBinary(file, { data: new ArrayBuffer(1) }), /File size changed/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(extractBinary(file, { data: new ArrayBuffer(2), signal: controller.signal }), { name: 'AbortError' });
});
