import { PROVIDERS } from '../settings.js';
import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { tr } from '../../i18n.js';

// A provider is a vendor entry in PROVIDERS; its `adapter` names the wire
// format, so several vendors share one adapter (Z.AI, Kimi, and OpenRouter
// all speak chat completions, as does Ollama via OpenAI-compatible settings).
export function makeProvider(settings, key, fetchImpl = globalThis.fetch) {
  const { provider, model, baseUrl, effort } = settings;
  const entry = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : null;
  const adapter = entry?.adapter;
  // A provider that needs no key never gets one on the wire.
  const apiKey = entry?.needsKey ? key : '';
  if (adapter === 'anthropic') return anthropicProvider({ baseUrl, apiKey, model, effort, fetchImpl });
  if (adapter === 'openai') return openaiProvider({ baseUrl, apiKey, model, fetchImpl });
  throw new Error(tr('unknown provider "{provider}"', { provider }));
}

// Does this model call tools? Ask it to call one; a model that answers in
// text instead gets the single-shot mode.
export async function probeTools(provider, signal = AbortSignal.timeout(30000)) {
  const res = await provider.chat({
    signal,
    system: ['You are a test harness. Call the ping tool now and say nothing else.'],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Call ping.' }] }],
    tools: [{ name: 'ping', description: 'Replies pong.', input_schema: { type: 'object', properties: {}, additionalProperties: false }, strict: true }],
  });
  if (res.stop !== 'end' && res.stop !== 'tool_use') throw new Error(tr('The connection test did not complete ({stop}); try again.', { stop: res.stop }));
  return res.toolCalls.some((c) => c.name === 'ping');
}
