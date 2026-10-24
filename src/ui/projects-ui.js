// The Projects menu beside the board title: every board kept in this browser,
// which one is open, when each was last backed up to a file, and the switch,
// create and remove actions. A switch flushes the autosave, records the new
// active project and reloads the page, so every storage-backed module starts
// clean on the new project's own slot and history; nothing leaks between them.
import { toast, escAttr as esc } from './press.js';
import { tr, onLanguageChange } from '../i18n.js';

export function initProjects({ projects, store, navigation, revisions, autosave, engineering, reload = () => location.reload() }) {
  const title = document.getElementById('title');
  const button = document.createElement('button');
  button.id = 'btn-projects';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.2l1.6 1.8h6.2A1.5 1.5 0 0 1 16 7.3v5.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 12.5z"/></svg><span class="projects-count" aria-hidden="true"></span>';
  title.after(button);
  const menu = document.createElement('div');
  menu.id = 'projects-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  let dismiss = null;

  const label = () => {
    const count = projects.list().length;
    button.title = tr('Projects on this device ({count})', { count });
    button.setAttribute('aria-label', button.title);
    button.querySelector('.projects-count').textContent = count > 1 ? String(count) : '';
  };
  const when = at => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const backupText = p => {
    const state = p.active ? projects.backupState(navigation.rootDoc()) : p.backup ? 'current' : 'none';
    if (state === 'none') return tr('No file backup');
    if (state === 'stale') return tr('Changed since the file backup of {time}', { time: when(p.backup.at) });
    return tr('Backed up to a file {time}', { time: when(p.backup.at) });
  };
  function close() {
    menu.hidden = true; menu.innerHTML = '';
    button.setAttribute('aria-expanded', 'false');
    if (dismiss) { window.removeEventListener('pointerdown', dismiss); dismiss = null; }
  }
  // Leave the current project cleanly: no pending autosave, no unsaved
  // Engineering drafts, no share-link hash to replay after the reload.
  const leave = () => {
    if (engineering?.confirmDiscardDrafts() === false) return false;
    autosave.flush();
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  };
  function open() {
    projects.reload();
    const list = projects.list();
    menu.innerHTML = `<div class="menu-group">${esc(tr('Projects on this device'))}</div>`
      + list.map(p => `<button type="button" role="menuitemradio" data-project="${esc(p.id)}" aria-checked="${p.active}"><span class="example-name">${esc(p.title)}</span><small>${esc(p.active ? tr('Open now') : tr('Edited {time}', { time: when(p.updatedAt) }))} · ${esc(backupText(p))}</small></button>`).join('')
      + `<div class="menu-group">${esc(tr('Actions'))}</div>
      <button type="button" role="menuitem" data-project-new>${esc(tr('New project'))}</button>
      <button type="button" role="menuitem" data-project-remove${list.length > 1 ? '' : ' disabled'}>${esc(tr('Remove this project from the browser…'))}</button>
      <p>${esc(tr('Each project keeps its own board, autosave and revisions in this browser. Only a saved file leaves the browser.'))}</p>`;
    const r = button.getBoundingClientRect();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const gap = 8;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(gap, Math.min(r.left, window.innerWidth - bounds.width - gap))}px`;
    menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - bounds.height - gap)}px`;
    menu.querySelectorAll('[data-project]').forEach(b => b.onclick = () => {
      const id = b.dataset.project;
      close();
      if (id === projects.activeId()) return;
      try { if (!leave()) return; projects.switchTo(id); reload(); }
      catch (error) { toast(error.message); }
    });
    menu.querySelector('[data-project-new]').onclick = () => {
      close();
      try { if (!leave()) return; projects.create(tr('Untitled Board')); reload(); }
      catch (error) { toast(error.message); }
    };
    menu.querySelector('[data-project-remove]').onclick = async () => {
      close();
      const current = projects.active();
      if (!confirm(tr('Remove "{title}" from this browser? Its board and revisions are deleted; only a saved file keeps it.', { title: current.title }))) return;
      try {
        if (!leave()) return;
        const id = current.id;
        projects.remove(id);
        await revisions.purge(id);
        reload();
      } catch (error) { toast(error.message); }
    };
    menu.querySelector(`[data-project="${projects.activeId()}"]`)?.focus();
    setTimeout(() => {
      dismiss = ev => { if (!menu.contains(ev.target) && !button.contains(ev.target)) close(); };
      window.addEventListener('pointerdown', dismiss);
    }, 0);
  }
  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  window.addEventListener('resize', close);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
  // The registry mirrors the open board's title and last edit.
  store.subscribe(() => { if (!store.isDragging()) { projects.touch(navigation.rootDoc()); label(); } }, { documentOnly: true });
  document.addEventListener('schematica:board-saved', () => { projects.markBackup(navigation.rootDoc()); });
  onLanguageChange(label);
  label();
  return { open, close };
}
