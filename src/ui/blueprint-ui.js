import { BLUEPRINT_FIELDS, BLUEPRINT_LISTS, validateBlueprint } from '../blueprint.js';
import { escAttr as esc, openModal } from './press.js';
import { tr, trd } from '../i18n.js';

export function blueprintMarkup(value) {
  if (!value) return `<p>${esc(tr('No Blueprint saved yet.'))}</p>`;
  return Object.entries(BLUEPRINT_FIELDS).map(([key, label]) => `<section><h4>${esc(trd(label))}</h4>${Array.isArray(value[key])
    ? `<ul>${value[key].map(row => `<li>${esc(row)}</li>`).join('')}</ul>`
    : `<p>${esc(value[key] || '')}</p>`}</section>`).join('');
}
export function showBlueprint(store) {
  const original = JSON.stringify(store.doc.blueprint), generation = store.generation;
  const dialog = document.createElement('dialog');
  dialog.id = 'blueprint-dialog';
  dialog.className = 'workflow-dialog';
  dialog.setAttribute('aria-labelledby', 'blueprint-heading');
  dialog.innerHTML = `<h2 id="blueprint-heading">${esc(tr('Blueprint'))}</h2><p>${esc(tr('Describe the project once. Use it to build flows and presentations. Lists use one entry per line.'))}</p><form><div class="blueprint-fields">
    ${Object.entries(BLUEPRINT_FIELDS).map(([key, label]) => `<label>${esc(trd(label))}<textarea name="${key}" rows="${BLUEPRINT_LISTS.includes(key) ? 3 : 2}" ${key === 'goal' ? 'required' : ''}>${esc(Array.isArray(store.doc.blueprint?.[key]) ? store.doc.blueprint[key].join('\n') : store.doc.blueprint?.[key] || '')}</textarea></label>`).join('')}
    </div><p role="status"></p><footer><button type="button" data-close>${esc(tr('Cancel'))}</button><button type="submit">${esc(tr('Save Blueprint'))}</button></footer></form>`;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = e => {
    e.preventDefault();
    try {
      if (generation !== store.generation || original !== JSON.stringify(store.doc.blueprint)) throw new Error(tr('The board changed. Reopen the Blueprint.'));
      const entries = Object.fromEntries(new FormData(e.target));
      for (const key of BLUEPRINT_LISTS) entries[key] = entries[key].split('\n').map(s => s.trim()).filter(Boolean);
      const blueprint = validateBlueprint(entries);
      store.apply(doc => { doc.blueprint = blueprint; });
      dialog.close();
    } catch (error) { dialog.querySelector('[role=status]').textContent = error.message; }
  };
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  openModal(dialog);
}
