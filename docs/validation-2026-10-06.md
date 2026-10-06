# Local validation — 6 October 2026

Validated the Schematica working tree based on `1516061`, including the local
Pages CI gate, interface-direction preservation, and cross-tab recovery fixes.
These changes have not been deployed. This record describes tested behavior;
it is not a guarantee that every environment or input is defect-free.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 915 passed; no failures or skips |
| `npm run lint` | Passed: syntax, imports, module reachability, whitespace |
| Python deployment and rollback tests | 7 passed using Python 3.14.6 |
| `actionlint` | All GitHub workflows passed |
| `git diff --check` | Passed |
| Full Chrome regression suite | 221/221 passed |
| Chrome recovery/workflow suite | 16/16 passed |
| Chrome presentation suite | 17/17 passed |
| Chrome Blueprint/assistant skills suite | 12/12 passed |
| Chrome web-source suite | 8/8 passed |
| Chrome responsive-layout suite | 160/160 passed |
| Native Firefox 155.0.1 suite | 70/70 passed |
| Native Safari 27.0.1 suite | 70/70 passed |

All completed browser suites reported no captured page errors or unhandled
exceptions. The responsive suite covers English and Chinese at desktop, narrow
portrait, and landscape dimensions. Node was 22.22.2. Browser counts overlap
in coverage and do not represent independent product features.

## Correction found during validation

The Firefox suite initially failed its open-dialog translation check. It invoked
`setLang` through a WebDriver dynamic import, which did not update the running
application's subscribers. The test now invokes the existing language button's
listener, exercising the application instance. Firefox and Safari then passed
the translation check and their full targeted suites. No application translation
change was necessary.

## Reproduction and evidence

Run the commands in the results table. The specialized Chrome suites use
`WORKFLOW_E2E_ONLY=1`, `PRESENTATION_E2E_ONLY=1`, `SKILLS_E2E_ONLY=1`,
`WEB_E2E_ONLY=1`, or `LAYOUT_E2E_ONLY=1` with `npm run e2e`. Run them sequentially:
the Chrome runner owns one temporary profile. Native checks use
`npm run e2e:firefox` and `npm run e2e:safari`.

Local logs are in `.acceptance/quality/`; native browser reports, screenshots,
and driver logs are in `.acceptance/firefox/` and `.acceptance/safari/`.
These generated files are ignored by Git. CI uses Python 3.12 for the deployment
tests; the local run used the installed Python 3.14 runtime.

## Not established by this run

- Live paid-provider behavior, production deployment, or hosted CI execution.
- Real hardware correctness, electrical simulation, or authenticity of declared
  interface evidence.
- Participant usability results, a full assistive-technology audit, or performance
  qualification across supported devices.
- Universal KiCad compatibility; no external KiCad fixture manifest was supplied.

The native runners also collected local performance samples. Their runs overlapped
other tests, so those samples are not controlled benchmark evidence.
