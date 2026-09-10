// Provider settings and the key. Storage is injected (localStorage in the
// browser, a Map in tests) and every access is guarded: storage may be
// blocked. The key lives in memory unless "remember" is ticked, and never
// touches the document, autosave, share links, or exports.
import { BACKEND } from './runtime.js';

// Each provider names the adapter that speaks its wire format (`anthropic`,
// `openai` for every chat-completions endpoint), its public base URL,
// whether a key is needed, a default model, and a few suggested model ids for the settings form. Endpoints and
// model names were taken from the vendors' documentation in September 2026;
// "List models" fetches the live catalogue where the endpoint offers one.
// ollama.com answers a CORS preflight with 405 and api.moonshot.ai sends no
// allow-origin header (both verified 2026-09-06), so no browser page can call
// them directly. On static hosting those providers use the relay in relay/: a small
// Cloudflare Worker that forwards the request, key included, and adds the
// headers. This is the deployment's own relay; the Base URL field takes any
// other (relay/README.md deploys one in two commands).
export const RELAY = 'https://schematica-relay.henrycooper86.workers.dev';

// Move only our former default relay URLs to the official provider when
// running on the backend. User-supplied endpoints retain their exact route.
export function backendBaseUrl(baseUrl, backend = BACKEND) {
  if (!backend || !baseUrl) return baseUrl;
  const base = baseUrl.replace(/\/+$/, '');
  if (base === `${RELAY}/ollama.com` || base === `${RELAY}/ollama.com/v1`) return 'https://ollama.com/v1';
  if (base === `${RELAY}/api.moonshot.ai/v1`) return 'https://api.moonshot.ai/v1';
  return baseUrl;
}

export const BACKEND_HELP = {
  openai: 'For Ollama Cloud, use https://ollama.com/v1 and your Ollama API key. The website server connects to the provider and streams the reply. Use List models to choose a model. Custom Base URLs must be enabled by the server operator.',
  kimi: 'Moonshot\'s Kimi models through this website\'s server. Base URL: https://api.moonshot.ai/v1. Keys come from platform.kimi.ai.',
};

export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)', adapter: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5', needsKey: true,
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    help: 'Keys come from console.anthropic.com. Claude Opus 5 is the default; Sonnet 5 is cheaper, Haiku 4.5 runs without adaptive thinking.',
  },
  openai: {
    name: 'OpenAI-compatible', adapter: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', needsKey: true,
    models: [],
    help: BACKEND
      ? BACKEND_HELP.openai
      : `Any chat-completions endpoint with function calling. For Ollama Cloud, use ${RELAY}/ollama.com/v1, a key from ollama.com/settings/keys, and a model such as glm-5.3. Local Ollama: http://localhost:11434/v1, key "ollama", with OLLAMA_ORIGINS set to this site's origin. "List models" fetches the catalogue.`,
  },
  openrouter: {
    name: 'OpenRouter', adapter: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: '', needsKey: true,
    models: [],
    help: 'One key for hundreds of models; "List models" fetches the catalogue. Keys come from openrouter.ai/keys.',
  },
  zai: {
    name: 'Z.AI (GLM)', adapter: 'openai', baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-5.3', needsKey: true,
    models: ['glm-5.3', 'glm-4.6', 'glm-4.5', 'glm-4.5-Air'],
    help: 'Z.AI\'s GLM models over their OpenAI-compatible endpoint. Keys come from z.ai.',
  },
  kimi: {
    name: 'Kimi (Moonshot)', adapter: 'openai', baseUrl: BACKEND ? 'https://api.moonshot.ai/v1' : `${RELAY}/api.moonshot.ai/v1`, model: 'kimi-k3', needsKey: true,
    models: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code'],
    help: BACKEND
      ? BACKEND_HELP.kimi
      : 'Moonshot\'s Kimi models over their OpenAI-compatible endpoint, through the relay because api.moonshot.ai does not answer browser requests. Keys come from platform.kimi.ai.',
  },
};
export const EFFORTS = ['low', 'medium', 'high'];
export const SETTINGS_KEY = 'schematica.ai.settings';
export const THREAD_KEY = 'schematica.ai.thread';
export const keyStorageKey = (provider) => `schematica.ai.key.${provider}`;

// Dollars per million tokens. An estimate: the panel labels it as one.
const PRICES = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export function estimateCost(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) / 1e6;
}

const DEFAULTS = { provider: 'anthropic', model: '', baseUrl: '', effort: 'medium', remember: false, tools: null };

// Keep migrated credentials in their old slot so an existing OpenAI key is
// never overwritten. Only this migration may select the legacy key slot.
function migrateSettings(s) {
  const baseUrl = backendBaseUrl(s.baseUrl);
  if (baseUrl !== s.baseUrl) s = { ...s, baseUrl, tools: null };
  if (s.provider !== 'ollamacloud') return s;
  const base = (s.baseUrl || (BACKEND ? 'https://ollama.com' : `${RELAY}/ollama.com`)).replace(/\/+$/, '');
  return { ...s, provider: 'openai', model: s.model || 'glm-5.3', baseUrl: base.endsWith('/v1') ? base : `${base}/v1`, keyProvider: 'ollamacloud', tools: null };
}

export function createSettings(storage) {
  // A browser with site data blocked throws on `window.localStorage` itself,
  // so the caller passes null; every access here tolerates that.
  const read = (k) => { try { return storage && storage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { storage && storage.setItem(k, v); } catch { /* blocked storage: the session still works */ } };
  const remove = (k) => { try { storage && storage.removeItem(k); } catch { /* same */ } };

  // Read on every call: a test may seed storage after the page loaded, and
  // another tab may have changed it. Without storage (site data blocked) the
  // patches live in `memory` for the session; with storage, `memory` stays
  // empty so a seeded value is never shadowed.
  let memory = {};
  const readStored = () => { try { return migrateSettings({ ...(JSON.parse(read(SETTINGS_KEY) || '{}') || {}), ...memory }); } catch { return migrateSettings({ ...memory }); } };
  const memoryKeys = {};

  function get() {
    const s = { ...DEFAULTS, ...readStored() };
    const p = PROVIDERS[s.provider] || PROVIDERS.anthropic;
    if (!PROVIDERS[s.provider]) s.provider = 'anthropic';
    if (!s.model) s.model = p.model;
    if (!s.baseUrl) s.baseUrl = p.baseUrl;
    if (!EFFORTS.includes(s.effort)) s.effort = 'medium';
    return s;
  }

  function set(patch) {
    const current = get();
    let next = { ...readStored(), ...patch };
    // Editing this connection's URL must retain ownership of its key slot.
    // The UI loads another key only when the provider selection changes.
    if (Object.hasOwn(patch, 'provider') && patch.provider !== current.provider) delete next.keyProvider;
    next = migrateSettings(next);
    if (!Object.hasOwn(patch, 'tools') && ['provider', 'model', 'baseUrl', 'effort'].some((k) => Object.hasOwn(patch, k) && patch[k] !== current[k])) next.tools = null;
    let stored = false;
    try { if (storage) { storage.setItem(SETTINGS_KEY, JSON.stringify(next)); stored = true; } } catch { /* blocked or full */ }
    if (!stored) memory = next;
  }

  function keyProvider() {
    const s = get();
    return s.provider === 'openai' && s.keyProvider === 'ollamacloud' ? 'ollamacloud' : s.provider;
  }

  function getKey() {
    const provider = keyProvider();
    if (memoryKeys[provider] !== undefined) return memoryKeys[provider];
    return get().remember ? (read(keyStorageKey(provider)) || '') : '';
  }

  function setKey(key, remember) {
    const provider = keyProvider();
    if (key !== getKey()) set({ tools: null });
    memoryKeys[provider] = key;
    set({ remember: !!remember });
    if (remember && key) write(keyStorageKey(provider), key);
    else remove(keyStorageKey(provider));
  }

  function forgetKey() {
    const provider = keyProvider();
    memoryKeys[provider] = '';
    remove(keyStorageKey(provider));
    set({ tools: null });
  }

  function configured() {
    const s = get();
    if (!s.model) return false;
    return !PROVIDERS[s.provider].needsKey || !!getKey();
  }

  return { get, set, getKey, setKey, forgetKey, configured };
}
