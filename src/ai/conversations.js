import { decodeThread, trimHistory } from './session.js';

export const CONVERSATION_PREFIX = 'schematica.ai.conversation.';
export const ACTIVE_CONVERSATION_KEY = 'schematica.ai.active-conversation';
const LEGACY_KEY = 'schematica.ai.thread';
const ROLES = new Set(['user', 'assistant', 'status', 'error']);
const USAGE = ['input', 'output', 'cacheRead', 'cacheWrite'];
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id);
const timestamp = value => Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : 0;
const title = ({ visible, draft }) => (visible.find(m => m.role === 'user')?.text || draft || '').replace(/\s+/g, ' ').trim().slice(0, 100);
function normalize(value) {
  if (!value || value.version !== 1 || !validId(value.id) || !Array.isArray(value.visible)
    || !value.visible.every(m => m && ROLES.has(m.role) && typeof m.text === 'string')) return null;
  const record = {
    version: 1, id: value.id,
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
    boardTitle: typeof value.boardTitle === 'string' ? value.boardTitle.slice(0, 300) : '',
    draft: typeof value.draft === 'string' ? value.draft : '',
    // A reopened conversation has no authority over old board IDs or undo
    // snapshots. Provider payloads, keys and attachment bytes are not archived.
    visible: value.visible.map(({ role, text }) => ({ role, text })),
    totals: Object.fromEntries(USAGE.map(key => [key, Number.isFinite(value.totals?.[key]) && value.totals[key] >= 0 ? value.totals[key] : 0])),
  };
  record.title = title(record);
  return record;
}

// One key per conversation avoids replacing another tab's independent sessions.
// Quota failures retain every old record and the new content in this tab's memory.
export function createConversationStore(storage) {
  let memory = new Map(), active = null, readFailed = false, metadataFailed = false;
  const unsaved = new Set();
  function refresh() {
    if (!storage) return;
    try {
      const disk = new Map();
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(CONVERSATION_PREFIX)) continue;
        const raw = storage.getItem(key);
        try {
          const value = normalize(JSON.parse(raw));
          if (value && key === CONVERSATION_PREFIX + value.id) disk.set(value.id, value);
        } catch { /* skip only the malformed record */ }
      }
      for (const id of unsaved) if (memory.has(id)) disk.set(id, memory.get(id));
      memory = disk; readFailed = false;
    } catch { readFailed = true; }
  }
  const get = id => { refresh(); const value = memory.get(id); return value ? structuredClone(value) : null; };
  function activate(id) {
    active = id;
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (id) storage.setItem(ACTIVE_CONVERSATION_KEY, id);
      else storage.removeItem(ACTIVE_CONVERSATION_KEY);
      metadataFailed = false;
    } catch { metadataFailed = true; }
  }
  function save(value) {
    if (!value.visible?.length && !value.draft?.trim()) return null;
    const previous = validId(value.id) ? get(value.id) : null;
    const now = Date.now();
    const record = normalize({ ...value, version: 1, id: previous?.id || (validId(value.id) ? value.id : crypto.randomUUID()), createdAt: previous?.createdAt || now, updatedAt: now });
    if (!record) return null;
    memory.set(record.id, record);
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(CONVERSATION_PREFIX + record.id, JSON.stringify(record));
      unsaved.delete(record.id);
    } catch { unsaved.add(record.id); }
    activate(record.id);
    return structuredClone(record);
  }
  refresh();
  try { active = storage?.getItem(ACTIVE_CONVERSATION_KEY) || null; } catch { readFailed = true; }
  try {
    const legacy = decodeThread(storage?.getItem(LEGACY_KEY));
    if (legacy?.visible.length) {
      const record = get('legacy') || save({ ...legacy, id: 'legacy' });
      if (record && !unsaved.has(record.id) && !metadataFailed) storage.removeItem(LEGACY_KEY);
    }
  } catch { readFailed = true; }
  return {
    get, save, activate,
    current: () => get(active),
    clearActive: () => activate(null),
    list() { refresh(); return [...memory.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).map(value => structuredClone(value)); },
    failed: () => readFailed || metadataFailed || unsaved.size > 0,
    remove(id) {
      if (!validId(id)) return false;
      try { storage?.removeItem(CONVERSATION_PREFIX + id); }
      catch { metadataFailed = true; return false; }
      memory.delete(id); unsaved.delete(id);
      if (active === id) activate(null);
      return true;
    },
  };
}

// Resume from the visible transcript only. Stale tool calls, provider-specific
// reasoning blocks and old board snapshots cannot cross sessions/providers.
export function conversationContext(visible) {
  const messages = visible.filter(m => (m.role === 'user' || m.role === 'assistant') && m.text.trim())
    .map(({ role, text }) => ({ role, content: [{ type: 'text', text }] }));
  const firstUser = messages.findIndex(m => m.role === 'user');
  return firstUser < 0 ? [] : trimHistory(messages.slice(firstUser));
}
