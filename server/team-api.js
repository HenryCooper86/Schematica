import {timingSafeEqual} from 'node:crypto';
import {createTeamStore, privatePath, teamError} from './team-store.js';
import {digest, isObject, readTeamIdentities, validateStored} from './team-validation.js';
import {mutateTeamResource, readProjectResource} from './team-projects.js';

export {readTeamIdentities} from './team-validation.js';

const MAX_BODY = 17 * 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 16;
const ROUTE = /^\/api\/team\/(me|projects)(?:\/([a-f0-9-]{36})(?:\/(revisions|members|comments|reviews|export)(?:\/([a-f0-9-]{36}))?)?)?$/;

function sendJson(res, value) {
  res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
  res.end(JSON.stringify(value));
}

function requireSameOrigin(req, origin) {
  if (req.headers['x-schematica-client'] !== '1'
    || (req.headers.origin && req.headers.origin !== origin)
    || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
    throw teamError(403, 'Cross-origin team access is not enabled.');
  }
}

async function configuredIdentities(identitiesFile, root) {
  try {
    await privatePath(identitiesFile, root);
    return await readTeamIdentities(identitiesFile);
  } catch {
    throw teamError(503, 'Team identity configuration is unavailable.');
  }
}

function authenticate(req, users) {
  const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization || '')?.[1];
  const tokenHash = digest(token || '');
  const user = token && users.find(user => !user.disabled
    && timingSafeEqual(Buffer.from(user.tokenHash, 'hex'), Buffer.from(tokenHash, 'hex')));
  if (!user) throw teamError(401, 'A valid team credential is required.');
  return {actor: {id: user.id, name: user.name}, credential: {userId: user.id, tokenHash}};
}

async function revalidateCredential(identitiesFile, root, credential) {
  const users = await configuredIdentities(identitiesFile, root);
  const eligible = users.some(user => user.id === credential.userId
    && !user.disabled && user.tokenHash === credential.tokenHash);
  if (!eligible) throw teamError(401, 'A valid team credential is required.');
  return users;
}

function parseRoute(pathname) {
  const match = ROUTE.exec(pathname);
  if (!match) throw teamError(404, 'Not found.');
  const [, resource, id, action, commentId] = match;
  return {resource, id, action, commentId};
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    const timer = setTimeout(() => fail(teamError(408, 'Team request timed out.')), 10000);
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', fail);
      req.off('aborted', onAborted);
    };
    const fail = error => {
      cleanup();
      req.resume();
      reject(error);
    };
    const onAborted = () => fail(teamError(400, 'Team request interrupted.'));
    const onData = chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) {
        fail(teamError(413, 'Team request is too large.'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!isObject(value)) throw Error();
        resolve(value);
      } catch {
        reject(teamError(400, 'Use a JSON object.'));
      }
    };
    if (Number(req.headers['content-length']) > MAX_BODY) {
      fail(teamError(413, 'Team request is too large.'));
      return;
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', fail);
    req.on('aborted', onAborted);
  });
}

export async function createTeamService({directory, identitiesFile, root} = {}) {
  if (!directory || !identitiesFile || !root) {
    throw Error('Team directory, identity file and repository root are required.');
  }
  directory = await privatePath(directory, root, {directory: true});
  identitiesFile = await privatePath(identitiesFile, root);
  await readTeamIdentities(identitiesFile);
  const store = await createTeamStore(directory, validateStored);
  let active = 0;

  function handleRead(route, actor) {
    if (route.resource === 'me' && !route.id) return {user: actor};
    if (route.resource !== 'projects') throw teamError(404, 'Not found.');
    return readProjectResource(store.read(), route, actor);
  }

  async function handleMutation(req, route, actor, credential) {
    if (req.method !== 'POST') throw teamError(405, 'Only GET and POST are supported.');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      throw teamError(415, 'Use application/json.');
    }
    const input = await readBody(req);
    // Recheck after the upload and again when this request reaches the serialized transaction.
    await revalidateCredential(identitiesFile, root, credential);
    const project = await store.mutate(async state => {
      const users = await revalidateCredential(identitiesFile, root, credential);
      return mutateTeamResource(state, route, input, actor, users);
    });
    return {project};
  }

  return {
    close: () => store.close(),
    async handle(req, res, url, origin) {
      if (url.pathname === '/api/team/status' && req.method === 'GET') {
        sendJson(res, {enabled: true});
        return;
      }
      if (active >= MAX_ACTIVE_REQUESTS) throw teamError(429, 'Team service is busy.');
      active++;
      try {
        requireSameOrigin(req, origin);
        const users = await configuredIdentities(identitiesFile, root);
        const {actor, credential} = authenticate(req, users);
        const route = parseRoute(url.pathname);
        const result = req.method === 'GET'
          ? handleRead(route, actor)
          : await handleMutation(req, route, actor, credential);
        sendJson(res, result);
      } finally {
        active--;
      }
    },
  };
}
