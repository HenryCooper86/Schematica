# Development guide

[Documentation home](README.md) · [Project home](../README.md)

Schematica uses plain JavaScript modules and SVG. The application has no package
installation or compilation step. PDF.js and Mammoth are bundled for document
extraction and loaded when needed. Use Node.js 22 or newer for the server and tests.

## Run the application

```sh
git clone https://github.com/HenryCooper86/Schematica.git
cd Schematica
npm start
```

Open [localhost:3000](http://localhost:3000). Stop with **Ctrl+C**. If the port is
already occupied, use `PORT=3001 npm start` in a POSIX shell and open port 3001.
The default server binds to loopback. Public hosting needs explicit origin and
host configuration; see [backend setup](backend.md).

For a static-only instance, serve the repository root over HTTP. For example,
with Python installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000). Serve the directory instead of
opening `index.html` as a `file://` URL, so browser modules can load normally.

| Capability | Static server / Pages | `npm start` |
| --- | --- | --- |
| Local drawing, checks, save/open and exports | Yes | Yes |
| Assistant provider requests | Depends on provider CORS or a configured relay | Through the configured server allowlist |
| Assistant public URL sources | No | Yes |
| Authenticated shared reviews | No | Only after private storage and identity configuration |

Your board storage is separate on each origin, including different ports. Export
a board file when moving between instances.

## Run checks

From the repository root:

```sh
npm test
npm run lint
npm run e2e
```

The first command runs Node tests. Lint checks syntax, local imports, browser
module reachability and whitespace. The browser suite needs an installed Chrome
or Chromium; set `CHROME_PATH` if it cannot be found. Tests use isolated fixtures
and a scripted assistant provider rather than a paid model key.

Useful focused checks in a POSIX shell:

```sh
GUIDED_REVIEW_E2E_ONLY=1 npm run e2e
KICAD_UPDATE_E2E_ONLY=1 npm run e2e
TEAM_REVIEW_E2E_ONLY=1 npm run e2e
WORKFLOW_E2E_ONLY=1 npm run e2e
LAYOUT_E2E_ONLY=1 npm run e2e
```

Run Chrome suites sequentially; they share a temporary profile path. Test reports
and failure screenshots are retained under `.acceptance/`. Native Firefox/Safari
setup and real KiCad fixtures are covered in [local validation](local-validation.md).
Deployment-tool tests use Python 3.12 or newer:

```sh
python3 -m unittest discover -s tests/deploy
```

[CI](../.github/workflows/ci.yml) runs Node, source, deployment, Chrome workflow
and native Firefox checks. [Performance reporting](performance.md) and
[validation evidence tools](validation/README.md) distinguish automated fixtures
from human, hardware and live-provider evidence.

## Check a saved board without opening the editor

```sh
npm run check:board -- board.schematica.json
npm run --silent check:board -- --strict --json board.schematica.json
npm run --silent check:board -- --review-ready --json board.schematica.json
```

| Exit code | Meaning |
| --- | --- |
| 0 | The requested checks passed |
| 1 | Design errors or import repairs were found; strict mode also rejects warnings |
| 2 | The file could not be read/parsed, or the command was invalid |

`--review-ready` additionally requires at least one applicable connection, complete
compatible declarations for all applicable connections and no design errors or
warnings. A file may pass basic checks while failing this stronger requirement.
Files are limited to 16 MiB. These checks inspect declarations, not physical hardware.

## Source map

| Area | Main files |
| --- | --- |
| App startup and page structure | [src/main.js](../src/main.js), [index.html](../index.html) |
| Document state and undo | [src/state.js](../src/state.js), [src/serialize.js](../src/serialize.js) |
| Diagram rendering and interaction | [src/render.js](../src/render.js), [src/tools.js](../src/tools.js), [src/shortcuts.js](../src/shortcuts.js) |
| Panels and dialogs | [src/ui](../src/ui) |
| Engineering checks and coverage | [src/drc.js](../src/drc.js), [src/interface-checks.js](../src/interface-checks.js), [src/validation-coverage.js](../src/validation-coverage.js) |
| Recovery snapshots | [src/revisions.js](../src/revisions.js), [src/revision-db.js](../src/revision-db.js) |
| KiCad import and reconciliation | [src/kicad.js](../src/kicad.js), [src/kicad-update.js](../src/kicad-update.js) |
| Custom parts and templates | [src/custom.js](../src/custom.js), [src/library.js](../src/library.js) |
| Assistant tools and provider adapters | [src/ai](../src/ai) |
| Shared-review client and service | [src/team-client.js](../src/team-client.js), [server/team-api.js](../server/team-api.js), [server/team-store.js](../server/team-store.js) |
| Server routing and public sources | [server/index.js](../server/index.js), [server/web.js](../server/web.js) |
| Browser regression workflows | [tests/e2e](../tests/e2e) |

## Release and operation

A push to `main` runs CI. Successful eligible push runs trigger the
[Pages](../.github/workflows/pages.yml) and
[Lightsail](../.github/workflows/lightsail.yml) workflows. They deploy the tested
revision; pushing is not itself confirmation that deployment succeeded.

Use the [Lightsail runbook](lightsail-deployment.md) for release gates and rollback,
the [backend guide](backend.md) for server settings and the
[team-review operator guide](team-reviews.md) for private persistent storage.
Source design notes and historical plans remain under [superpowers](superpowers).
