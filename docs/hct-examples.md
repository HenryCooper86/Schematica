# HCT integration review exercises

Open **Examples → Vehicle** and choose an HCT board. Use its journey chapters
and guided stops to review the nominal path, rejection path and evidence.
All three boards and walkthroughs are available in English and Chinese.

These are editable functional architecture studies, not reference wiring or
validated safety designs. Arrows carry functional relationships; they do not
specify a physical bus, message format or electrical interface. The product
cards intentionally have conceptual ports. Check → Review readiness does not
mark these studies as electrically ready.

| Board | Exercise | Evidence to collect |
| --- | --- | --- |
| HCT Astra: Sensor Loss & Parking Handover | Obscure a parking camera before requesting parking; then change the optional radar configuration. Review which mode becomes unavailable and why. | Sensor identity, freshness, calibration and configuration versions, requested mode, refusal reason and driver notification. |
| HCT Luna 6: AEB Request Arbitration | Inject a stale timestamp, duplicate counter or wrong source while cruise and driver inputs compete. Review the valid and invalid branches separately. | Rejected requests stay out of the brake path; independently compare selected requests, controller feedback and timestamps against the agreed vehicle contract. |
| HCT Luna 3 → 6: Regression & Release Bench | Replay a frozen scenario set against separate product adapters. Inject sensor loss and invalid calibration; block a candidate with a critical regression even if its average improves. | Per-scenario metrics and acceptance limits, failed-case seeds, product and calibration versions, variant coverage, rerun results and scoped sign-off. |

Before implementation, obtain the supplier interface contract and allocate
vehicle authority, diagnostic responses, timing limits and recovery conditions
with the responsible vehicle teams. Inhibiting entry to a mode is not a complete
response for an already active maneuver. The diagram does not resolve that
vehicle safety decision. Bench replay support and adapter compatibility must
also be confirmed with the supplier.

## Published product basis

Sources reviewed September 22, 2026:

- [HCT Astra](https://en.neuehct.auto/HCT-Astra): Journey 6M; two front cameras,
  four side cameras, four fisheye cameras and one rear camera; standard forward
  radar with optional front-side and rear-side radar pairs.
- [HCT Luna](https://en.neuehct.auto/HCT-Luna): Luna 3 uses Journey 3 and Luna 6
  uses Journey 6B. The page lists camera and optional radar configurations.
  The examples preserve the two generations as distinct targets.

Product specifications are referenced in the relevant component notes. OEM
mode gates, arbitration, fault injection, release criteria and evidence handling
are proposed exercises authored for Schematica. They are not claims about HCT
internals, certified behavior, guaranteed compatibility or achieved test results.
