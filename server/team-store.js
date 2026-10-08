import {mkdir, open, readFile, realpath, rename, stat, unlink, lstat} from 'node:fs/promises';
import {resolve, sep, join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const MAX_STORE_BYTES = 64 * 1024 * 1024;
const MAX_PENDING_MUTATIONS = 32;

export function teamError(status, message) {
  return Object.assign(new Error(message), {status});
}

function insideRepository(path, root) {
  return path === root || path.startsWith(root + sep);
}

export async function privatePath(path, root, {directory = false} = {}) {
  const candidate = resolve(path);
  const base = await realpath(root);
  if (insideRepository(candidate, base)) throw Error('Team configuration must be outside the repository.');
  if (directory) await mkdir(candidate, {recursive: true, mode: 0o700});
  const actual = await realpath(candidate);
  if (insideRepository(actual, base)) throw Error('Team configuration must be outside the repository.');
  return actual;
}

async function acquireServiceLock(directory) {
  const path = join(directory, 'service.lock');
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, createdAt: new Date().toISOString()}));
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(path);
    throw error;
  }
  return {handle, path};
}

async function releaseServiceLock(lock) {
  await lock.handle.close();
  await unlink(lock.path);
}

async function loadStoredState(file, validate) {
  let state = {version: 1, projects: []};
  try {
    if (!(await lstat(file)).isFile()) throw Error('Invalid team storage file.');
    if ((await stat(file)).size > MAX_STORE_BYTES) throw Error('Team storage exceeds its limit.');
    state = JSON.parse(await readFile(file, 'utf8'));
    if (state?.version !== 1 || !Array.isArray(state.projects)) throw Error('Invalid team storage.');
    validate(state);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return state;
}

export async function createTeamStore(directory, validate = () => {}, {openFile = open} = {}) {
  const lock = await acquireServiceLock(directory);
  const file = join(directory, 'projects.json');
  let state;
  try {
    state = await loadStoredState(file, validate);
  } catch (error) {
    await releaseServiceLock(lock);
    throw error;
  }
  let queue = Promise.resolve();
  let pending = 0;
  let closed = false;
  let persistenceFailed = false;
  let closing;

  function blockFurtherMutations() {
    persistenceFailed = true;
    closed = true;
    return teamError(503, 'Team persistence requires operator attention.');
  }

  async function commitDraft(draft, encoded) {
    const temporary = join(directory, `.projects-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(encoded);
      await handle.sync();
      await handle.close();
      handle = null;
      const folder = await openFile(directory, 'r');
      try {
        await folder.sync();
        await rename(temporary, file);
        // Rename commits the draft. The final directory sync makes that commit durable.
        state = draft;
        try {
          await folder.sync();
        } catch {
          throw blockFurtherMutations();
        }
      } finally {
        await folder.close();
      }
    } finally {
      await handle?.close();
      await unlink(temporary).catch(() => {});
    }
  }

  async function applyMutation(fn) {
    // Accepted writes still drain during a normal close, but never after uncertain durability.
    if (persistenceFailed) throw teamError(503, 'Team persistence requires operator attention.');
    const draft = structuredClone(state);
    const result = await fn(draft);
    const encoded = JSON.stringify(draft);
    if (Buffer.byteLength(encoded) > MAX_STORE_BYTES) throw teamError(413, 'Team storage capacity reached.');
    await commitDraft(draft, encoded);
    return structuredClone(result);
  }

  function mutate(fn) {
    if (closed) return Promise.reject(teamError(503, 'Team service is closed.'));
    if (pending >= MAX_PENDING_MUTATIONS) return Promise.reject(teamError(429, 'Team service is busy.'));
    pending++;
    const next = queue.then(() => applyMutation(fn));
    queue = next.catch(() => {}).finally(() => { pending--; });
    return next;
  }

  function close() {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      await queue;
      await releaseServiceLock(lock);
    })();
    return closing;
  }

  return {
    read: () => structuredClone(state),
    mutate,
    close,
  };
}
