// The Anthropic Messages API over fetch, streaming. Thinking is adaptive;
// the assistant's raw blocks (thinking with its signature, text, tool_use)
// are replayed verbatim on later turns, as the API requires.
import { sseParser, readStream } from './stream.js';
import { ProviderError, mapHttpError, networkError, MAX_TOOL_INPUT, MAX_STREAM_TEXT } from './errors.js';
import { tr } from '../../i18n.js';
import { providerFetch } from './transport.js';

const VERSION = '2023-06-01';
const MAX_TOKENS = 16000;
const STOP = { end_turn: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens', refusal: 'refusal', stop_sequence: 'end' };

// The API rejects a text block with an empty string, and a streamed reply
// that only called tools leaves one behind: drop them, and drop an assistant
// turn that has nothing left to say.
const nonEmpty = (blocks) => blocks.filter((b) => !(b.type === 'text' && !b.text));

function anthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const raw = Array.isArray(m.raw) && m.raw.length ? m.raw : null;
      // A call whose arguments never parsed has input null; the wire needs an object.
      const content = raw || m.content.map((b) => (b.type === 'tool_use'
        ? { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} }
        : { type: 'text', text: b.text }));
      const kept = nonEmpty(content);
      if (kept.length) out.push({ role: 'assistant', content: kept });
      continue;
    }
    const content = m.content.map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      const r = { type: 'tool_result', tool_use_id: b.id, content: b.text };
      if (b.isError) r.is_error = true;
      return r;
    });
    out.push({ role: m.role, content });
  }
  return out;
}

export function toAnthropicRequest({ model, effort, system, messages, tools }) {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    system: system.filter((s) => typeof s === 'string' && s.length).map((text, i) => (i === 0
      ? { type: 'text', text, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text })),
    messages: anthropicMessages(messages),
  };
  // Haiku 4.5 has no adaptive thinking and no effort control; sending either
  // is a 400.
  if (!/haiku-4/.test(model)) {
    body.thinking = { type: 'adaptive' };
    body.output_config = { effort };
  }
  if (tools.length) {
    body.tools = tools.map((t) => {
      const w = { name: t.name, description: t.description, input_schema: t.input_schema };
      if (t.strict) w.strict = true;
      return w;
    });
  }
  return body;
}

// Folds the event stream into blocks; result() gives the internal reply.
export function createAnthropicAccumulator(onText) {
  const blocks = [];
  const partial = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let stopReason = null;
  let stopDetails = null;
  let failure = null;
  // Thrown from push so readStream cancels the reader: accumulation stops
  // at the cap instead of growing until the stream ends.
  const overflow = (message) => { failure = failure || new ProviderError(message, { code: 'request' }); throw failure; };
  return {
    push({ event, data }) {
      const type = event || data?.type;
      if (type === 'message_start') {
        const u = data.message?.usage || {};
        usage.input = u.input_tokens || 0;
        usage.cacheRead = u.cache_read_input_tokens || 0;
        usage.cacheWrite = u.cache_creation_input_tokens || 0;
      } else if (type === 'content_block_start') {
        const b = { ...data.content_block };
        if (b.type === 'text') b.text = b.text || '';
        if (b.type === 'thinking') b.thinking = b.thinking || '';
        blocks[data.index] = b;
        partial[data.index] = '';
      } else if (type === 'content_block_delta') {
        const b = blocks[data.index];
        const d = data.delta || {};
        if (!b) return;
        if (d.type === 'text_delta') {
          b.text += d.text;
          if (b.text.length > MAX_STREAM_TEXT) overflow(tr('The reply exceeded 2 MB of text; ask for a shorter answer.'));
          onText?.(d.text);
        } else if (d.type === 'input_json_delta') {
          partial[data.index] += d.partial_json;
          if (partial[data.index].length > MAX_TOOL_INPUT) overflow(tr('A tool call input exceeded 256 KB; split the work into smaller batches.'));
        } else if (d.type === 'thinking_delta') {
          b.thinking += d.thinking;
          if (b.thinking.length > MAX_STREAM_TEXT) overflow(tr('The reply exceeded 2 MB of text; ask for a shorter answer.'));
        } else if (d.type === 'signature_delta') b.signature = d.signature;
      } else if (type === 'content_block_stop') {
        // Parse after the stop reason arrives: max_tokens can leave partial JSON.
      } else if (type === 'message_delta') {
        stopReason = data.delta?.stop_reason || stopReason;
        stopDetails = data.delta?.stop_details || null;
        usage.output = data.usage?.output_tokens ?? usage.output;
      } else if (type === 'error') {
        failure = new ProviderError(data.error?.message || tr('stream error'), { code: 'request' });
      }
    },
    result() {
      if (failure) throw failure;
      if (!stopReason) throw new ProviderError(tr('The response stream ended before the reply completed. Try again.'), { code: 'network' });
      // Arguments that do not parse are the model's mistake, not a broken
      // stream: the call is surfaced with input null and an inputError so the
      // agent can answer it with an error result and let the model retry.
      // The replayed raw block keeps an object, as the API requires.
      const inputErrors = new Map();
      const raw = blocks.flatMap((b, i) => {
        if (b.type !== 'tool_use') return [b];
        if (stopReason === 'max_tokens' || stopReason === 'refusal') return [];
        const json = partial[i] || '';
        let input = b.input || {};
        if (json.trim()) {
          try { input = JSON.parse(json); } catch (err) { inputErrors.set(b.id, err.message); input = {}; }
        }
        return [{ ...b, input }];
      });
      return {
        text: raw.filter((b) => b.type === 'text').map((b) => b.text).join(''),
        toolCalls: raw.filter((b) => b.type === 'tool_use').map((b) => (inputErrors.has(b.id)
          ? { id: b.id, name: b.name, input: null, inputError: inputErrors.get(b.id) }
          : { id: b.id, name: b.name, input: b.input })),
        usage,
        stop: STOP[stopReason] || 'end',
        stopDetails,
        raw,
      };
    },
  };
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, ms);
  const abort = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    reject(signal.reason);
  };
  signal?.addEventListener('abort', abort, { once: true });
});

export function anthropicProvider({ baseUrl, apiKey, model, effort, fetchImpl = globalThis.fetch }) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/v1/messages`;
  async function post(body, signal) {
    try {
      return await providerFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
      }, fetchImpl);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw networkError('Anthropic', err);
    }
  }
  return {
    async chat({ system, messages, tools, signal, onText }) {
      const body = toAnthropicRequest({ model, effort, system, messages, tools });
      let res = await post(body, signal);
      if (res.status === 429) {
        const header = res.headers.get('retry-after');
        const parsed = header === null ? NaN : Number(header);
        const after = Number.isFinite(parsed) ? Math.min(10, Math.max(0, parsed)) : 5;
        await res.body?.cancel();
        await sleep(after * 1000, signal);
        res = await post(body, signal);
      }
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'Anthropic');
      const acc = createAnthropicAccumulator(onText);
      try {
        await readStream(res, sseParser((e) => acc.push(e)));
      } catch (err) {
        // A stream that breaks mid-reply is a network failure; a parser that
        // threw already carries its own ProviderError.
        if (err?.name === 'AbortError' || err instanceof ProviderError) throw err;
        throw networkError('Anthropic', err);
      }
      return acc.result();
    },
  };
}
