import { tr } from '../i18n.js';

// Store changed fields only: fresh saved values (including undo) stay authoritative.
// Drafts deliberately live only in this tab, never in the board or revision history.
export function createFormDrafts(repaint) {
  const drafts = new Map(), latest = new Map();
  let mounted = [], bindings = new WeakMap();
  const fields = form => [...form.elements].filter(el => el.name && !['file', 'submit', 'button'].includes(el.type) && !el.hasAttribute('data-draft-ignore'));
  const value = el => el.type === 'checkbox' || el.type === 'radio' ? el.checked
    : el.multiple ? [...el.selectedOptions].map(option => option.value) : el.value;
  const identity = el => JSON.stringify([el.name, ['checkbox', 'radio'].includes(el.type) ? el.value : '']);
  const snapshot = form => new Map(fields(form).map(el => [identity(el), value(el)]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function captureOne(binding) {
    const current = snapshot(binding.form), patch = new Map();
    for (const [key, val] of current) if (!same(val, binding.baseline.get(key))) patch.set(key, val);
    if (patch.size) {
      for (const el of fields(binding.form).filter(el => el.hasAttribute('data-draft-sticky'))) patch.set(identity(el), value(el));
      drafts.set(binding.key, patch);
    } else drafts.delete(binding.key);
    binding.status.textContent = patch.size ? tr('Unsaved draft — kept in this tab') : tr('No unsaved changes');
    binding.discard.hidden = !patch.size;
  }
  function commit(form, submitted) {
    const previous = bindings.get(form), binding = previous && latest.get(previous.key);
    if (!binding) return;
    drafts.delete(binding.key);
    binding.baseline = submitted || snapshot(form);
    captureOne(binding);
  }
  return {
    capture() { mounted.forEach(captureOne); },
    snapshot,
    commit,
    clear() { drafts.clear(); latest.clear(); bindings = new WeakMap(); mounted = []; },
    hasChanges() { mounted.forEach(captureOne); return drafts.size > 0; },
    mount(body, context) {
      mounted = [...body.querySelectorAll('form')].map((form, index) => {
        const key = JSON.stringify([context, form.closest('[data-review]')?.dataset.review || form.id || index]);
        form.dataset.draftKey = key;
        const baseline = snapshot(form), patch = drafts.get(key);
        fields(form).forEach(el => {
          el.dataset.draftField = identity(el);
          if (!patch?.has(identity(el))) return;
          const next = patch.get(identity(el));
          if (['checkbox', 'radio'].includes(el.type)) el.checked = next;
          else if (el.multiple) [...el.options].forEach(option => { option.selected = next.includes(option.value); });
          else el.value = next;
        });
        [...form.querySelectorAll('button')].filter(el => el.type === 'submit').forEach((el, i) => { el.dataset.draftSubmit = i; });
        const notice = document.createElement('div'); notice.className = 'engineering-draft';
        const status = document.createElement('span'); status.setAttribute('role', 'status');
        const discard = document.createElement('button'); discard.type = 'button'; discard.dataset.draftDiscard = '';
        discard.textContent = tr('Discard draft'); notice.append(status, discard); form.prepend(notice);
        const binding = { key, form, baseline, status, discard };
        bindings.set(form, binding); latest.set(key, binding);
        discard.onclick = () => { commit(form); repaint(); };
        form.addEventListener('input', () => captureOne(binding));
        form.addEventListener('change', () => captureOne(binding));
        captureOne(binding);
        if (patch?.size) form.dispatchEvent(new Event('input', { bubbles: true }));
        form.dispatchEvent(new Event('draftrestore'));
        return binding;
      });
    },
  };
}
