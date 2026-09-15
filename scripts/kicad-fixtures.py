#!/usr/bin/env python3
"""Export official/local KiCad schematics and derive a topology oracle via ElementTree.
Usage: python3 scripts/kicad-fixtures.py schematic.kicad_sch [...]
Files are local validation artifacts, not redistributed source designs.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / '.acceptance' / 'kicad'
OUTPUT.mkdir(parents=True, exist_ok=True)
cli = os.environ.get('KICAD_CLI') or shutil.which('kicad-cli')
if not cli:
    raise SystemExit('Install KiCad or set KICAD_CLI')
if len(sys.argv) < 2:
    raise SystemExit(__doc__)
port_limit = int(subprocess.check_output(['node', '--input-type=module', '-e', "import {LIMITS} from './src/custom.js';console.log(LIMITS.ports)"], cwd=ROOT, text=True))
report = {'portLimit': port_limit, 'kicadVersion': subprocess.check_output([cli, '--version'], text=True).strip(), 'fixtures': []}
for index, source in enumerate(sys.argv[1:]):
    source = Path(source).resolve()
    target = OUTPUT / f'{index}-{source.stem}.xml'
    subprocess.run([cli, 'sch', 'export', 'netlist', '--format', 'kicadxml', '--output', str(target), str(source)], check=True)
    root = ET.parse(target).getroot()
    components = sorted(c.attrib['ref'] for c in root.findall('./components/comp'))
    pins = {}
    nets = []
    for net in root.findall('./nets/net'):
        ends = sorted(set((node.attrib['ref'], node.attrib['pin']) for node in net.findall('node')))
        if not ends:
            continue
        nets.append({'name': net.attrib['name'], 'pins': ends})
        for ref, pin in ends:
            pins.setdefault(ref, set()).add(pin)
    item = {'name': source.stem, 'source': str(source), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'xmlSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'url': '/' + str(target.relative_to(ROOT)),
            'components': components, 'nets': nets, 'maxConnectedPins': max(map(len, pins.values()), default=0)}
    if item['maxConnectedPins'] > port_limit:
        item['expectedRejection'] = f'More than {port_limit} connected pins on one component'
    report['fixtures'].append(item)
    print(f"{source.stem}: {len(components)} components, {len(nets)} nets, maximum {item['maxConnectedPins']} connected pins")
(OUTPUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print(OUTPUT / 'manifest.json')
