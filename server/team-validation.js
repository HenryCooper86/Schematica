import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewSnapshot} from '../src/review-snapshot.js';
import {teamError} from './team-store.js';

const MAX_IDENTITY_BYTES = 1024 * 1024;
const IDENTITY_ID = /^[A-Za-z0-9_-]{1,80}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const UUID = /^[a-f0-9-]{36}$/;
const MEMBERSHIP_ROLES = new Set(['editor', 'reviewer']);
const REVIEW_STATUSES = new Set(['approved', 'changes-requested']);

export const digest = value => createHash('sha256').update(value).digest('hex');
export const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

export function textField(value, max, optional = false) {
  if (optional && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw teamError(400, 'Invalid text field.');
  }
  return value.trim();
}

function validIdentity(user, ids, hashes) {
  return isObject(user)
    && typeof user.id === 'string' && IDENTITY_ID.test(user.id) && !RESERVED_IDS.has(user.id)
    && typeof user.name === 'string' && user.name.trim() && user.name.length <= 200
    && /^[a-f0-9]{64}$/.test(user.tokenHash)
    && !ids.has(user.id) && !hashes.has(user.tokenHash)
    && (user.disabled === undefined || typeof user.disabled === 'boolean');
}

export async function readTeamIdentities(file) {
  if ((await stat(file)).size > MAX_IDENTITY_BYTES) throw Error('Invalid identity configuration.');
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (config?.version !== 1 || !Array.isArray(config.users) || config.users.length > 1000) {
    throw Error('Invalid identity configuration.');
  }
  const ids = new Set();
  const hashes = new Set();
  for (const user of config.users) {
    if (!validIdentity(user, ids, hashes)) throw Error('Invalid identity configuration.');
    ids.add(user.id);
    hashes.add(user.tokenHash);
  }
  return config.users;
}

export function boardSnapshot(board) {
  const oversizedCollections = ['zones', 'notes', 'journey'].some(key => board?.[key] !== undefined
    && (!Array.isArray(board[key]) || board[key].length > 10000));
  if (!isObject(board) || !Array.isArray(board.nodes) || !Array.isArray(board.wires)
    || board.nodes.length > 5000 || board.wires.length > 20000 || oversizedCollections) {
    throw teamError(400, 'A supported Schematica board is required.');
  }
  try {
    const result = reviewSnapshot(board);
    return {board: result.board, hash: digest(result.canonical)};
  } catch {
    throw teamError(400, 'Invalid board. Repair it before publishing.');
  }
}

const validUuid = value => typeof value === 'string' && UUID.test(value);
const uniqueIds = items => new Set(items.map(value => value.id)).size === items.length;
const validActor = value => isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
const boundedRecords = (items, max) => Array.isArray(items) && items.length <= max && uniqueIds(items);

function validateProject(project) {
  if (!isObject(project) || !validUuid(project.id)
    || typeof project.title !== 'string' || project.title.length > 200
    || !Number.isSafeInteger(project.version) || project.version < 1
    || !isObject(project.members) || project.members[project.owner] !== 'editor'
    || Object.values(project.members).some(role => !MEMBERSHIP_ROLES.has(role))
    || !boundedRecords(project.revisions, 100) || !project.revisions.length
    || !boundedRecords(project.comments, 1000) || !boundedRecords(project.reviews, 1000)
    || project.latestRevisionId !== project.revisions.at(-1).id) {
    throw Error('Invalid team storage.');
  }
}

function validateRevision(revision) {
  if (!validUuid(revision.id) || !validActor(revision.author) || typeof revision.title !== 'string'
    || revision.hash !== boardSnapshot(revision.board).hash) {
    throw Error('Invalid revision storage.');
  }
}

function validateComment(comment, revisions) {
  if (!validUuid(comment.id) || !validActor(comment.author)
    || !revisions.some(revision => revision.id === comment.revisionId)
    || typeof comment.text !== 'string' || comment.text.length > 4000
    || typeof comment.resolved !== 'boolean') {
    throw Error('Invalid comment storage.');
  }
}

function validateReview(review, revisions) {
  if (!validUuid(review.id) || !validActor(review.author)
    || !revisions.some(revision => revision.id === review.revisionId && revision.hash === review.hash)
    || !REVIEW_STATUSES.has(review.status)) {
    throw Error('Invalid review storage.');
  }
}

export function validateStored(state) {
  if (state.projects.length > 100 || !uniqueIds(state.projects)) throw Error('Invalid team storage.');
  for (const project of state.projects) {
    validateProject(project);
    for (const revision of project.revisions) validateRevision(revision);
    for (const comment of project.comments) validateComment(comment, project.revisions);
    for (const review of project.reviews) validateReview(review, project.revisions);
  }
}
