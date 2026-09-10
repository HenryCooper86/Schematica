// One user message, start to finish: call the provider, run the tool calls
// it makes, feed the results back, repeat until it stops or the round cap
// hits. Everything applied in reply to the message is one store batch, so
// one undo step. Providers speak the internal message format documented in
// the spec; adapters translate to the wire.
import { TOOLS, statusLine } from './tools.js';
import { tr } from '../i18n.js';

// Twelve: a tool-heavy build with a model that fumbles a batch or two still
// reaches its closing run_checks (acceptance with glm-5.3 hit the old cap of
// eight on the final check in two runs out of three).
export const MAX_ROUNDS = 12;

function addUsage(total, u = {}) {
  total.input += u.input || 0;
  total.output += u.output || 0;
  total.cacheRead += u.cacheRead || 0;
  total.cacheWrite += u.cacheWrite || 0;
}

// This private block tag is never wire metadata: adapters rebuild text blocks.
// Filter by ownership, not delimiters that ordinary conversation may contain.
function userContent(userText, boardText, documentText) {
  const content = [{ type: 'text', text: `${userText}\n\n---\n${boardText}` }];
  if (documentText) content.push({ type: 'text', text: documentText, assistantDocument: true });
  return content;
}
function withoutDocuments(messages) {
  return messages.map(m => ({ ...m, content: m.content.filter(b => b.assistantDocument !== true) }));
}

export async function runRequest({
  provider, executor, system, history = [], userText, boardText, documentText = '',
  store = null, signal = null, onText = null, onStatus = null, maxRounds = MAX_ROUNDS,
}) {
  const messages = [
    ...history,
    { role: 'user', content: userContent(userText, boardText, documentText) },
  ];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let text = '';
  let stop = 'end';
  let stopDetails = null;
  let cutOff = false;
  let applied = 0;
  let rounds = 0;
  let error;
  executor.resetTouched();
  store?.beginBatch();
  try {
    for (let round = 0; round < maxRounds; round++) {
      rounds = round + 1;
      const res = await provider.chat({ system, messages, tools: TOOLS, signal, onText });
      addUsage(usage, res.usage);
      const content = [];
      if (res.text) {
        content.push({ type: 'text', text: res.text });
        text += (text ? '\n\n' : '') + res.text;
      }
      const calls = res.toolCalls || [];
      for (const tc of calls) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      messages.push({ role: 'assistant', content, raw: res.raw });
      stop = res.stop;
      stopDetails = res.stopDetails || null;
      if (stop === 'max_tokens') cutOff = true;
      if (!calls.length) break;
      // Every tool_use gets a tool_result, or the history is unusable for the
      // next request: calls the model made before being cut off are answered
      // with an error instead of being run, and a tool that throws (a bug in
      // our own code) is answered with an error and then reported.
      const results = [];
      let failure = null;
      for (const tc of calls) {
        if (stop !== 'tool_use') {
          results.push({ type: 'tool_result', id: tc.id, text: `Not run: the reply stopped before this call completed (${stop}).`, isError: true });
          continue;
        }
        // Arguments the adapter could not parse: tell the model so it can
        // send the call again rather than ending the turn on a SyntaxError.
        if (tc.inputError) {
          results.push({ type: 'tool_result', id: tc.id, text: `Not run: the arguments for ${tc.name} were not valid JSON (${tc.inputError}). Call the tool again with valid JSON arguments.`, isError: true });
          continue;
        }
        let r;
        try {
          onStatus?.(statusLine(tc.name, tc.input));
          r = executor.run(tc.name, tc.input);
        } catch (err) {
          failure = failure || err;
          r = { text: `Tool ${tc.name} failed: ${err?.message || err}`, isError: true };
        }
        if (tc.name === 'apply_edits' && !r.isError) applied += 1;
        results.push({ type: 'tool_result', id: tc.id, text: r.text, isError: !!r.isError });
      }
      messages.push({ role: 'user', content: results });
      if (failure) throw failure;
      if (stop !== 'tool_use') break;
      if (round === maxRounds - 1) { cutOff = true; stop = 'rounds'; }
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      stop = 'aborted';
      cutOff = true;
    } else {
      error = err;
    }
  } finally {
    store?.endBatch();
  }
  return { text, messages: withoutDocuments(messages), touched: new Set(executor.touched), usage, stop, stopDetails, rounds, applied, cutOff, error };
}

// The first {...} that parses, fences stripped: models without tool calling
// are asked for one JSON object and tend to wrap it in prose anyway.
export function extractJson(text) {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

// For a provider whose probe showed no tool calling: one reply carrying
// { summary, ops }, one repair round if it is not JSON, then the ops go
// through apply_edits like any other batch.
export async function runSingleShot({
  provider, executor, system, history = [], userText, boardText, documentText = '',
  store = null, signal = null, onText = null, onStatus = null,
}) {
  const messages = [
    ...history,
    { role: 'user', content: userContent(userText, boardText, documentText) },
  ];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let text = '';
  let stop = 'end';
  let stopDetails = null;
  let applied = 0;
  let rounds = 0;
  let error;
  executor.resetTouched();
  store?.beginBatch();
  try {
    let plan = null;
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      rounds += 1;
      const res = await provider.chat({ system, messages, tools: [], signal, onText: attempt === 0 ? onText : null });
      addUsage(usage, res.usage);
      messages.push({ role: 'assistant', content: res.text ? [{ type: 'text', text: res.text }] : [], raw: res.raw });
      stop = res.stop;
      stopDetails = res.stopDetails || null;
      if (stop !== 'end') { text = res.text || ''; break; }
      plan = extractJson(res.text);
      if (!plan || !Array.isArray(plan.ops)) {
        plan = null;
        if (attempt === 0) {
          messages.push({ role: 'user', content: [{ type: 'text', text: 'Your reply was not valid JSON. Reply with only the JSON object: {"summary": "...", "ops": [...]}.' }] });
        }
      }
    }
    if (stop === 'end') {
      if (!plan) throw new Error(tr('The model did not return a valid plan.'));
      text = String(plan.summary || '').trim();
      if (plan.ops.length) {
        onStatus?.(statusLine('apply_edits', { ops: plan.ops }));
        const r = executor.run('apply_edits', { ops: plan.ops });
        if (r.isError) text += tr('\n\nThe edits were rejected:\n{list}', { list: r.text.replace(/^Batch rejected, nothing applied:\n/, '') });
        else applied += 1;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) stop = 'aborted';
    else error = err;
  } finally {
    store?.endBatch();
  }
  return { text, messages: withoutDocuments(messages), touched: new Set(executor.touched), usage, stop, stopDetails, rounds, applied, cutOff: stop === 'aborted' || stop === 'max_tokens', error };
}
