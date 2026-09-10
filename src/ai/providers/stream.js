// Streaming helpers shared by the adapters: server-sent events (Anthropic,
// OpenAI-compatible). Accept text in
// any chunking and dispatch complete records only.

function parseData(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export function sseParser(onEvent) {
  let buffer = '';
  let event = null;
  let data = [];
  const flush = () => {
    if (data.length) onEvent({ event, data: parseData(data.join('\n')) });
    event = null;
    data = [];
  };
  const line = (l) => {
    if (l === '') { flush(); return; }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i < 0 ? l : l.slice(0, i);
    const value = i < 0 ? '' : l.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  return {
    push(text) {
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, nl).replace(/\r$/, ''));
        buffer = buffer.slice(nl + 1);
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
