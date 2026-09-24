// Streaming helpers shared by the adapters: server-sent events (Anthropic,
// OpenAI-compatible). Accept text in
// any chunking and dispatch complete records only.
import { ProviderError, MAX_STREAM_TEXT } from './errors.js';
import { tr } from '../../i18n.js';

// The adapters cap parsed text and tool input, but those checks cannot run
// until an entire SSE record arrives. Bound the pending record as well.
const MAX_EVENT = MAX_STREAM_TEXT * 2;

function parseData(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export function sseParser(onEvent) {
  let buffer = '';
  let event = null;
  let data = [];
  let dataLength = 0;
  const oversized = () => new ProviderError(tr('The provider sent an oversized stream event.'), { code: 'request' });
  const flush = () => {
    if (data.length) onEvent({ event, data: parseData(data.join('\n')) });
    event = null;
    data = [];
    dataLength = 0;
  };
  const line = (l) => {
    if (l === '') { flush(); return; }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i < 0 ? l : l.slice(0, i);
    const value = i < 0 ? '' : l.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') {
      dataLength += value.length + 1;
      if (dataLength > MAX_EVENT) throw oversized();
      data.push(value);
    }
  };
  return {
    push(text) {
      let start = 0;
      for (;;) {
        const nl = text.indexOf('\n', start);
        const fragment = text.slice(start, nl < 0 ? undefined : nl);
        if (buffer.length + fragment.length > MAX_EVENT) throw oversized();
        buffer += fragment;
        if (nl < 0) break;
        line(buffer.replace(/\r$/, ''));
        buffer = '';
        start = nl + 1;
      }
    },
    end() {
      if (buffer) line(buffer.replace(/\r$/, ''));
      buffer = '';
      flush();
    },
  };
}

export async function readStream(response, parser) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (err) {
    try { await reader.cancel(err); } catch { /* preserve the original stream error */ }
    throw err;
  } finally {
    reader.releaseLock();
  }
}
