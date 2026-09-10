// Chat completions with function calling and streaming: OpenAI, OpenRouter,
// and any endpoint that speaks the same shapes.
import { sseParser, readStream } from './stream.js';
import { ProviderError, mapHttpError, networkError, MAX_TOOL_INPUT, MAX_STREAM_TEXT } from './errors.js';
import { tr } from '../../i18n.js';
import { providerFetch } from './transport.js';

const STOP = { stop: 'end', tool_calls: 'tool_use', length: 'max_tokens', content_filter: 'refusal' };

export function toOpenAIRequest({ model, system, messages, tools }) {
  const out = [{ role: 'system', content: system.filter(Boolean).join('\n\n') }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = m.content.filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      // An assistant turn with neither text nor calls would go out as
      // content: null, which these endpoints answer with a 400. Drop it, as
      // the Anthropic adapter drops an empty turn.
      if (!text && !calls.length) continue;
      const msg = { role: 'assistant', content: text || null };
      // Replay reasoning from threads saved by the former native Ollama adapter.
      const reasoning = m.raw?.reasoning_content ?? m.raw?.thinking;
      if (typeof reasoning === 'string') msg.reasoning_content = reasoning;
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
      continue;
    }
    const results = m.content.filter((b) => b.type === 'tool_result');
    if (results.length) {
      for (const r of results) out.push({ role: 'tool', tool_call_id: r.id, content: r.text });
      continue;
    }
    out.push({ role: 'user', content: m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') });
  }
  const body = { model, stream: true, stream_options: { include_usage: true }, messages: out };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    body.tool_choice = 'auto';
  }
  return body;
}

export function createOpenAIAccumulator(onText) {
  let text = '';
  let reasoning = '';
  const calls = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let finish = null;
  let failure = null;
  // Thrown from push so readStream cancels the reader: accumulation stops
  // at the cap instead of growing until the stream ends.
  const overflow = (message) => { failure = failure || new ProviderError(message, { code: 'request' }); throw failure; };
  return {
    push(chunk) {
      if (chunk === '[DONE]' || typeof chunk !== 'object' || !chunk) return;
      if (chunk.error) {
        failure = mapHttpError(Number(chunk.error.code) || 0, chunk, 'The endpoint');
        return;
      }
      if (chunk.usage) {
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
        usage.input = (chunk.usage.prompt_tokens || 0) - cached;
        usage.cacheRead = cached;
        usage.output = chunk.usage.completion_tokens || 0;
      }
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const d = choice.delta || {};
      if (d.reasoning_content) {
        reasoning += d.reasoning_content;
        if (reasoning.length > MAX_STREAM_TEXT) overflow(tr('The reply exceeded 2 MB of text; ask for a shorter answer.'));
      }
      if (d.content) {
        text += d.content;
        if (text.length > MAX_STREAM_TEXT) overflow(tr('The reply exceeded 2 MB of text; ask for a shorter answer.'));
        onText?.(d.content);
      }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? calls.length;
        calls[i] = calls[i] || { id: '', name: '', args: '' };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name = tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        if (calls[i].args.length > MAX_TOOL_INPUT) overflow(tr('A tool call input exceeded 256 KB; split the work into smaller batches.'));
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    },
    result() {
      if (failure) throw failure;
      if (!finish) throw new ProviderError(tr('The response stream ended before the reply completed. Try again.'), { code: 'network' });
      if (finish === 'error') throw new ProviderError(tr('The provider failed while streaming the reply.'));
      // Arguments that do not parse are the model's mistake, not a broken
      // stream: the call is surfaced with input null and an inputError so the
      // agent can answer it with an error result and let the model retry.
      const toolCalls = (finish === 'length' || finish === 'content_filter' ? [] : calls.filter(Boolean)).map((c, i) => {
        const call = { id: c.id || `call_${i}`, name: c.name, input: {} };
        if (!c.args.trim()) return call;
        try { call.input = JSON.parse(c.args); } catch (err) { call.input = null; call.inputError = err.message; }
        return call;
      });
      let stop = STOP[finish] || 'end';
      if (toolCalls.length && stop === 'end') stop = 'tool_use';
      return { text, toolCalls, usage, stop, ...(reasoning ? { raw: { reasoning_content: reasoning } } : {}) };
    },
  };
}

function headers(apiKey) {
  const h = { 'content-type': 'application/json' };
  if (apiKey) h.authorization = `Bearer ${apiKey}`;
  return h;
}

export function openaiProvider({ baseUrl, apiKey, model, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return {
    async chat({ system, messages, tools, signal, onText }) {
      let res;
      try {
        res = await providerFetch(`${base}/chat/completions`, {
          method: 'POST', headers: headers(apiKey), signal,
          body: JSON.stringify(toOpenAIRequest({ model, system, messages, tools })),
        }, fetchImpl);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw networkError('the endpoint', err, base);
      }
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'The endpoint');
      const acc = createOpenAIAccumulator(onText);
      try {
        await readStream(res, sseParser((e) => acc.push(e.data)));
      } catch (err) {
        // A stream that breaks mid-reply is a network failure; a parser that
        // threw already carries its own ProviderError.
        if (err?.name === 'AbortError' || err instanceof ProviderError) throw err;
        throw networkError('the endpoint', err, base);
      }
      return acc.result();
    },
  };
}

export async function listOpenAIModels({ baseUrl, apiKey, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  let res;
  try { res = await providerFetch(`${base}/models`, { headers: headers(apiKey) }, fetchImpl); } catch (err) { throw networkError('the endpoint', err, base); }
  if (!res.ok) throw mapHttpError(res.status, await res.text(), 'The endpoint');
  const j = await res.json();
  return (j.data || []).map((m) => m.id).filter(Boolean).sort();
}
