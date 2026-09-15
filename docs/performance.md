# Large-board benchmark

Run `npm run benchmark -- docs/benchmark-latest.json` with Chrome installed.

Recorded in headless Chrome 153 on this Mac (18 logical processors reported by the browser). Five samples per workload; values below are medians in milliseconds. Fixtures use a grid of generic parts and a chain of labeled connections. These are controlled renderer/analysis measurements, not a complete pointer-to-screen latency or GPU-paint measurement.

| Nodes | Markup before → after | Export before → after | Redraw before → after | Search after | Checks after | Layout after |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 1.0 → 0.7 | 1.2 → 0.7 | 10.2 → 9.3 | 0.2 | 0.2 | 4.9 |
| 500 | 8.6 → 2.5 | 7.8 → 1.6 | 39.1 → 34.5 | 0.4 | 0.4 | 24.5 |
| 1000 | 24.5 → 3.6 | 22.7 → 2.6 | 87.1 → 73.9 | 0.7 | 0.7 | 41.1 |

The optimization builds a per-render map of incident wires and node rectangles. Previously, every card scanned all wires to preserve legacy ports. Indexed lookup removes that quadratic work without a persistent cache or worker. Existing geometry and rendering tests plus browser workflows verify behavior.

Full redraws still replace thousands of SVG elements (24,013 elements at 1,000 nodes), so DOM work now dominates. The measured 1,000-node redraw is about 74 ms; this is not a 60-fps guarantee. Heap samples in the JSON are browser-reported process samples, not retained-memory measurements; garbage collection makes comparisons noisy.

Provisional budgets on this machine: search/check median under 10 ms, SVG export under 50 ms, full redraw under 100 ms at 1,000 nodes. All pass here. Repeat on target laptops and representative custom/RDK diagrams before treating these as supported-device commitments. Incremental DOM updates are the next profiling candidate if real engineers routinely edit large boards.

The `drag` metric simulates moving one node and redrawing; it excludes input transport, other application subscribers, compositor paint, and display latency. Browser workflow tests separately exercise real pointer operations.
