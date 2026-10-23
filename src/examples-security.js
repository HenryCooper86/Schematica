// Security explainer examples: a published CVE drawn as an attack chain, and
// a board rebuilt from an incident log by the reconstruct_from_log feature
// (src/incident-replay.js), with its layout spread for reading. Both are
// illustrations: the CVE board is not an assessment of a real system and the
// incident log is fictional teaching data.
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
        {"id": "atk", "kind": "threatactor", "x": 40, "y": 380, "label": "Attacker", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "disposition": "adversary", "fields": {"type": "criminal", "motivation": "personal-gain", "severity": "high"}},
        {"id": "laptop", "kind": "hostpc", "x": 680, "y": 40, "label": "Operator laptop", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "vpn", "kind": "vpn", "x": 680, "y": 240, "label": "Fleet VPN", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "fleet", "kind": "server", "x": 680, "y": 400, "label": "Fleet manager", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "ota", "kind": "server", "x": 680, "y": 560, "label": "OTA server", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
        {"id": "robot", "kind": "aisbc", "x": 980, "y": 560, "label": "Delivery robot", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": [], "disposition": "victim"},
        {"id": "store", "kind": "database", "x": 680, "y": 720, "label": "Telemetry store", "sublabel": "", "color": null, "addr": "", "rail": "", "notes": "", "status": null, "flags": []},
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
        {"id": "z1", "x": 650, "y": 0, "w": 180, "h": 140, "label": "Operations office", "color": "#f59e0b"},
        {"id": "z2", "x": 650, "y": 200, "w": 200, "h": 620, "label": "Fleet cloud", "color": "#f59e0b"},
        {"id": "z3", "x": 950, "y": 520, "w": 180, "h": 140, "label": "Robots in the field", "color": "#f59e0b"},
      ],
      notes: [
        {"id": "n1", "x": 40, "y": 100, "text": "Reconstructed from a log. Steps are what the log recorded, not independent proof of execution. IR-2026-03 (fictional teaching log)"},
      ],
      journey: [
        {"id": "j1", "label": "Phase: Initial access", "caption": "Initial access — 2 logged action(s).", "view": {"cx": 412, "cy": 247, "zoom": 0.95}, "targets": {"nodes": ["laptop"], "wires": []}},
        {"id": "j2", "label": "Phase: Access", "caption": "Access — 2 logged action(s).", "view": {"cx": 412, "cy": 357, "zoom": 0.95}, "targets": {"nodes": ["vpn", "fleet"], "wires": []}},
        {"id": "j3", "label": "Phase: Impact", "caption": "Impact — 2 logged action(s).", "view": {"cx": 562, "cy": 507, "zoom": 0.95}, "targets": {"nodes": ["ota", "robot"], "wires": []}},
        {"id": "j4", "label": "Phase: Exfiltration", "caption": "Exfiltration — 1 logged action(s).", "view": {"cx": 412, "cy": 587, "zoom": 0.95}, "targets": {"nodes": ["store"], "wires": []}},
      ],
    },
  },
];
