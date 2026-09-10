import { LIMITS } from './documents.js';

// Each invocation owns its workers; there is never a shared parser to invalidate.
export async function extractBinary(file, { signal } = {}) {
  if (!Number.isSafeInteger(file.size) || file.size > LIMITS.fileBytes) throw Error('File exceeds the 10 MiB limit.');
  if (signal?.aborted) throw new DOMException('Document import cancelled.', 'AbortError');
  const kind = file.name.split('.').at(-1).toLowerCase();
  if (!['pdf', 'docx'].includes(kind)) throw Error('Unsupported binary document format.');
  let worker, pdfWorker, loadingTask, timer, stopped = false;
  const abortError = () => new DOMException('Document import cancelled.', 'AbortError');
  const check = () => { if (stopped || signal?.aborted) throw abortError(); };
  const cleanup = () => {
    // destroy() may wait for an unresponsive worker. Termination is immediate and
    // we deliberately do not await its asynchronous acknowledgement on cancellation.
    if (loadingTask) { try { Promise.resolve(loadingTask.destroy()).catch(() => {}); } catch {} }
    pdfWorker?.destroy(); worker?.terminate();
  };
  let rejectStop;
  const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
  const stop = error => { stopped = true; cleanup(); rejectStop(error); };
  const abort = () => stop(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => stop(Error('Document extraction timed out. Try a smaller document.')), LIMITS.timeoutMs);
  try {
    return await Promise.race([stopPromise, (async () => {
      const data = await file.arrayBuffer(); check();
      if (data.byteLength !== file.size) throw Error('File size changed during reading.');
      if (kind === 'docx') {
        worker = new Worker(new URL('./docx-worker.js', import.meta.url));
        return await new Promise((resolve, reject) => {
          worker.onmessage = ({ data: result }) => result.error ? reject(Error(result.error)) : resolve({ text: result.text, warnings: result.warnings });
          worker.onerror = () => reject(Error('DOCX reader failed. The document may be corrupt or unsupported.'));
          worker.onmessageerror = () => reject(Error('DOCX reader returned an unreadable response.'));
          worker.postMessage({ data, maxChars: LIMITS.textChars }, [data]);
        });
      }
      const pdfjs = await import('../../vendor/pdfjs/pdf.mjs'); check();
      worker = new Worker(new URL('../../vendor/pdfjs/pdf.worker.mjs', import.meta.url), { type: 'module' });
      worker.onerror = () => stop(Error('PDF reader failed. Try a recent browser or export as text.'));
      pdfWorker = new pdfjs.PDFWorker({ port: worker });
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), worker: pdfWorker,
        cMapUrl: new URL('../../vendor/pdfjs/cmaps/', import.meta.url).href,
        standardFontDataUrl: new URL('../../vendor/pdfjs/standard_fonts/', import.meta.url).href,
        useWorkerFetch: false, useWasm: false, disableAutoFetch: true,
        disableFontFace: true, useSystemFonts: false, isOffscreenCanvasSupported: false,
        isImageDecoderSupported: false, enableXfa: false, verbosity: 0, stopAtErrors: true });
      loadingTask.onPassword = () => stop(Error('Password-protected PDFs are not supported. Export an unlocked copy.'));
      const pdf = await loadingTask.promise; check();
      const warnings = [], parts = []; let length = 0;
      const pages = Math.min(pdf.numPages, LIMITS.pdfPages);
      if (pdf.numPages > pages) warnings.push('Partial extraction: only the first 100 PDF pages are available.');
      for (let index = 1; index <= pages; index++) {
        check(); const page = await pdf.getPage(index);
        try {
          const content = await page.getTextContent(); check();
          const text = content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n';
          parts.push(text.slice(0, Math.max(0, LIMITS.textChars - length))); length += text.length;
          if (length >= LIMITS.textChars) { warnings.push('Partial extraction: stopped at 100,000 characters.'); break; }
        } finally { page.cleanup(); }
      }
      let text = parts.join('');
      if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
      if (!text.trim()) throw Error('No readable PDF text found. Scanned/image-only PDFs need OCR, which is not supported.');
      return { text, warnings };
    })()]);
  } catch (error) {
    if (error.name === 'InvalidPDFException') throw Error('Corrupt or invalid PDF document.');
    throw error;
  } finally {
    stopped = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); cleanup();
  }
}
