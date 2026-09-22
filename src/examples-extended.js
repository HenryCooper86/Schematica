// Architecture examples; vendor references and integration limits live in board notes.
export const EXTENDED_EXAMPLES = [
  {
    id: "model-delivery-security", name: "Signed AI Model Delivery", group: "Security",
    doc: {
      schema: 4, title: "Signed AI Model Delivery",
      nodes: [
        {"id":"build","kind":"hostpc","x":60,"y":120,"label":"Model build","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"registry","kind":"server","x":340,"y":120,"label":"Artifact registry","sublabel":"","color":null,"addr":"","rail":"","notes":"Store an immutable model digest and signed manifest; keep the signing key outside the build worker.","status":null,"flags":[]},
        {"id":"edge","kind":"aisbc","x":650,"y":120,"label":"Inference target","sublabel":"RDK X5","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"disposition":"victim"},
        {"id":"attacker","kind":"malware","x":340,"y":350,"label":"Replaced model","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"severity":"high"},"disposition":"adversary"},
        {"id":"verify","kind":"process","x":60,"y":580,"label":"Verify signature + digest","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"gate","kind":"decision","x":350,"y":580,"label":"All checks pass?","sublabel":"","color":null,"addr":"","rail":"","notes":"Require a valid signature, matching digest, intended target and allowed version. Any failed check takes the rejection branch.","status":null,"flags":[]},
        {"id":"activate","kind":"startend","x":650,"y":580,"label":"Activate model","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"reject","kind":"startend","x":350,"y":720,"label":"Reject + record","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"eth","to":{"node":"registry","port":"net"},"label":"publish","arrow":null,"style":null,"flow":null,"from":{"node":"build","port":"eth"}},
        {"id":"w2","bus":"eth","to":{"node":"edge","port":"eth"},"label":"download","arrow":null,"style":null,"flow":null,"from":{"node":"registry","port":"db"}},
        {"id":"w3","bus":"link","to":{"node":"registry","port":"net"},"label":"tamper","arrow":"fwd","style":"dashed","flow":null,"from":{"node":"attacker","port":"n"}},
        {"id":"w4","bus":"flow","to":{"node":"gate","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"verify","port":"e"}},
        {"id":"w5","bus":"flow","to":{"node":"activate","port":"w"},"label":"yes","arrow":"fwd","style":null,"flow":null,"from":{"node":"gate","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"reject","port":"n"},"label":"no","arrow":"fwd","style":null,"flow":null,"from":{"node":"gate","port":"s"}},
      ],
      zones: [
        {"id":"z1","x":30,"y":60,"w":490,"h":410,"label":"Build and distribution","color":"#60a5fa"},
        {"id":"z2","x":620,"y":60,"w":240,"h":260,"label":"Device boundary","color":"#60a5fa"},
        {"id":"z3","x":30,"y":530,"w":840,"h":260,"label":"Proposed admission policy","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":840,"text":"Design proposal: verify the manifest signature, model digest, target and minimum version before activation. This is not an RDK built-in security guarantee; supplies are omitted."},
      ],
      journey: [
        {"id":"j1","label":"Publish","view":{"cx":290,"cy":200,"zoom":0.9},"caption":"Separate model construction from signing authority and publish immutable artifacts."},
        {"id":"j2","label":"Inspect the threat","view":{"cx":540,"cy":250,"zoom":0.9},"caption":"A replaced registry object must fail device-side integrity checks even when transport succeeds."},
        {"id":"j3","label":"Admit or reject","view":{"cx":440,"cy":660,"zoom":0.9},"caption":"After signature and digest verification, check version policy; rejected artifacts never become active."},
      ],
    },
  },
  {
    id: "robot-command-security", name: "Robot Command Trust Boundary", group: "Security",
    doc: {
      schema: 4, title: "Robot Command Trust Boundary",
      nodes: [
        {"id":"operator","kind":"hostpc","x":50,"y":140,"label":"Operator station","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"boundary","kind":"firewall","x":310,"y":140,"label":"Network boundary","sublabel":"","color":null,"addr":"","rail":"","notes":"Restrict reachable services. Application authentication and authorization are separate controls.","status":null,"flags":[]},
        {"id":"robot","kind":"aisbc","x":570,"y":140,"label":"Robot supervisor","sublabel":"RDK X5","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"disposition":"victim"},
        {"id":"drive","kind":"mcu","x":850,"y":140,"label":"Drive controller","sublabel":"","color":null,"addr":"","rail":"","notes":"An independent watchdog stops motion on expired commands. Motor power and emergency-stop circuitry need a separate design.","status":null,"flags":[]},
        {"id":"threat","kind":"insider","x":50,"y":370,"label":"Stolen operator session","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"severity":"high","type":"insider-compromised"},"disposition":"adversary"},
        {"id":"auth","kind":"process","x":310,"y":560,"label":"Authenticate + authorize","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"fresh","kind":"decision","x":570,"y":560,"label":"Fresh command?","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"accept","kind":"startend","x":850,"y":560,"label":"Bounded motion","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"stop","kind":"startend","x":570,"y":710,"label":"Stop + audit","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"eth","to":{"node":"boundary","port":"w"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"operator","port":"eth"}},
        {"id":"w2","bus":"eth","to":{"node":"robot","port":"eth"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"boundary","port":"e"}},
        {"id":"w3","bus":"uart","to":{"node":"drive","port":"uart"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"robot","port":"uart"}},
        {"id":"w4","bus":"link","to":{"node":"operator","port":"eth"},"label":"session theft","arrow":"fwd","style":"dashed","flow":null,"from":{"node":"threat","port":"n"}},
        {"id":"w5","bus":"flow","to":{"node":"fresh","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"auth","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"accept","port":"w"},"label":"yes","arrow":"fwd","style":null,"flow":null,"from":{"node":"fresh","port":"e"}},
        {"id":"w7","bus":"flow","to":{"node":"stop","port":"n"},"label":"no","arrow":"fwd","style":null,"flow":null,"from":{"node":"fresh","port":"s"}},
      ],
      zones: [
        {"id":"z1","x":20,"y":80,"w":480,"h":410,"label":"Remote access","color":"#60a5fa"},
        {"id":"z2","x":540,"y":80,"w":510,"h":300,"label":"Robot control","color":"#60a5fa"},
        {"id":"z3","x":280,"y":510,"w":770,"h":280,"label":"Proposed command checks","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":840,"text":"Conceptual controls: authenticated sessions, per-command authorization, sequence numbers, expiry and speed limits. UART alone does not authenticate commands. Hardware supplies are omitted."},
      ],
      journey: [
        {"id":"j1","label":"Remote boundary","view":{"cx":360,"cy":210,"zoom":0.9},"caption":"The firewall limits network exposure; the robot application still verifies each operator session."},
        {"id":"j2","label":"Command freshness","view":{"cx":660,"cy":630,"zoom":0.9},"caption":"Reject replayed, expired or unauthorized commands before translating them into motion."},
        {"id":"j3","label":"Independent stop","view":{"cx":810,"cy":230,"zoom":0.9},"caption":"The drive controller enforces a watchdog timeout independently of the RDK supervisor."},
      ],
    },
  },
  {
    id: "rdk-x3-usb-vision", name: "RDK X3 USB Vision Workbench", group: "Embedded",
    doc: {
      schema: 4, title: "RDK X3 USB Vision Workbench",
      nodes: [
        {"id":"supply","kind":"regulator","x":60,"y":140,"label":"Regulated supply","sublabel":"5V","color":null,"addr":"","rail":"5V","notes":"Supply input is omitted; size the adapter and USB power budget for the board and camera.","status":null,"flags":[]},
        {"id":"board","kind":"aisbc","x":340,"y":140,"label":"Edge compute","sublabel":"RDK X3","color":null,"addr":"","rail":"5V","notes":"","status":null,"flags":[]},
        {"id":"camera","kind":"custom","x":650,"y":140,"label":"USB camera","sublabel":"UVC","color":null,"addr":"","rail":"","notes":"Select a supported UVC camera and verify pixel format, frame rate and calibration.","status":null,"flags":[],"part":{"name":"UVC camera","category":"sensors","accent":"#22d3ee","icon":{"kind":"camera"},"ports":[{"id":"usb","name":"USB","side":"left","bus":"usb","required":false}],"fields":[]}},
        {"id":"pc","kind":"hostpc","x":650,"y":360,"label":"Review workstation","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"capture","kind":"process","x":60,"y":590,"label":"USB acquisition","sublabel":"hobot_usb_cam","color":null,"addr":"","rail":"","notes":"Descriptive acquisition stage; package, runtime and camera configuration must be selected for the board image. Acquisition reference: https://developer.d-robotics.cc/rdk_doc/en/Robot_development/quick_demo/demo_sensor/","status":null,"flags":[]},
        {"id":"infer","kind":"rdksoftware","x":340,"y":590,"label":"BPU inference","sublabel":"hobot_dnn","color":null,"addr":"","rail":"","notes":"Logical pipeline only; no runtime selected and no deployment is performed.","status":null,"flags":[],"fields":{"package":"hobot_dnn","target":"board"}},
        {"id":"review","kind":"process","x":650,"y":590,"label":"Inspect results","sublabel":"","color":null,"addr":"","rail":"","notes":"Review camera calibration and image timestamps before trusting inference.","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"power","to":{"node":"board","port":"vcc"},"label":"5V","arrow":null,"style":null,"flow":null,"from":{"node":"supply","port":"out"}},
        {"id":"w2","bus":"gnd","to":{"node":"board","port":"gnd"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"supply","port":"gnd"}},
        {"id":"w3","bus":"usb","to":{"node":"camera","port":"usb"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"board","port":"usb"}},
        {"id":"w4","bus":"eth","to":{"node":"pc","port":"eth"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"board","port":"eth"}},
        {"id":"w5","bus":"flow","to":{"node":"infer","port":"in"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"capture","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"review","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"infer","port":"out"}},
      ],
      zones: [
        {"id":"z1","x":30,"y":70,"w":500,"h":280,"label":"Power and compute","color":"#60a5fa"},
        {"id":"z2","x":620,"y":70,"w":250,"h":430,"label":"Acquisition and review","color":"#60a5fa"},
        {"id":"z3","x":30,"y":530,"w":840,"h":240,"label":"Descriptive software pipeline","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":840,"text":"Architecture only: USB carries the camera connection; flow arrows describe software, not executable launch files. Verify the selected board image and model compatibility."},
      ],
      journey: [
        {"id":"j1","label":"Connect the camera","view":{"cx":460,"cy":210,"zoom":0.9},"caption":"The UVC camera uses USB, leaving CSI connectors free; confirm the camera format and power budget."},
        {"id":"j2","label":"Run local inference","view":{"cx":450,"cy":630,"zoom":0.9},"caption":"Acquisition supplies images to a BPU inference stage. Runtime and model deployment remain explicit integration work."},
        {"id":"j3","label":"Review evidence","view":{"cx":710,"cy":390,"zoom":0.9},"caption":"Review camera calibration and image timestamps before trusting inference."},
      ],
    },
  },
  {
    id: "rdk-x5-inspection", name: "RDK X5 Visual Inspection", group: "Embedded",
    doc: {
      schema: 4, title: "RDK X5 Visual Inspection",
      nodes: [
        {"id":"supply","kind":"regulator","x":60,"y":140,"label":"Regulated supply","sublabel":"5V","color":null,"addr":"","rail":"5V","notes":"Supply input is omitted; size the adapter and USB power budget for the board and camera.","status":null,"flags":[]},
        {"id":"board","kind":"aisbc","x":340,"y":140,"label":"Edge compute","sublabel":"RDK X5","color":null,"addr":"","rail":"5V","notes":"","status":null,"flags":[]},
        {"id":"camera","kind":"custom","x":650,"y":140,"label":"USB camera","sublabel":"UVC","color":null,"addr":"","rail":"","notes":"Select a supported UVC camera and verify pixel format, frame rate and calibration.","status":null,"flags":[],"part":{"name":"UVC camera","category":"sensors","accent":"#22d3ee","icon":{"kind":"camera"},"ports":[{"id":"usb","name":"USB","side":"left","bus":"usb","required":false}],"fields":[]}},
        {"id":"pc","kind":"hostpc","x":650,"y":360,"label":"Review workstation","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"capture","kind":"process","x":60,"y":590,"label":"USB acquisition","sublabel":"hobot_usb_cam","color":null,"addr":"","rail":"","notes":"Descriptive acquisition stage; package, runtime and camera configuration must be selected for the board image. Acquisition reference: https://developer.d-robotics.cc/rdk_doc/en/Robot_development/quick_demo/demo_sensor/","status":null,"flags":[]},
        {"id":"infer","kind":"rdksoftware","x":340,"y":590,"label":"BPU inference","sublabel":"hobot_dnn","color":null,"addr":"","rail":"","notes":"Logical pipeline only; no runtime selected and no deployment is performed.","status":null,"flags":[],"fields":{"package":"hobot_dnn","target":"board"}},
        {"id":"review","kind":"decision","x":650,"y":590,"label":"Defect detected?","sublabel":"","color":null,"addr":"","rail":"","notes":"Evaluate defect detections against a labeled validation set before using them to reject products.","status":null,"flags":[]},
        {"id":"hold","kind":"startend","x":650,"y":790,"label":"Hold for review","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"pass","kind":"startend","x":340,"y":790,"label":"Record pass","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"power","to":{"node":"board","port":"vcc"},"label":"5V","arrow":null,"style":null,"flow":null,"from":{"node":"supply","port":"out"}},
        {"id":"w2","bus":"gnd","to":{"node":"board","port":"gnd"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"supply","port":"gnd"}},
        {"id":"w3","bus":"usb","to":{"node":"camera","port":"usb"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"board","port":"usb"}},
        {"id":"w4","bus":"eth","to":{"node":"pc","port":"eth"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"board","port":"eth"}},
        {"id":"w5","bus":"flow","to":{"node":"infer","port":"in"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"capture","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"review","port":"n"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"infer","port":"out"}},
        {"id":"w7","bus":"flow","from":{"node":"review","port":"s"},"to":{"node":"hold","port":"n"},"label":"yes","arrow":"fwd","style":null,"flow":null},
        {"id":"w8","bus":"flow","from":{"node":"review","port":"w"},"to":{"node":"pass","port":"n"},"label":"no","arrow":"fwd","style":null,"flow":null},
      ],
      zones: [
        {"id":"z1","x":30,"y":70,"w":500,"h":280,"label":"Power and compute","color":"#60a5fa"},
        {"id":"z2","x":620,"y":70,"w":250,"h":430,"label":"Acquisition and review","color":"#60a5fa"},
        {"id":"z3","x":30,"y":530,"w":840,"h":400,"label":"Descriptive software pipeline","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":970,"text":"Architecture only: USB carries the camera connection; flow arrows describe software, not executable launch files. Verify the selected board image and model compatibility."},
      ],
      journey: [
        {"id":"j1","label":"Connect the camera","view":{"cx":460,"cy":210,"zoom":0.9},"caption":"The UVC camera uses USB, leaving CSI connectors free; confirm the camera format and power budget."},
        {"id":"j2","label":"Run local inference","view":{"cx":450,"cy":630,"zoom":0.9},"caption":"Acquisition supplies images to a BPU inference stage. Runtime and model deployment remain explicit integration work."},
        {"id":"j3","label":"Review evidence","view":{"cx":550,"cy":750,"zoom":0.9},"caption":"Detected defects hold the item for human review; other items record a pass. Validate false positives and misses on a labeled dataset before automating rejection."},
      ],
    },
  },
  {
    id: "horizon-sensor-replay", name: "Journey 6 Sensor Replay Bench (Horizon)", group: "Vehicle",
    doc: {
      schema: 4, title: "Journey 6 Sensor Replay Bench (Horizon)",
      nodes: [
        {"id":"camera","kind":"frontcam","x":60,"y":130,"label":"Recorded camera source","sublabel":"","color":null,"addr":"","rail":"","notes":"Abstract replay fixture with a serializer adapter; not a direct PC-to-GMSL cable.","status":null,"flags":[]},
        {"id":"ecu","kind":"adas","x":350,"y":230,"label":"Controller under test","sublabel":"Journey 6M","color":null,"addr":"","rail":"","notes":"Conceptual Horizon Robotics Journey 6M ECU. Ports describe a proposed carrier, not the silicon pinout or an approved reference board. Platform background: https://www.horizon.auto/en/solutions/horizon-journey","status":null,"flags":[]},
        {"id":"bridge","kind":"t1switch","x":660,"y":230,"label":"Bench Ethernet bridge","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"host","kind":"hostpc","x":930,"y":230,"label":"Replay workstation","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"gateway","kind":"vgateway","x":350,"y":440,"label":"CAN rest-bus simulator","sublabel":"","color":null,"addr":"","rail":"","notes":"Simulated vehicle traffic only; this bench has no actuator connection.","status":null,"flags":[]},
        {"id":"align","kind":"process","x":60,"y":650,"label":"Align timestamps","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"compare","kind":"process","x":350,"y":650,"label":"Compare detections","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"report","kind":"startend","x":660,"y":650,"label":"Record regressions","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"gmsl","to":{"node":"ecu","port":"cam1"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"camera","port":"out"}},
        {"id":"w2","bus":"t1","to":{"node":"bridge","port":"p1"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"ecu","port":"t1"}},
        {"id":"w3","bus":"eth","to":{"node":"host","port":"eth"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"bridge","port":"eth"}},
        {"id":"w4","bus":"canfd","to":{"node":"gateway","port":"canfd1"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"ecu","port":"canfd"}},
        {"id":"w5","bus":"flow","to":{"node":"compare","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"align","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"report","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"compare","port":"e"}},
      ],
      zones: [
        {"id":"z1","x":30,"y":70,"w":540,"h":510,"label":"Isolated replay bench","color":"#60a5fa"},
        {"id":"z2","x":630,"y":170,"w":510,"h":290,"label":"Measurement network","color":"#60a5fa"},
        {"id":"z3","x":30,"y":600,"w":850,"h":190,"label":"Evaluation workflow","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":840,"text":"Illustrative validation architecture, not a Horizon reference design. Supplies, timing adapters and replay tooling are integration requirements."},
      ],
      journey: [
        {"id":"j1","label":"Replay inputs","view":{"cx":300,"cy":290,"zoom":0.9},"caption":"A replay fixture feeds recorded camera data while a rest-bus simulator supplies controlled CAN traffic."},
        {"id":"j2","label":"Collect outputs","view":{"cx":780,"cy":300,"zoom":0.9},"caption":"A T1-to-Ethernet bridge connects the conceptual ECU to the measurement workstation."},
        {"id":"j3","label":"Compare runs","view":{"cx":460,"cy":680,"zoom":0.9},"caption":"Align input timestamps and compare detections against expected results to record regressions."},
      ],
    },
  },
  {
    id: "horizon-diagnostics-security", name: "Journey 6 Diagnostic Access (Horizon)", group: "Security",
    doc: {
      schema: 4, title: "Journey 6 Diagnostic Access (Horizon)",
      nodes: [
        {"id":"tool","kind":"obd","x":60,"y":130,"label":"Service connector","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"gateway","kind":"vgateway","x":340,"y":130,"label":"Diagnostic gateway","sublabel":"","color":null,"addr":"","rail":"","notes":"Proposed policy enforcement point: authenticate the tester, restrict services and expire sessions.","status":null,"flags":[]},
        {"id":"ecu","kind":"adas","x":650,"y":130,"label":"ADAS target ECU","sublabel":"Journey 6E","color":null,"addr":"","rail":"","notes":"Conceptual Horizon Robotics Journey 6E carrier. Gateway controls shown here are design proposals, not vendor security certifications. Platform background: https://www.horizon.auto/en/solutions/horizon-journey","status":null,"flags":[],"disposition":"victim"},
        {"id":"threat","kind":"insider","x":60,"y":350,"label":"Compromised service tool","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"severity":"high","type":"insider-compromised"},"disposition":"adversary"},
        {"id":"auth","kind":"process","x":60,"y":580,"label":"Authenticate tester","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"gate","kind":"decision","x":340,"y":580,"label":"Service permitted?","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"allow","kind":"startend","x":650,"y":580,"label":"Limited session","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
        {"id":"deny","kind":"startend","x":340,"y":720,"label":"Deny + log","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[]},
      ],
      wires: [
        {"id":"w1","bus":"can","to":{"node":"gateway","port":"obd"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"tool","port":"can"}},
        {"id":"w2","bus":"canfd","to":{"node":"ecu","port":"canfd"},"label":"","arrow":null,"style":null,"flow":null,"from":{"node":"gateway","port":"canfd1"}},
        {"id":"w3","bus":"link","to":{"node":"tool","port":"can"},"label":"unauthorized request","arrow":"fwd","style":"dashed","flow":null,"from":{"node":"threat","port":"n"}},
        {"id":"w4","bus":"flow","to":{"node":"gate","port":"w"},"label":"","arrow":"fwd","style":null,"flow":null,"from":{"node":"auth","port":"e"}},
        {"id":"w5","bus":"flow","to":{"node":"allow","port":"w"},"label":"yes","arrow":"fwd","style":null,"flow":null,"from":{"node":"gate","port":"e"}},
        {"id":"w6","bus":"flow","to":{"node":"deny","port":"n"},"label":"no","arrow":"fwd","style":null,"flow":null,"from":{"node":"gate","port":"s"}},
      ],
      zones: [
        {"id":"z1","x":30,"y":70,"w":230,"h":430,"label":"Service boundary","color":"#60a5fa"},
        {"id":"z2","x":310,"y":70,"w":570,"h":310,"label":"Vehicle network","color":"#60a5fa"},
        {"id":"z3","x":30,"y":530,"w":850,"h":260,"label":"Proposed authorization flow","color":"#60a5fa"},
      ],
      notes: [
        {"id":"note1","x":40,"y":840,"text":"Architecture only: CAN and CAN FD do not provide tester identity by themselves. Implement authentication, service allowlists, stationary-state checks and audit retention; supplies are omitted."},
      ],
      journey: [
        {"id":"j1","label":"External entry","view":{"cx":210,"cy":250,"zoom":0.9},"caption":"Treat the service tool as untrusted until the diagnostic application establishes tester identity."},
        {"id":"j2","label":"Gateway mediation","view":{"cx":560,"cy":230,"zoom":0.9},"caption":"The gateway mediates access to the Journey-based ECU and restricts requests to the permitted service set."},
        {"id":"j3","label":"Authorize each service","view":{"cx":440,"cy":660,"zoom":0.9},"caption":"After authentication, check role, vehicle state and session expiry; denied requests take the explicit logging branch."},
      ],
    },
  },
];
