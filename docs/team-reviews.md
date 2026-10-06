# Optional private team reviews

[Documentation home](README.md) · [Team-review user guide](user-guide.md#review-with-a-team)

This page is for the server operator. If you already have a team token, follow
the linked user guide to connect, publish a snapshot, comment and record a decision.

Team reviews require the Node server. Static hosting returns no shared projects. They are disabled by default; `/api/team/status` returns `{enabled:false}` and other team routes return 404. This implementation does not enable or change production configuration.

An operator supplies both `SCHEMATICA_TEAM_DIR` (writable persistent private directory) and `SCHEMATICA_TEAM_IDENTITIES` (private JSON file). Both must resolve outside the repository, including through symlinks. Mount a persistent writable directory when using the read-only production container. Restrict filesystem access to the service operator. Do not place identity files or review storage in public assets. Invalid or incomplete configuration prevents startup; invalid identity configuration during operation denies authenticated requests.

The identity file schema is:

```json
{"version":1,"users":[{"id":"reviewer-a","name":"Reviewer A","tokenHash":"64 lowercase hexadecimal SHA256 characters","disabled":false}]}
```

Generate each bearer credential with `randomBytes(32).toString('base64url')` using Node's `node:crypto`, then hash that exact token with SHA256. Deliver the token privately to its assigned account. Store only its hash in the identity file; never put raw credentials in boards, URLs, exports, application logs or server configuration. The browser holds credentials in memory for the current page only. Possession identifies the assigned account; it does not verify a real-world identity. IDs and hashes must be unique. Set `disabled:true`, remove the account, or replace its token hash to revoke access immediately. Configuration is re-read on every request and again inside queued writes.

One process owns the data directory. `service.lock` is created exclusively and held until `close()` drains accepted writes. A second process fails startup. After an abnormal stop, verify the old process is stopped before deleting this lock; never remove it while its process might still own the directory. Back up `projects.json` while stopped or from an atomic filesystem snapshot. Restore with the server stopped, preserving private permissions; startup validates histories, board hashes and references. Test recovery against an isolated copy before replacing live storage.

Writes serialize, sync a private temporary file, rename it atomically over `projects.json`, and sync the directory. A write failure before rename leaves the prior state unchanged. Rename is the commit point: if the final directory sync fails, memory reflects the committed file and further mutations fail closed until operator recovery. No history is automatically deleted. Caps are 100 projects, 100 revisions per project, 1,000 comments and 1,000 review records per project, and 64 MiB for the complete store. Requests are limited to 17 MiB and a 10-second body deadline, with at most 16 in flight and 32 queued mutations. Boards require node/wire collections, at most 5,000 nodes and 20,000 wires; normalized board snapshots are capped at 16 MiB. Repair warnings reject publication.

## Integration and API

`createTeamService({directory,identitiesFile,root})` is an async export from `server/team-api.js`. `root` is the static repository root. Inject its result into `createAppServer({teamService})`. The caller owns `await teamService.close()` after closing the HTTP server. The command-line server handles this during normal signal shutdown.

Except public GET status, requests require `Authorization: Bearer TOKEN` and `x-schematica-client: 1`. Origins and Fetch Metadata must be same-origin when supplied. Host validation follows the server's `PUBLIC_ORIGIN` or loopback policy. JSON errors use `{error:{message}}`; unauthorized project access returns 404. All successful mutations return HTTP 200 and `{project}`. Project data never contains credentials or identity configuration.

- `GET /api/team/me` returns `{user:{id,name}}`.
- `GET /api/team/projects` returns `{projects:[{id,title,version,latestRevisionId,role}]}` for memberships only.
- `POST /api/team/projects` accepts `{title,board}`. Its creator becomes the owner/editor.
- `GET /api/team/projects/:id` returns `{project}`.
- `POST .../:id/revisions` accepts `{version,board,title?}`; editors publish.
- `POST .../:id/members` accepts `{version,userId,role}`. Only the owner can assign `editor`, `reviewer`, or `null` to revoke; owner membership is retained. Accounts must be configured and enabled.
- `POST .../:id/comments` accepts `{version,revisionId,text,target?}`; members comment on a fixed revision.
- `POST .../:id/comments/:commentId` accepts `{version,resolved}`; members resolve or reopen, recording the actor.
- `POST .../:id/reviews` accepts `{version,revisionId,status,comment?}`, where status is `approved` or `changes-requested`. Approval requires the latest revision and resolved comments on that revision.
- `GET .../:id/export` returns `{format:"schematica-team-review",version:1,project}`.

Each project has `id,title,owner,version,members,latestRevisionId,revisions,comments,reviews`. Revisions have `id,hash,title,createdAt,author,board`; comments have `id,revisionId,text,target?,createdAt,author,resolved,resolvedBy?`; reviews have `id,revisionId,hash,status,createdAt,author,comment?`. Authors/resolvers are server-assigned `{id,name}`. Supplied actor fields cannot override authentication. Hashes use SHA256 of canonical normalized snapshots from `src/review-snapshot.js`. Every revision and review record remains bound to its original snapshot. Publishing creates a fresh revision even if content matches and never inherits approval.

Every project mutation requires its current integer `version`. A stale version returns 409; clients must reload and consciously retry. Concurrent equal-version requests yield one success and one conflict. Export requires current membership; revocation excludes future reads and writes.

Run isolated HTTP/filesystem coverage with `node --test tests/team-api.test.js tests/team-store.test.js`. No production credentials or participant data are needed.

## Initial private configuration

For a local deployment, choose an operator-owned location outside this checkout and provision accounts with the included CLI. These commands are examples to run locally; no account was provisioned in production by this implementation.

```sh
umask 077
node server/team-provision.js /srv/schematica-private/identities.json /srv/schematica-private/alice-token.txt alice 'Alice'
node server/team-provision.js /srv/schematica-private/identities.json /srv/schematica-private/bob-token.txt bob 'Bob'
SCHEMATICA_TEAM_DIR=/srv/schematica-private/reviews SCHEMATICA_TEAM_IDENTITIES=/srv/schematica-private/identities.json npm start
```

The CLI generates 32 random bytes per account, stores only SHA256 in the identity file, and writes the bearer credential to an exclusive mode-0600 file. It never prints the token. Deliver each token privately and delete its delivery file afterward. Existing account IDs or credential paths fail safely. The identity file updates atomically; a private provisioning lock excludes concurrent CLI runs. Provisioning is operator work, separate from the project's membership controls.

For a read-only container, mount the operator-owned persistent directory read/write at `/private`, leave the application filesystem read-only, and set `SCHEMATICA_TEAM_DIR=/private/reviews` and `SCHEMATICA_TEAM_IDENTITIES=/private/identities.json`. The container's service UID must own or have write access to that mounted directory. For example, add `--mount type=bind,src=/srv/schematica-private,dst=/private` and these two environment variables to the existing container launch configuration. Keep the volume private and back it up separately from static assets. Do not run multiple replicas against this directory; the process lock deliberately rejects them. Use HTTPS and the existing explicit `PUBLIC_ORIGIN` for a public server. This is deployment guidance, not an applied configuration change.
