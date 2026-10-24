// The local project registry: which boards live in this browser, which one is
// open, and when each was last backed up to a file. Each project has a stable
// id, its own autosave slot and its own revision history. The browser slot that
// existed before projects (`schematica.autosave`, revisions without a project)
// becomes the project `main`, so nothing a user already has moves or changes key.
import { designFingerprint } from './workflows.js';
import { deserialize } from './serialize.js';
import { uid } from './state.js';

export const REGISTRY_KEY = 'schematica.projects';
const LEGACY_PROJECT = 'main';
export const LEGACY_SLOT = 'schematica.autosave';
export const slotFor = id => (id === LEGACY_PROJECT ? LEGACY_SLOT : `${LEGACY_SLOT}.${id}`);
const MAX_PROJECTS = 50;

const validProject = p => p && typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) && typeof p.title === 'string';
const titleOf = text => { try { return deserialize(text).doc.title; } catch { return ''; } };

export function createProjects(storage, { now = Date.now, untitled = () => 'Untitled Board', onError = () => {} } = {}) {
  let registry = null, readError = false;
  const read = () => {
    try {
      const raw = storage?.getItem(REGISTRY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const projects = (Array.isArray(parsed.projects) ? parsed.projects : []).filter(validProject);
        if (projects.length) return { active: projects.some(p => p.id === parsed.active) ? parsed.active : projects[0].id, projects };
      }
    } catch (error) { readError = true; onError(error); }
    return null;
  };
  const write = () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(REGISTRY_KEY, JSON.stringify(registry));
      return true;
    } catch (error) { onError(error); return false; }
  };
  // First run: adopt whatever the single slot holds as the project `main`.
  registry = read();
  if (!registry) {
    let title = '';
    try { title = titleOf(storage?.getItem(LEGACY_SLOT) || ''); } catch { /* unreadable slot stays where it is */ }
    registry = { active: LEGACY_PROJECT, projects: [{ id: LEGACY_PROJECT, title: title || untitled(), createdAt: now(), updatedAt: now(), backup: null }] };
    if (!readError) write();
  }
  const find = id => registry.projects.find(p => p.id === id);
  const active = () => find(registry.active);
  return {
    activeId: () => registry.active,
    active,
    key: () => slotFor(registry.active),
    list: () => registry.projects.map(p => ({ ...p, slot: slotFor(p.id), active: p.id === registry.active })),
    // Other tabs may add or rename projects; re-read before showing the list.
    reload() { const next = read(); if (next) { if (!next.projects.some(p => p.id === registry.active)) next.active = registry.active, next.projects.push(active()); registry = next; } return registry; },
    create(title = untitled()) {
      this.reload();
      if (registry.projects.length >= MAX_PROJECTS) throw new Error(`At most ${MAX_PROJECTS} projects can be kept in this browser.`);
      const project = { id: uid('p'), title: String(title).slice(0, 200) || untitled(), createdAt: now(), updatedAt: now(), backup: null };
      registry.projects.push(project);
      registry.active = project.id;
      if (!write()) { registry.projects.pop(); registry.active = active() ? registry.active : registry.projects[0].id; throw new Error('The project list could not be saved.'); }
      return project;
    },
    switchTo(id) {
      this.reload();
      if (!find(id)) throw new Error('Project not found');
      const previous = registry.active;
      registry.active = id;
      if (!write()) { registry.active = previous; throw new Error('The project list could not be saved.'); }
      return find(id);
    },
    remove(id) {
      this.reload();
      if (!find(id)) throw new Error('Project not found');
      if (registry.projects.length === 1) throw new Error('The last project cannot be removed.');
      const kept = registry.projects.filter(p => p.id !== id);
      const next = { active: registry.active === id ? kept[0].id : registry.active, projects: kept };
      const previous = registry;
      registry = next;
      if (!write()) { registry = previous; throw new Error('The project list could not be saved.'); }
      try { storage.removeItem(slotFor(id)); } catch (error) { onError(error); }
      return next.active;
    },
    // The registry mirrors the open board's title and the time of its last edit.
    touch(doc) {
      const project = active();
      if (!project) return false;
      const title = doc.title || untitled();
      if (project.title === title && project.updatedAt && now() - project.updatedAt < 1000) return false;
      project.title = title; project.updatedAt = now();
      return write();
    },
    markBackup(doc) {
      const project = active();
      if (!project) return false;
      project.backup = { at: now(), mark: designFingerprint(doc) };
      return write();
    },
    // 'none' | 'current' | 'stale': whether a downloaded file matches this board.
    backupState(doc, project = active()) {
      if (!project?.backup) return 'none';
      return project.backup.mark === designFingerprint(doc) ? 'current' : 'stale';
    },
  };
}
