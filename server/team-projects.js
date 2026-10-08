import {randomUUID} from 'node:crypto';
import {teamError} from './team-store.js';
import {boardSnapshot, textField} from './team-validation.js';

function memberProject(state, id, userId) {
  const project = state.projects.find(project => project.id === id);
  if (!project || !Object.hasOwn(project.members, userId)) throw teamError(404, 'Project not found.');
  return project;
}

export function readProjectResource(state, route, actor) {
  const {id, action, commentId} = route;
  if (!id) {
    const projects = state.projects
      .filter(project => Object.hasOwn(project.members, actor.id))
      .map(project => ({
        id: project.id, title: project.title, version: project.version,
        latestRevisionId: project.latestRevisionId, role: project.members[actor.id],
      }));
    return {projects};
  }
  const project = memberProject(state, id, actor.id);
  if (action === 'export' && !commentId) return {format: 'schematica-team-review', version: 1, project};
  if (action) throw teamError(404, 'Not found.');
  return {project};
}

function appendRevision(project, board, actor, title) {
  if (project.revisions.length >= 100) throw teamError(413, 'Revision capacity reached.');
  const revision = {
    id: randomUUID(), ...boardSnapshot(board), title,
    createdAt: new Date().toISOString(), author: actor,
  };
  project.revisions.push(revision);
  project.latestRevisionId = revision.id;
}

function createProject(state, input, actor) {
  if (state.projects.length >= 100) throw teamError(413, 'Project capacity reached.');
  const title = textField(input.title, 200);
  const project = {
    id: randomUUID(), title, owner: actor.id, version: 1,
    members: {[actor.id]: 'editor'}, latestRevisionId: null,
    revisions: [], comments: [], reviews: [],
  };
  appendRevision(project, input.board, actor, title);
  state.projects.push(project);
  return project;
}

function publishRevision(project, input, actor) {
  if (project.members[actor.id] !== 'editor') throw teamError(403, 'Editor membership is required.');
  const title = input.title === undefined ? project.title : textField(input.title, 200);
  appendRevision(project, input.board, actor, title);
  project.title = title;
}

function changeMembership(project, input, actor, users) {
  if (project.owner !== actor.id) throw teamError(403, 'Only the project owner can manage membership.');
  const {userId, role} = input;
  if (!['editor', 'reviewer', null].includes(role) || userId === project.owner) {
    throw teamError(400, 'Invalid membership.');
  }
  // Existing access can be revoked even after its identity is disabled or deleted.
  if (role === null && typeof userId === 'string' && Object.hasOwn(project.members, userId)) {
    delete project.members[userId];
    return;
  }
  if (!users.some(user => user.id === userId && !user.disabled)) throw teamError(400, 'Invalid membership.');
  if (role === null) delete project.members[userId];
  else project.members[userId] = role;
}

function addComment(project, input, actor) {
  if (project.comments.length >= 1000) throw teamError(413, 'Comment capacity reached.');
  if (!project.revisions.some(revision => revision.id === input.revisionId)) throw teamError(400, 'Unknown revision.');
  project.comments.push({
    id: randomUUID(), revisionId: input.revisionId, text: textField(input.text, 4000),
    target: textField(input.target, 200, true), createdAt: new Date().toISOString(),
    author: actor, resolved: false,
  });
}

function resolveComment(project, input, actor, commentId) {
  const comment = project.comments.find(comment => comment.id === commentId);
  if (!comment) throw teamError(404, 'Comment not found.');
  if (typeof input.resolved !== 'boolean') throw teamError(400, 'Resolution must be boolean.');
  comment.resolved = input.resolved;
  comment.resolvedBy = actor;
}

function addReview(project, input, actor) {
  if (project.reviews.length >= 1000) throw teamError(413, 'Review capacity reached.');
  const revision = project.revisions.find(revision => revision.id === input.revisionId);
  if (!revision || !['approved', 'changes-requested'].includes(input.status)) throw teamError(400, 'Invalid review.');
  if (input.status === 'approved') {
    const unresolvedComments = project.comments.some(comment => comment.revisionId === revision.id && !comment.resolved);
    if (revision.id !== project.latestRevisionId || unresolvedComments) {
      throw teamError(409, 'Approval requires the latest revision with resolved comments.');
    }
  }
  project.reviews.push({
    id: randomUUID(), revisionId: revision.id, hash: revision.hash, status: input.status,
    createdAt: new Date().toISOString(), author: actor, comment: textField(input.comment, 4000, true),
  });
}

function applyProjectAction(project, route, input, actor, users) {
  const {action, commentId} = route;
  if (commentId) {
    if (action !== 'comments') throw teamError(404, 'Not found.');
    resolveComment(project, input, actor, commentId);
    return;
  }
  switch (action) {
    case 'revisions': publishRevision(project, input, actor); break;
    case 'members': changeMembership(project, input, actor, users); break;
    case 'comments': addComment(project, input, actor); break;
    case 'reviews': addReview(project, input, actor); break;
    default: throw teamError(404, 'Not found.');
  }
}

export function mutateTeamResource(state, route, input, actor, users) {
  if (route.resource !== 'projects') throw teamError(404, 'Not found.');
  if (!route.id) return createProject(state, input, actor);
  const project = memberProject(state, route.id, actor.id);
  if (!Number.isSafeInteger(input.version) || input.version !== project.version) {
    throw teamError(409, 'Project changed. Reload before saving.');
  }
  applyProjectAction(project, route, input, actor, users);
  project.version++;
  return project;
}
