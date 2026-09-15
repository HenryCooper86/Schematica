# Current Lightsail deployment

- Website: https://bionicloud.net
- Static IP: `18.226.225.37`
- SSH user: `ubuntu`
- OS: Ubuntu 24.04 LTS, 2 GB RAM
- Active release: `/opt/schematica/current`
- Release directory: resolved by `readlink -f /opt/schematica/current`
- Docker Compose project: `schematica`
- Deployed: 2026-09-15

GitHub Actions deploys a successful `CI` push run on `main` through
[the Lightsail workflow](../.github/workflows/lightsail.yml). The server separately
checks that the requested hash is still `main` and that its latest CI run succeeded.
It checks again after building/testing, before activation. Each release's `REVISION`
file records the full hash. GitHub Pages publishes from `main` separately through
[the Pages workflow](../.github/workflows/pages.yml), with GitHub Actions selected
as its publishing source. Its `revision.json` records the published commit. All
three workflows use the explicit Ubuntu 22.04 runner pool after the default pool
left builds queued without assigning a runner on 15 September 2026.

The workflow uses a dedicated SSH key with a forced deployment command, no shell,
no forwarding, and a pinned server host key. The operator's administrative key is
not stored in GitHub. Repository secrets are `LIGHTSAIL_DEPLOY_KEY` and
`LIGHTSAIL_KNOWN_HOSTS`; the environment is `lightsail-production`.

The root-owned `/usr/local/sbin/schematica-deploy` is installed from
[lightsail-release.py](../deploy/lightsail-release.py). It downloads the exact public
commit, builds the app, and runs Node tests inside the unprivileged application
container before replacing live containers. Compose health checks, public HTTPS
health, and a served application-file hash must pass before the `current` symlink
changes. An activation/health failure restores the retained previous image and
configuration without rebuilding. Caddy volumes are retained throughout.

Server command changes require an operator to reinstall that file; repository
pushes do not rewrite the restricted entry point. Python 3.12 or newer is required
for safe tar extraction. A host lock and workflow concurrency prevent overlapping
deployments. Releases/images are retained for recovery; prune older inactive ones
only after identifying the current and last healthy releases.

The deployment's `.env` sets `SCHEMATICA_DOMAIN=bionicloud.net` and
`CADDY_CONFIG=./deploy/Caddyfile`. DNS points to the Lightsail static IP above.
Caddy manages the domain's trusted HTTPS certificate and automatic renewal.
Keep inbound TCP 80 and 443 enabled and the static IP attached to this instance.
The previous IP-based configuration is saved on the server in
`.env.before-domain-20260910` for rollback.

The provider Base URL for Ollama remains `https://ollama.com/v1`;
no Cloudflare Worker is involved.

## Operations

After connecting over SSH:

```sh
cd /opt/schematica/current
sudo docker compose -p schematica ps
sudo docker compose -p schematica logs --tail=50 app web
```

Public health check:

```sh
curl -fsS https://bionicloud.net/healthz
```

Do not remove the Caddy data volume: it holds the ACME account and renewable
certificate state. See [backend.md](backend.md) for deployment and update
instructions. Export/import boards when moving from the GitHub Pages site or
the former IP address; browser storage is separate for the new domain.

Deployment verification covered public HTTPS, the app health check, browser
loading, and live Ollama model listing through the backend. A real chat still
requires the user's provider key, entered in the website's assistant settings.


## Deployment recovery and credential rotation

A failed workflow is visible in GitHub Actions. Fix the problem and rerun CI for
the current `main` commit; successful CI triggers deployment again. Superseded
commits are rejected instead of replacing a newer release.

For emergency recovery, use the administrative SSH key, inspect `REVISION` and
Compose logs, then bring up the desired previous release with its retained image.
The automatic rollback tag is `schematica-rollback:<attempted-commit-first-12>`.
Do not assume the mutable `schematica-app` tag is the previous image after a failed
build/test attempt. Preserve `.env` and the Caddy data/config volumes.

To rotate the deployment key, generate a new Ed25519 key, append its public key to
`ubuntu`'s `authorized_keys` with the exact restriction:

```text
restrict,command="sudo -n /usr/local/sbin/schematica-deploy" ssh-ed25519 …
```

Update `LIGHTSAIL_DEPLOY_KEY` through GitHub's secret input, verify one deployment,
then remove only the superseded key entry. Keep host verification enabled; update
`LIGHTSAIL_KNOWN_HOSTS` only after independently verifying a server key change.

The event and revision checks follow GitHub's
[workflow_run documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
and [workflow-run API](https://docs.github.com/en/rest/actions/workflow-runs).
