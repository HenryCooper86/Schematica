// Security explainer examples: a published CVE drawn as an attack chain, a
// board rebuilt from an incident log by the reconstruct_from_log feature
// (src/incident-replay.js) with its own reading layout, and an office network
// mid-incident. All are illustrations: the CVE board is not an assessment of
// a real system and the incident data is fictional teaching material.
export const SECURITY_EXAMPLES = [
  {
    id: 'log4shell-cve', name: 'CVE Explainer: Log4Shell (CVE-2021-44228)', group: 'Security',
    doc: {
      schema: 4, title: "Log4Shell on a Telemetry Backend",
      nodes: [
        {"id": "atk", "kind": "threatactor", "x": 60, "y": 140, "label": "Remote attacker", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "disposition": "adversary", "fields": {"type": "unknown", "origin": "203.0.113.7", "severity": "critical"}},
        {"id": "req", "kind": "httprequest", "x": 270, "y": 140, "label": "Telemetry upload", "sublabel": "User-Agent: ${jndi:ldap://…/a}", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"method": "POST", "path": "/v1/telemetry"}},
        {"id": "api", "kind": "server", "x": 660, "y": 140, "label": "Telemetry API", "sublabel": "Java · Log4j 2.14.1", "color": null, "addr": "", "rail": "", "notes": "Logs the User-Agent header of every vehicle upload.", "status": null, "flags": [], "disposition": "victim"},
        {"id": "vuln", "kind": "vulnerability", "x": 660, "y": 450, "label": "Log4Shell", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"cve": "CVE-2021-44228", "cvss": "10.0", "affected": "Log4j 2.0-beta9 to 2.14.1", "severity": "critical"}},
        {"id": "ldap", "kind": "c2", "x": 60, "y": 450, "label": "Attacker LDAP server", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"dns": "ldap.attacker.example", "severity": "high"}},
        {"id": "cls", "kind": "payload", "x": 300, "y": 450, "label": "Remote Java class", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"content": "class named in the LDAP reply"}},
        {"id": "rce", "kind": "codeexec", "x": 920, "y": 140, "label": "Code runs in the API", "sublabel": "as the service account", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"precondition": "message lookups enabled (Log4j < 2.15.0 default)", "severity": "critical"}},
        {"id": "keys", "kind": "secretstore", "x": 930, "y": 450, "label": "Fleet API keys", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "fields": {"kind": "API keys", "location": "environment variables"}},
      ],
      wires: [
        {"id": "w1", "bus": "link", "from": {"node": "atk", "port": "e"}, "to": {"node": "req", "port": "w"}, "label": "sends", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w2", "bus": "link", "from": {"node": "req", "port": "e"}, "to": {"node": "api", "port": "net"}, "label": "header is logged", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w3", "bus": "link", "from": {"node": "api", "port": "net"}, "to": {"node": "ldap", "port": "n"}, "label": "JNDI lookup", "arrow": "fwd", "style": "dashed", "flow": null},
        {"id": "w4", "bus": "link", "from": {"node": "ldap", "port": "e"}, "to": {"node": "cls", "port": "w"}, "label": "points to", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w5", "bus": "link", "from": {"node": "cls", "port": "e"}, "to": {"node": "api", "port": "net"}, "label": "class loaded", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w6", "bus": "link", "from": {"node": "api", "port": "net"}, "to": {"node": "rce", "port": "w"}, "label": "runs", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w7", "bus": "link", "from": {"node": "rce", "port": "s"}, "to": {"node": "keys", "port": "n"}, "label": "reads", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w8", "bus": "link", "from": {"node": "vuln", "port": "n"}, "to": {"node": "api", "port": "net"}, "label": "affects", "arrow": null, "style": "dashed", "flow": null},
      ],
      zones: [
        {"id": "z1", "x": 30, "y": 90, "w": 500, "h": 480, "label": "Internet (attacker controlled)", "color": "#f87171"},
        {"id": "z2", "x": 610, "y": 90, "w": 520, "h": 520, "label": "Telemetry backend", "color": "#38bdf8"},
      ],
      notes: [
        {"id": "n1", "x": 30, "y": 620, "text": "Fix: upgrade Log4j to 2.17.1 or later and block outbound LDAP/RMI from servers. This illustrates a published CVE; it is not an assessment of a real system."},
      ],
      journey: [
        {"id": "j1", "label": "Crafted request", "view": {"cx": 340, "cy": 190, "zoom": 1.05}, "caption": "An attacker puts a ${jndi:ldap://…} string in a header the backend logs."},
        {"id": "j2", "label": "The lookup", "view": {"cx": 400, "cy": 340, "zoom": 0.9}, "caption": "Log4j expands the string and asks the attacker's LDAP server for the named object."},
        {"id": "j3", "label": "Remote code", "view": {"cx": 620, "cy": 320, "zoom": 0.8}, "caption": "The LDAP reply points to a remote Java class; the API loads it and runs it."},
        {"id": "j4", "label": "Fix", "view": {"cx": 760, "cy": 520, "zoom": 0.85}, "caption": "Upgrading Log4j removes the lookup path; blocking outbound LDAP limits what a missed host can fetch."},
      ],
    },
  },
  {
    id: 'robot-fleet-incident', name: 'Incident Replay: Robot Fleet (from a log)', group: 'Security',
    doc: {
      schema: 4, title: "Robot Fleet Incident (from a log)",
      nodes: [
        {"id": "atk", "kind": "threatactor", "x": 40, "y": 504, "label": "Attacker", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "disposition": "adversary", "fields": {"type": "criminal", "motivation": "personal-gain", "severity": "high"}},
        {"id": "laptop", "kind": "hostpc", "x": 364, "y": 200, "label": "Operator laptop", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "vpn", "kind": "vpn", "x": 375, "y": 394, "label": "Fleet VPN", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "fleet", "kind": "server", "x": 371, "y": 532, "label": "Fleet manager", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "ota", "kind": "server", "x": 375, "y": 670, "label": "OTA server", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "robot", "kind": "aisbc", "x": 710, "y": 670, "label": "Delivery robot", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "disposition": "victim"},
        {"id": "store", "kind": "database", "x": 364, "y": 808, "label": "Telemetry store", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
      ],
      wires: [
        {"id": "w1", "bus": "link", "from": {"node": "atk", "port": "n"}, "to": {"node": "laptop", "port": "usb"}, "label": "phishing email", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w2", "bus": "link", "from": {"node": "atk", "port": "n"}, "to": {"node": "vpn", "port": "e"}, "label": "VPN login with stolen credentials", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w3", "bus": "link", "from": {"node": "atk", "port": "n"}, "to": {"node": "fleet", "port": "db"}, "label": "operator session", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w4", "bus": "link", "from": {"node": "atk", "port": "n"}, "to": {"node": "ota", "port": "db"}, "label": "uploads unsigned update", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w5", "bus": "eth", "from": {"node": "ota", "port": "net"}, "to": {"node": "robot", "port": "eth"}, "label": "pushes update", "arrow": "fwd", "style": null, "flow": null},
        {"id": "w6", "bus": "link", "from": {"node": "atk", "port": "n"}, "to": {"node": "store", "port": "net"}, "label": "exports telemetry", "arrow": "fwd", "style": null, "flow": null},
      ],
      zones: [
        {"id": "z1", "x": 336, "y": 164, "w": 182, "h": 138, "label": "Operations office", "color": "#f59e0b"},
        {"id": "z2", "x": 336, "y": 358, "w": 182, "h": 552, "label": "Fleet cloud", "color": "#f59e0b"},
        {"id": "z3", "x": 682, "y": 634, "w": 175.20000000000005, "h": 138, "label": "Robots in the field", "color": "#f59e0b"},
      ],
      notes: [
        {"id": "n1", "x": 40, "y": 224, "text": "Reconstructed from a log. Steps are what the log recorded, not independent proof of execution. IR-2026-03 (fictional teaching log)"},
      ],
      journey: [
        {"id": "j1", "label": "Phase: Initial access", "caption": "Initial access — 3 logged action(s).", "view": {"cx": 254, "cy": 389, "zoom": 0.95}, "targets": {"nodes": ["laptop"], "wires": []}},
        {"id": "j2", "label": "Phase: Access", "caption": "Access — 2 logged action(s).", "view": {"cx": 260, "cy": 500, "zoom": 0.95}, "targets": {"nodes": ["vpn", "fleet"], "wires": []}},
        {"id": "j3", "label": "Phase: Discovery", "caption": "Discovery — 3 logged action(s).", "view": {"cx": 258, "cy": 555, "zoom": 0.95}, "targets": {"nodes": ["fleet"], "wires": []}},
        {"id": "j4", "label": "Phase: Impact", "caption": "Impact — 2 logged action(s).", "view": {"cx": 427, "cy": 624, "zoom": 0.95}, "targets": {"nodes": ["ota", "robot"], "wires": []}},
        {"id": "j5", "label": "Phase: Exfiltration", "caption": "Exfiltration — 3 logged action(s).", "view": {"cx": 254, "cy": 693, "zoom": 0.95}, "targets": {"nodes": ["store"], "wires": []}},
      ],
      incident: {
        title: "IR-2026-03 (fictional teaching log)",
        blast: "12 robots on the test channel",
        stages: [{"name": "Getting in"}, {"name": "Taking over the fleet"}],
        phases: [{"name": "Initial access"}, {"name": "Access"}, {"name": "Discovery"}, {"name": "Impact"}, {"name": "Exfiltration"}],
        events: [
          {"ts": 1773216840000, "last": 1773216960000, "phase": "Initial access", "actor": "Attacker", "target": "Operator laptop", "action": "phishing email", "count": 2, "stage": "Getting in", "command": "send invoice-0311.html", "evidence": "fake invoice with a credential page", "nodes": ["atk", "laptop"], "wires": ["w1"]},
          {"ts": 1773217260000, "last": 1773217260000, "phase": "Initial access", "actor": "Attacker", "target": "Operator laptop", "action": "captures credentials", "count": 1, "stage": "Getting in", "command": "POST /login (fake page)", "evidence": "operator username and password captured", "nodes": ["atk", "laptop"], "wires": ["w1"]},
          {"ts": 1773222000000, "last": 1773222000000, "phase": "Access", "actor": "Attacker", "target": "Fleet VPN", "action": "VPN login with stolen credentials", "count": 1, "stage": "Getting in", "command": "openvpn --config fleet.ovpn", "evidence": "session from 203.0.113.7; no second factor", "nodes": ["atk", "vpn"], "wires": ["w2"]},
          {"ts": 1773222420000, "last": 1773222420000, "phase": "Access", "actor": "Attacker", "target": "Fleet manager", "action": "operator session", "count": 1, "stage": "Getting in", "command": "GET /api/robots", "evidence": "12 robots on the test channel listed", "nodes": ["atk", "fleet"], "wires": ["w3"]},
          {"ts": 1773222660000, "last": 1773222900000, "phase": "Discovery", "actor": "Attacker", "target": "Fleet manager", "action": "enumerates the API", "count": 3, "stage": "Getting in", "command": "GET /api/channels", "evidence": "test channel has signature checks off", "nodes": ["atk", "fleet"], "wires": ["w3"]},
          {"ts": 1773223500000, "last": 1773223500000, "phase": "Impact", "actor": "Attacker", "target": "OTA server", "action": "uploads unsigned update", "count": 1, "stage": "Taking over the fleet", "command": "ota push --channel test fw-2.3.1.bin", "evidence": "accepted: signature check disabled for the test channel", "nodes": ["atk", "ota"], "wires": ["w4"]},
          {"ts": 1773224400000, "last": 1773224400000, "phase": "Impact", "actor": "OTA server", "target": "Delivery robot", "action": "pushes update", "count": 1, "stage": "Taking over the fleet", "command": "deploy fw-2.3.1 to channel test", "evidence": "12 robots updated", "nodes": ["ota", "robot"], "wires": ["w5"]},
          {"ts": 1773279000000, "last": 1773279240000, "phase": "Exfiltration", "actor": "Attacker", "target": "Telemetry store", "action": "exports telemetry", "count": 3, "stage": "Taking over the fleet", "command": "GET /export?days=3", "evidence": "route history, 41 MB", "nodes": ["atk", "store"], "wires": ["w6"]},
        ],
      },
    },
  },
  // A small company network during a phishing-to-ransomware incident: the
  // Endpoints, Operating Systems, Network, Security & Edge, Facilities and
  // People parts together, with conditions marking the state of each host.
  {
    id: "office-ransomware", name: "Enterprise Network: Phishing to Ransomware", group: 'Security',
    doc: {
      schema: 4, title: "Office Network Under Ransomware",
      nodes: [
        {"id":"atk","kind":"threatactor","x":40,"y":300,"label":"Ransomware crew","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"type":"crime-syndicate","sophistication":"intermediate","motivation":"personal-gain","severity":"critical"},"disposition":"adversary"},
        {"id":"lure","kind":"phishing","x":40,"y":120,"label":"Invoice lure","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"campaign":"Q3 invoice lure","email":"billing@examp1e.net","severity":"high"}},
        {"id":"net","kind":"internet","x":40,"y":480,"label":"Internet","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"disposition":"unknown"},
        {"id":"fw","kind":"firewall","x":300,"y":480,"label":"Edge firewall","sublabel":"NGFW","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"203.0.113.2","dns":"fw.corp.example"}},
        {"id":"mail","kind":"mailserver","x":300,"y":120,"label":"Mail gateway","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.1.25","dns":"mail.corp.example"}},
        {"id":"person","kind":"person","x":560,"y":120,"label":"Finance manager","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"role":"Finance manager","email":"a.lee@corp.example","org":"Corp"},"disposition":"victim"},
        {"id":"laptop","kind":"laptop","x":560,"y":300,"label":"Finance laptop","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.20.41","dns":"fin-lt-07.corp.local"},"disposition":"victim","condition":"compromised"},
        {"id":"win","kind":"windows","x":800,"y":300,"label":"Windows 11","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.20.41","dns":"fin-lt-07.corp.local","version":"23H2"}},
        {"id":"cred","kind":"credential","x":560,"y":480,"label":"Cached domain creds","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"type":"password","severity":"high"}},
        {"id":"sw","kind":"switch","x":800,"y":480,"label":"Core switch","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.0.2","dns":"core-sw.corp.local"}},
        {"id":"ap","kind":"accesspoint","x":800,"y":120,"label":"Office Wi-Fi","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.0.30","dns":"ap-2f.corp.local"}},
        {"id":"ids","kind":"idsips","x":1060,"y":120,"label":"IDS sensor","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.0.40","dns":"ids.corp.local"}},
        {"id":"siem","kind":"siem","x":1060,"y":300,"label":"SIEM","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.0.50","dns":"siem.corp.local"},"condition":"issue"},
        {"id":"nas","kind":"nas","x":1060,"y":480,"label":"File server","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.30.10","dns":"files.corp.local"},"disposition":"victim","condition":"infected"},
        {"id":"bak","kind":"backupserver","x":1060,"y":660,"label":"Backup server","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.30.20","dns":"backup.corp.local"},"condition":"vulnerable"},
        {"id":"db","kind":"database","x":1320,"y":480,"label":"ERP database","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.30.12","dns":"erp-db.corp.local"},"condition":"suspicious"},
        {"id":"rw","kind":"ransomware","x":1320,"y":660,"label":"Ransomware","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"family":"LockBit 3.0","severity":"critical"}},
        {"id":"dc","kind":"datacenter","x":1320,"y":300,"label":"Server room","sublabel":"","color":null,"addr":"","rail":"","notes":"","status":null,"flags":[],"fields":{"ip":"10.0.30.0","dns":"srv.corp.local"}},
      ],
      wires: [
        {"id":"w1","bus":"link","from":{"node":"lure","port":"e"},"to":{"node":"mail","port":"w"},"label":"invoice.html attached","arrow":"fwd","style":null,"flow":null},
        {"id":"w2","bus":"link","from":{"node":"atk","port":"n"},"to":{"node":"lure","port":"s"},"label":"sends","arrow":"fwd","style":null,"flow":null},
        {"id":"w3","bus":"eth","from":{"node":"mail","port":"e"},"to":{"node":"person","port":"w"},"label":"delivered","arrow":"fwd","style":null,"flow":null},
        {"id":"w4","bus":"link","from":{"node":"person","port":"s"},"to":{"node":"laptop","port":"n"},"label":"opens the attachment","arrow":"fwd","style":null,"flow":null},
        {"id":"w5","bus":"eth","from":{"node":"laptop","port":"e"},"to":{"node":"win","port":"w"},"label":"macro runs","arrow":null,"style":"dashed","flow":null},
        {"id":"w6","bus":"link","from":{"node":"laptop","port":"s"},"to":{"node":"cred","port":"n"},"label":"dumps","arrow":"fwd","style":null,"flow":null},
        {"id":"w7","bus":"eth","from":{"node":"cred","port":"e"},"to":{"node":"sw","port":"w"},"label":"reused on the LAN","arrow":"fwd","style":null,"flow":null},
        {"id":"w8","bus":"eth","from":{"node":"net","port":"e"},"to":{"node":"fw","port":"w"},"label":"uplink","arrow":null,"style":null,"flow":null},
        {"id":"w9","bus":"eth","from":{"node":"fw","port":"e"},"to":{"node":"cred","port":"w"},"label":"allowed","arrow":null,"style":null,"flow":null},
        {"id":"w10","bus":"eth","from":{"node":"atk","port":"s"},"to":{"node":"net","port":"n"},"label":"C2 over HTTPS","arrow":"fwd","style":null,"flow":null},
        {"id":"w11","bus":"eth","from":{"node":"sw","port":"e"},"to":{"node":"nas","port":"w"},"label":"SMB","arrow":"fwd","style":null,"flow":null},
        {"id":"w12","bus":"eth","from":{"node":"sw","port":"n"},"to":{"node":"siem","port":"w"},"label":"logs","arrow":null,"style":null,"flow":null},
        {"id":"w13","bus":"eth","from":{"node":"ap","port":"e"},"to":{"node":"ids","port":"w"},"label":"mirror port","arrow":null,"style":null,"flow":null},
        {"id":"w14","bus":"eth","from":{"node":"ids","port":"s"},"to":{"node":"siem","port":"n"},"label":"alerts","arrow":"fwd","style":null,"flow":null},
        {"id":"w15","bus":"eth","from":{"node":"nas","port":"s"},"to":{"node":"bak","port":"n"},"label":"nightly copy","arrow":null,"style":null,"flow":null},
        {"id":"w16","bus":"link","from":{"node":"rw","port":"n"},"to":{"node":"nas","port":"e"},"label":"encrypts shares","arrow":"fwd","style":null,"flow":null},
        {"id":"w17","bus":"link","from":{"node":"rw","port":"w"},"to":{"node":"bak","port":"e"},"label":"deletes snapshots","arrow":"fwd","style":"dashed","flow":null},
        {"id":"w18","bus":"eth","from":{"node":"nas","port":"e"},"to":{"node":"db","port":"net"},"label":"same VLAN","arrow":null,"style":null,"flow":null},
        {"id":"w19","bus":"eth","from":{"node":"ap","port":"s"},"to":{"node":"sw","port":"n"},"label":"trunk","arrow":null,"style":null,"flow":null},
        {"id":"w20","bus":"eth","from":{"node":"dc","port":"s"},"to":{"node":"db","port":"net"},"label":"houses","arrow":null,"style":"dashed","flow":null},
      ],
      zones: [
        {"id":"z1","x":20,"y":80,"w":220,"h":520,"label":"Internet","color":"#f87171"},
        {"id":"z2","x":270,"y":80,"w":690,"h":520,"label":"Office LAN","color":"#60a5fa"},
        {"id":"z3","x":1030,"y":80,"w":460,"h":700,"label":"Server room","color":"#f59e0b"},
      ],
      notes: [
        {"id":"t1","x":20,"y":830,"text":"Fictional teaching scenario. Conditions on the cards show the state of each host at the end of day one: the laptop is compromised, the file server infected, the backup server exposed, and the SIEM raised an alert nobody read."},
      ],
      journey: [
        {"id":"j1","label":"Phishing","view":{"cx":400,"cy":230,"zoom":0.9},"caption":"A fake invoice reaches the finance manager through the mail gateway and the attachment runs a macro on the laptop."},
        {"id":"j2","label":"Lateral movement","view":{"cx":700,"cy":420,"zoom":0.9},"caption":"Cached domain credentials are dumped from the laptop and reused on the core switch's VLANs; the firewall never sees it."},
        {"id":"j3","label":"Impact","view":{"cx":1200,"cy":500,"zoom":0.85},"caption":"Ransomware encrypts the file server shares and deletes the backup snapshots; the ERP database shares the VLAN and shows suspicious reads."},
        {"id":"j4","label":"What detection saw","view":{"cx":1000,"cy":230,"zoom":0.9},"caption":"The IDS sensor on the mirror port alerted the SIEM at the credential reuse; the alert sat unread, which is the issue tag on the SIEM."},
      ],
    },
  },
];
