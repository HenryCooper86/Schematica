// Functional integration studies; source URLs are retained in component notes.
export const HCT_EXAMPLES = [
  {
    id: "hct-astra-degraded", name: "HCT Astra: Sensor Loss & Parking Handover", group: "Vehicle",
    doc: {
      schema: 4, title: "HCT Astra: Sensor Loss & Parking Handover",
      nodes: [
      {"id":"front","kind":"process","x":60,"y":100,"label":"Front pair","sublabel":"","color":null,"addr":"","rail":"","notes":"Published: wide and narrow front cameras, each 8 MP. https://en.neuehct.auto/HCT-Astra","status":null,"flags":[]},
      {"id":"surround","kind":"process","x":60,"y":290,"label":"Side + rear views","sublabel":"","color":null,"addr":"","rail":"","notes":"Published: four side cameras and one rear camera, each 3 MP. https://en.neuehct.auto/HCT-Astra","status":null,"flags":[]},
      {"id":"park","kind":"process","x":60,"y":480,"label":"Parking views","sublabel":"","color":null,"addr":"","rail":"","notes":"Published: four 3 MP fisheye cameras. Review calibration and blind zones before parking trials. https://en.neuehct.auto/HCT-Astra","status":null,"flags":[]},
      {"id":"radar","kind":"process","x":60,"y":670,"label":"Radar selection","sublabel":"","color":null,"addr":"","rail":"","notes":"Published: one standard forward radar; two front-side and two rear-side radars are optional. Optional equipment must match the vehicle configuration. https://en.neuehct.auto/HCT-Astra","status":null,"flags":[]},
      {"id":"astra","kind":"custom","x":390,"y":290,"label":"HCT Astra","sublabel":"Journey 6M","color":null,"addr":"","rail":"","notes":"Published compute: Journey 6M. This card is a functional boundary, not a connector map. https://en.neuehct.auto/HCT-Astra","status":null,"flags":[],"part":{"name":"HCT functional boundary","category":"compute","accent":"#22d3ee","icon":{"text":"HCT"},"ports":[{"id":"w","name":"W","bus":"flow","side":"left","required":false},{"id":"e","name":"E","bus":"flow","side":"right","required":false},{"id":"n","name":"N","bus":"flow","side":"top","required":false},{"id":"s","name":"S","bus":"flow","side":"bottom","required":false}],"fields":[]}},
      {"id":"health","kind":"decision","x":710,"y":290,"label":"Mode available?","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed OEM gate: check sensor freshness, calibration, selected radar variant and operating domain for the requested mode. A healthy highway mode does not imply parking availability.","status":null,"flags":[]},
      {"id":"arbiter","kind":"process","x":1040,"y":290,"label":"Motion arbitration","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed: validate request freshness and driver override before forwarding motion requests; agree the authority split with HCT.","status":null,"flags":[]},
      {"id":"vehicle","kind":"process","x":1380,"y":290,"label":"Chassis controllers","sublabel":"","color":null,"addr":"","rail":"","notes":"Brake and steering controllers remain vehicle integration responsibilities. Feedback must confirm accepted requests; this diagram does not establish safe actuator behavior.","status":null,"flags":[]},
      {"id":"driver","kind":"process","x":1040,"y":100,"label":"Driver + mode request","sublabel":"","color":null,"addr":"","rail":"","notes":"L2 supervision remains with the driver. Proposed handover requires explicit mode state and driver acknowledgement; no unattended-parking claim is made.","status":null,"flags":[]},
      {"id":"degrade","kind":"process","x":710,"y":670,"label":"Inhibit affected mode","sublabel":"","color":null,"addr":"","rail":"","notes":"Exercise: obscure a fisheye camera during parking preparation. Reject parking entry and report the cause; do not silently continue with stale imagery. Actual response requires safety analysis.","status":null,"flags":[]},
      {"id":"hmi","kind":"process","x":1040,"y":670,"label":"Availability warning","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed: identify the unavailable function and request driver action. Validate warning timing and recovery criteria with the OEM.","status":null,"flags":[]},
      {"id":"record","kind":"process","x":1380,"y":670,"label":"Fault evidence","sublabel":"","color":null,"addr":"","rail":"","notes":"Record sensor identity, selected mode, timestamps, calibration version and driver action so a failed handover can be reproduced.","status":null,"flags":[]}
    ],
      wires: [
      {"id":"w1","bus":"flow","from":{"node":"front","port":"e"},"to":{"node":"astra","port":"n"},"label":"images","arrow":"fwd","style":null,"flow":null},
      {"id":"w2","bus":"flow","from":{"node":"surround","port":"e"},"to":{"node":"astra","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w3","bus":"flow","from":{"node":"park","port":"e"},"to":{"node":"astra","port":"s"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w4","bus":"flow","from":{"node":"radar","port":"e"},"to":{"node":"health","port":"w"},"label":"variant + health","arrow":"fwd","style":null,"flow":null},
      {"id":"w5","bus":"flow","from":{"node":"astra","port":"e"},"to":{"node":"health","port":"w"},"label":"mode request","arrow":"fwd","style":null,"flow":null},
      {"id":"w6","bus":"flow","from":{"node":"health","port":"e"},"to":{"node":"arbiter","port":"w"},"label":"eligible","arrow":"fwd","style":null,"flow":null},
      {"id":"w7","bus":"flow","from":{"node":"arbiter","port":"e"},"to":{"node":"vehicle","port":"w"},"label":"request","arrow":"fwd","style":null,"flow":null},
      {"id":"w8","bus":"flow","from":{"node":"driver","port":"s"},"to":{"node":"arbiter","port":"n"},"label":"override","arrow":"fwd","style":null,"flow":null},
      {"id":"w9","bus":"flow","from":{"node":"health","port":"s"},"to":{"node":"degrade","port":"n"},"label":"unavailable","arrow":"fwd","style":null,"flow":null},
      {"id":"w10","bus":"flow","from":{"node":"degrade","port":"e"},"to":{"node":"hmi","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w11","bus":"flow","from":{"node":"hmi","port":"e"},"to":{"node":"record","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w12","bus":"flow","from":{"node":"radar","port":"e"},"to":{"node":"astra","port":"s"},"label":"observations","arrow":"fwd","style":null,"flow":null}
    ],
      zones: [
      {"id":"zone-sensors","x":30,"y":50,"w":290,"h":770,"label":"Published sensor configuration","color":"#60a5fa"},
      {"id":"zone-compute","x":355,"y":220,"w":290,"h":200,"label":"Product boundary","color":"#60a5fa"},
      {"id":"zone-control","x":680,"y":50,"w":980,"h":400,"label":"Proposed vehicle integration","color":"#60a5fa"},
      {"id":"zone-fault","x":680,"y":590,"w":980,"h":230,"label":"Failure exercise","color":"#60a5fa"}
    ],
      notes: [
      {"id":"scope","x":40,"y":890,"text":"Integration study: arrows are functional flows, not pinouts. OEM controls and fault responses are proposals. Confirm interfaces, timing and safety allocation with HCT before implementation."}
    ],
      journey: [
      {"id":"j1","label":"Choose the variant","view":{"cx":340,"cy":400,"zoom":0.7},"caption":"Inspect eleven cameras and optional corner radars before discussing mode availability."},
      {"id":"j2","label":"Authorize motion","view":{"cx":1030,"cy":300,"zoom":0.7},"caption":"Trace product output through an OEM mode gate and arbitration to the chassis."},
      {"id":"j3","label":"Lose a parking view","view":{"cx":1030,"cy":650,"zoom":0.7},"caption":"Test the unavailable branch; the driver must see why parking entry was refused."}
    ]
    }
  },
  {
    id: "hct-luna-arbitration", name: "HCT Luna 6: AEB Request Arbitration", group: "Vehicle",
    doc: {
      schema: 4, title: "HCT Luna 6: AEB Request Arbitration",
      nodes: [
      {"id":"scene","kind":"process","x":60,"y":100,"label":"Road scene","sublabel":"","color":null,"addr":"","rail":"","notes":"Test cut-in vehicles, vulnerable road users, glare and partial occlusion as separate scenario classes; these are proposed test cases.","status":null,"flags":[]},
      {"id":"luna","kind":"custom","x":390,"y":100,"label":"HCT Luna 6","sublabel":"HCT Luna 6","color":null,"addr":"","rail":"","notes":"Published: Journey 6B, 2 MP or 8 MP camera at 120 degrees, optional 1–5 radars. Confirm the ordered variant. https://en.neuehct.auto/HCT-Luna","status":null,"flags":[],"part":{"name":"HCT functional boundary","category":"compute","accent":"#22d3ee","icon":{"text":"HCT"},"ports":[{"id":"w","name":"W","bus":"flow","side":"left","required":false},{"id":"e","name":"E","bus":"flow","side":"right","required":false},{"id":"n","name":"N","bus":"flow","side":"top","required":false},{"id":"s","name":"S","bus":"flow","side":"bottom","required":false}],"fields":[]}},
      {"id":"fresh","kind":"decision","x":730,"y":100,"label":"Request valid?","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed OEM boundary: validate source identity, counter, timestamp and requested authority. Obtain the actual message contract; no CAN or Ethernet transport is assumed.","status":null,"flags":[]},
      {"id":"arbitrate","kind":"process","x":1080,"y":100,"label":"Brake arbitration","sublabel":"","color":null,"addr":"","rail":"","notes":"Define AEB, cruise and driver pedal priority in the vehicle safety concept. The example deliberately does not prescribe that cruise or driver input always wins.","status":null,"flags":[]},
      {"id":"brake","kind":"process","x":1420,"y":100,"label":"Brake controller","sublabel":"","color":null,"addr":"","rail":"","notes":"Compare requested and achieved deceleration in a controlled bench model before any vehicle trial. Establish limits from vehicle requirements.","status":null,"flags":[]},
      {"id":"radar","kind":"process","x":60,"y":360,"label":"Optional radar set","sublabel":"","color":null,"addr":"","rail":"","notes":"Treat radar presence and calibration as variant inputs. Do not assume every Luna installation has five radars.","status":null,"flags":[]},
      {"id":"cal","kind":"process","x":390,"y":360,"label":"Calibration + health","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed: block feature enablement when camera alignment, variant coding or health status is invalid. Verify after windshield replacement.","status":null,"flags":[]},
      {"id":"driver","kind":"process","x":1080,"y":360,"label":"Pedal + cruise state","sublabel":"","color":null,"addr":"","rail":"","notes":"Test simultaneous driver braking, cruise demand and AEB request. Log the selected authority and reason.","status":null,"flags":[]},
      {"id":"reject","kind":"process","x":730,"y":670,"label":"Discard stale request","sublabel":"","color":null,"addr":"","rail":"","notes":"Inject duplicate counters, stale timestamps and an incorrect source. Rejected requests must not enter the brake request path; handling of an ongoing maneuver needs a separate safety decision.","status":null,"flags":[]},
      {"id":"warning","kind":"process","x":1080,"y":670,"label":"Warn + report fault","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed: signal reduced feature availability and persist a diagnostic reason without representing a fault indication as a braking command.","status":null,"flags":[]},
      {"id":"observer","kind":"process","x":1420,"y":670,"label":"Independent observer","sublabel":"","color":null,"addr":"","rail":"","notes":"Compare arbitration output, brake feedback and event timestamps. Acceptance: no rejected request reaches the actuator model; response timing must meet agreed vehicle requirements.","status":null,"flags":[]}
    ],
      wires: [
      {"id":"w1","bus":"flow","from":{"node":"scene","port":"e"},"to":{"node":"luna","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w2","bus":"flow","from":{"node":"luna","port":"e"},"to":{"node":"fresh","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w3","bus":"flow","from":{"node":"fresh","port":"e"},"to":{"node":"arbitrate","port":"w"},"label":"valid","arrow":"fwd","style":null,"flow":null},
      {"id":"w4","bus":"flow","from":{"node":"arbitrate","port":"e"},"to":{"node":"brake","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w5","bus":"flow","from":{"node":"radar","port":"e"},"to":{"node":"cal","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w6","bus":"flow","from":{"node":"cal","port":"n"},"to":{"node":"luna","port":"s"},"label":"enablement","arrow":"fwd","style":null,"flow":null},
      {"id":"w7","bus":"flow","from":{"node":"driver","port":"n"},"to":{"node":"arbitrate","port":"s"},"label":"priority inputs","arrow":"fwd","style":null,"flow":null},
      {"id":"w8","bus":"flow","from":{"node":"fresh","port":"s"},"to":{"node":"reject","port":"n"},"label":"invalid","arrow":"fwd","style":null,"flow":null},
      {"id":"w9","bus":"flow","from":{"node":"reject","port":"e"},"to":{"node":"warning","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w10","bus":"flow","from":{"node":"warning","port":"e"},"to":{"node":"observer","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w11","bus":"flow","from":{"node":"brake","port":"s"},"to":{"node":"observer","port":"n"},"label":"feedback","arrow":"fwd","style":null,"flow":null},
      {"id":"w12","bus":"flow","from":{"node":"radar","port":"n"},"to":{"node":"luna","port":"w"},"label":"observations","arrow":"fwd","style":null,"flow":null},
      {"id":"w13","bus":"flow","from":{"node":"arbitrate","port":"s"},"to":{"node":"observer","port":"w"},"label":"selected request","arrow":"fwd","style":null,"flow":null}
    ],
      zones: [
      {"id":"zone-product","x":30,"y":50,"w":660,"h":510,"label":"Product and selected variant","color":"#60a5fa"},
      {"id":"zone-vehicle","x":700,"y":50,"w":1040,"h":510,"label":"Proposed vehicle authority","color":"#60a5fa"},
      {"id":"zone-failure","x":700,"y":610,"w":1040,"h":210,"label":"Rejected request and evidence","color":"#60a5fa"}
    ],
      notes: [
      {"id":"scope","x":40,"y":890,"text":"Integration study: arrows are functional flows, not pinouts. OEM controls and fault responses are proposals. Confirm interfaces, timing and safety allocation with HCT before implementation."}
    ],
      journey: [
      {"id":"j1","label":"Configure Luna","view":{"cx":370,"cy":270,"zoom":0.7},"caption":"Choose the camera and radar variant, then review calibration prerequisites."},
      {"id":"j2","label":"Resolve competing demands","view":{"cx":1230,"cy":230,"zoom":0.7},"caption":"A feature request is not direct actuator authority. Review the vehicle arbitration contract."},
      {"id":"j3","label":"Inject stale traffic","view":{"cx":1210,"cy":650,"zoom":0.7},"caption":"Follow the invalid branch and verify the independent observation rather than trusting a warning alone."}
    ]
    }
  },
  {
    id: "hct-luna-regression", name: "HCT Luna 3 → 6: Regression & Release Bench", group: "Vehicle",
    doc: {
      schema: 4, title: "HCT Luna 3 → 6: Regression & Release Bench",
      nodes: [
      {"id":"corpus","kind":"process","x":60,"y":120,"label":"Versioned scenarios","sublabel":"","color":null,"addr":"","rail":"","notes":"Freeze scenario IDs, ground truth, lighting and vehicle dynamics. Include nuisance-braking negatives and missed-detection positives; split results by scenario class.","status":null,"flags":[]},
      {"id":"adapter","kind":"process","x":390,"y":120,"label":"Bench adapters","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed supplier-approved interfaces convert the same semantic scenarios for each product. This is not a claim of compatible pinouts or raw-camera replay support.","status":null,"flags":[]},
      {"id":"luna3","kind":"custom","x":750,"y":120,"label":"Luna 3 baseline","sublabel":"HCT Luna 3","color":null,"addr":"","rail":"","notes":"Published: Journey 3; use the released vehicle configuration as the comparison baseline. https://en.neuehct.auto/HCT-Luna","status":null,"flags":[],"part":{"name":"HCT functional boundary","category":"compute","accent":"#22d3ee","icon":{"text":"HCT"},"ports":[{"id":"w","name":"W","bus":"flow","side":"left","required":false},{"id":"e","name":"E","bus":"flow","side":"right","required":false},{"id":"n","name":"N","bus":"flow","side":"top","required":false},{"id":"s","name":"S","bus":"flow","side":"bottom","required":false}],"fields":[]}},
      {"id":"luna6","kind":"custom","x":750,"y":400,"label":"Luna 6 candidate","sublabel":"HCT Luna 6","color":null,"addr":"","rail":"","notes":"Published: Journey 6B. Migration requires separate validation of camera, radar, calibration and feature configuration. https://en.neuehct.auto/HCT-Luna","status":null,"flags":[],"part":{"name":"HCT functional boundary","category":"compute","accent":"#22d3ee","icon":{"text":"HCT"},"ports":[{"id":"w","name":"W","bus":"flow","side":"left","required":false},{"id":"e","name":"E","bus":"flow","side":"right","required":false},{"id":"n","name":"N","bus":"flow","side":"top","required":false},{"id":"s","name":"S","bus":"flow","side":"bottom","required":false}],"fields":[]}},
      {"id":"observer","kind":"process","x":1100,"y":260,"label":"Independent metrics","sublabel":"","color":null,"addr":"","rail":"","notes":"Measure missed interventions, nuisance requests, request timing and available functions. A marketing rating is not evidence that this vehicle passes a regulatory test.","status":null,"flags":[]},
      {"id":"faults","kind":"process","x":390,"y":400,"label":"Fault matrix","sublabel":"","color":null,"addr":"","rail":"","notes":"Exercise frozen frames, sensor loss, timestamp skew, invalid calibration and restart. Record injected fault onset separately from device-reported timing.","status":null,"flags":[]},
      {"id":"gate","kind":"decision","x":1450,"y":260,"label":"Release criteria met?","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed: require all agreed per-scenario limits, variant coverage and fault-response checks. Average improvement cannot waive a critical regression.","status":null,"flags":[]},
      {"id":"approve","kind":"process","x":1800,"y":260,"label":"Approve scoped release","sublabel":"","color":null,"addr":"","rail":"","notes":"Record reviewed vehicle variant, software and calibration digests, scenario manifest and reviewer. Approval applies only to the tested scope.","status":null,"flags":[]},
      {"id":"triage","kind":"process","x":1450,"y":680,"label":"Quarantine candidate","sublabel":"","color":null,"addr":"","rail":"","notes":"Failed cases block release. Attach replay seed, environment and both product outputs to the defect; retain the released baseline.","status":null,"flags":[]},
      {"id":"fix","kind":"process","x":1100,"y":680,"label":"Fix + rerun suite","sublabel":"","color":null,"addr":"","rail":"","notes":"After a fix, rerun the affected cases and the agreed regression suite. Passing a single replay does not close the release gate.","status":null,"flags":[]},
      {"id":"evidence","kind":"process","x":1800,"y":680,"label":"Evidence archive","sublabel":"","color":null,"addr":"","rail":"","notes":"Archive raw observations, failed cases, acceptance limits and sign-off together. Keep test provenance so release decisions remain reproducible.","status":null,"flags":[]}
    ],
      wires: [
      {"id":"w1","bus":"flow","from":{"node":"corpus","port":"e"},"to":{"node":"adapter","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w2","bus":"flow","from":{"node":"adapter","port":"e"},"to":{"node":"luna3","port":"w"},"label":"baseline","arrow":"fwd","style":null,"flow":null},
      {"id":"w3","bus":"flow","from":{"node":"adapter","port":"s"},"to":{"node":"luna6","port":"w"},"label":"candidate","arrow":"fwd","style":null,"flow":null},
      {"id":"w4","bus":"flow","from":{"node":"faults","port":"n"},"to":{"node":"adapter","port":"s"},"label":"inject","arrow":"fwd","style":null,"flow":null},
      {"id":"w5","bus":"flow","from":{"node":"luna3","port":"e"},"to":{"node":"observer","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w6","bus":"flow","from":{"node":"luna6","port":"e"},"to":{"node":"observer","port":"s"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w7","bus":"flow","from":{"node":"observer","port":"e"},"to":{"node":"gate","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w8","bus":"flow","from":{"node":"gate","port":"e"},"to":{"node":"approve","port":"w"},"label":"pass","arrow":"fwd","style":null,"flow":null},
      {"id":"w9","bus":"flow","from":{"node":"gate","port":"s"},"to":{"node":"triage","port":"n"},"label":"fail","arrow":"fwd","style":null,"flow":null},
      {"id":"w10","bus":"flow","from":{"node":"triage","port":"w"},"to":{"node":"fix","port":"e"},"label":"","arrow":"fwd","style":null,"flow":null},
      {"id":"w11","bus":"flow","from":{"node":"fix","port":"w"},"to":{"node":"faults","port":"s"},"label":"rerun","arrow":"fwd","style":null,"flow":null},
      {"id":"w12","bus":"flow","from":{"node":"approve","port":"s"},"to":{"node":"evidence","port":"n"},"label":"sign-off","arrow":"fwd","style":null,"flow":null},
      {"id":"w13","bus":"flow","from":{"node":"triage","port":"e"},"to":{"node":"evidence","port":"w"},"label":"defect record","arrow":"fwd","style":null,"flow":null}
    ],
      zones: [
      {"id":"zone-bench","x":30,"y":50,"w":650,"h":510,"label":"Proposed test stimulus","color":"#60a5fa"},
      {"id":"zone-targets","x":715,"y":50,"w":300,"h":510,"label":"Separate product targets","color":"#60a5fa"},
      {"id":"zone-review","x":1060,"y":190,"w":1040,"h":230,"label":"Release decision","color":"#60a5fa"},
      {"id":"zone-evidence","x":1060,"y":610,"w":1040,"h":230,"label":"Regression and evidence","color":"#60a5fa"}
    ],
      notes: [
      {"id":"scope","x":40,"y":890,"text":"Integration study: arrows are functional flows, not pinouts. OEM controls and fault responses are proposals. Confirm interfaces, timing and safety allocation with HCT before implementation."}
    ],
      journey: [
      {"id":"j1","label":"Make the comparison fair","view":{"cx":530,"cy":280,"zoom":0.7},"caption":"Use a frozen scenario manifest and separate validated adapters for the two products."},
      {"id":"j2","label":"Measure failures","view":{"cx":1070,"cy":330,"zoom":0.7},"caption":"Inject faults and compare independent observations by scenario class, not only an aggregate score."},
      {"id":"j3","label":"Reject a regression","view":{"cx":1350,"cy":650,"zoom":0.7},"caption":"A failing critical scenario retains the released baseline and returns the candidate to regression testing."},
      {"id":"j4","label":"Preserve the decision","view":{"cx":1770,"cy":460,"zoom":0.7},"caption":"Release only the reviewed configuration and retain the evidence needed to reproduce the decision."}
    ]
    }
  }
];
