const ROLES = ['user', 'assistant', 'status', 'error'];
const USAGE = ['input', 'output', 'cacheRead', 'cacheWrite'];
export function trimHistory(history, max = 40) {
  if (history.length <= max) return history;
  let start = history.length - max;
  while (start < history.length && !(history[start].role === 'user' && history[start].content.some(b => b.type === 'text'))) start++;
  return history.slice(start);
}
export function encodeThread(history, visible, totals) {
  return JSON.stringify({ history: trimHistory(history), visible: visible.slice(-80).map(({ undoSnap, ...message }) => message),
    totals: Object.fromEntries(USAGE.map(key => [key, Number.isFinite(totals[key]) && totals[key] >= 0 ? totals[key] : 0])) });
}
export function decodeThread(text) {
  try {
    const t = JSON.parse(text || 'null');
    if (!t || !Array.isArray(t.history) || !Array.isArray(t.visible)
      || !t.history.every(m => m && typeof m.role === 'string' && Array.isArray(m.content))
      || !t.visible.every(m => m && ROLES.includes(m.role) && typeof m.text === 'string')) return null;
    return JSON.parse(encodeThread(t.history, t.visible, t.totals || {}));
  } catch { return null; }
}
