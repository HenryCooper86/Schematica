// Palette search: a part matches when every word of the query appears in its
// name, kind, category, port names and buses, or the names and spec notes of
// the vendor presets attached to it — so "RDK" or "Journey" finds the
// generic part.
import { PARTS, CATEGORIES } from './palette.js';
import { BUSES } from './buses.js';
import { presetsFor } from './presets.js';
import { trd } from './i18n.js';

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
// Hyphens are dropped on both sides so "wi-fi", "nb-iot", "usb-c" and
// "rs-485" match however the part or the engineer spells them.
const norm = (text) => String(text ?? '').toLowerCase().replace(/-/g, '');
const words = (query) => norm(query).split(/\s+/).filter(Boolean);

// Words engineers type that are not in a part's name, ports or presets:
// product families, protocol shorthands and the IT-side jargon the
// net_draw-style categories attract. Kept here, beside the search, so the
// catalogue stays a description of the parts and not of how people look
// for them.
export const SEARCH_ALIASES = {
  mcu: 'microcontroller arduino stm32 esp32 esp8266 nrf52 rp2040 pico atmega avr pic',
  sbc: 'raspberry pi jetson beaglebone orange pi linux board',
  fpga: 'xilinx lattice ice40 altera programmable logic',
  dsp: 'signal processor audio',
  temp: 'temperature thermistor humidity dht22 bme280 sht31',
  imu: 'accelerometer gyroscope gyro mpu6050 bno055 icm',
  gps: 'gnss glonass beidou galileo position',
  camera: 'webcam image vision',
  adcin: 'analogue voltage sense',
  motor: 'dc motor brushless bldc esc drive',
  servo: 'sg90 pwm actuator',
  stepper: 'nema a4988 tmc2209 drv8825',
  relay: 'contactor switch load',
  led: 'light neopixel ws2812 indicator',
  display: 'oled lcd tft screen epaper e-ink',
  buzzer: 'speaker beeper piezo',
  battery: 'lipo li-ion 18650 cell pack',
  regulator: 'ldo buck boost dc-dc vreg converter',
  charger: 'bms tp4056 charging',
  solar: 'pv photovoltaic',
  jack: 'barrel dc input',
  wifi: 'wi-fi wlan bluetooth ble 802.11 esp32 wireless',
  lora: 'lorawan 868 915 long range',
  cellular: 'lte 4g 5g nb-iot gsm modem sim',
  ethphy: 'phy rj45 lan rmii',
  usbport: 'usb-c type-c micro-usb socket',
  cantrx: 'mcp2515 tja1050 transceiver',
  antenna: 'aerial sma u.fl',
  encoder: 'quadrature feedback',
  lidar: 'laser scanner ranging',
  ultrasonic: 'hc-sr04 distance',
  tof: 'vl53l0x time of flight distance',
  limitswitch: 'endstop microswitch',
  aisbc: 'robot kit edge ai npu',
  depthcam: 'realsense stereo 3d',
  servobus: 'dynamixel serial servo',
  motorctl: 'odrive vesc controller',
  vbat: '12v 24v 48v vehicle',
  obd: 'obd2 diagnostic',
  hbridge: 'l298n drv8871',
  radar: 'mmwave 77ghz',
  t1switch: '100base-t1 1000base-t1',
  cloud: 'aws azure gcp mqtt broker saas iot hub',
  server: 'host machine backend',
  database: 'db sql mysql postgres postgresql mariadb mongodb redis sqlite',
  gateway: 'edge iot gateway bridge',
  mobile: 'app smartphone ios android',
  hostpc: 'desktop computer workstation dev machine',
  container: 'docker podman oci',
  vm: 'virtual machine hypervisor guest',
  kubernetes: 'k8s cluster orchestration pod',
  package: 'library dependency npm pip apt',
  kernel: 'driver module',
  daemon: 'service systemd background',
  queue: 'mq rabbitmq kafka broker',
  cache: 'redis memcached',
  hypervisor: 'esxi proxmox kvm xen',
  san: 'storage area network fibre channel',
  nas: 'network attached storage share smb nfs',
  secretstore: 'vault keys credentials env',
  linux: 'rhel centos fedora unix',
  windows: 'win10 win11 server active directory ad',
  macos: 'mac apple osx',
  android: 'phone tablet',
  ios: 'iphone ipad apple',
  internet: 'wan public isp',
  accesspoint: 'ap wlan wi-fi wifi wireless',
  router: 'nat bgp edge',
  switch: 'vlan layer 2 l2',
  asn: 'autonomous system bgp',
  ipaddress: 'address host cidr',
  dnsserver: 'dns bind resolver',
  mailserver: 'smtp imap exchange email',
  firewall: 'pfsense fortigate palo alto ngfw acl',
  waf: 'web application firewall',
  proxy: 'squid reverse forward',
  cdn: 'cloudflare akamai edge',
  loadbalancer: 'lb haproxy nginx f5',
  apigateway: 'api gateway kong rest',
  webserver: 'nginx apache httpd iis http',
  appserver: 'tomcat node backend api',
  siem: 'splunk elastic logs soc',
  idsips: 'ids ips snort suricata detection',
  vpn: 'wireguard openvpn ipsec tunnel',
  hsm: 'hardware security module tpm keys',
  workstation: 'desktop pc endpoint',
  laptop: 'notebook',
  phone: 'mobile smartphone',
  iot: 'smart device',
  ot: 'plc scada ics hmi industrial',
  datacenter: 'dc colocation',
  cctv: 'camera surveillance',
  badge: 'access card rfid',
  threatactor: 'apt attacker adversary hacker group',
  insider: 'employee rogue',
  malware: 'virus trojan worm rat',
  ransomware: 'lockbit encryption extortion',
  botnet: 'mirai zombie',
  phishing: 'spear lure email',
  c2: 'command and control beacon',
  vulnerability: 'cve cwe weakness bug',
  misconfig: 'misconfiguration default password open port',
  exploit: 'poc rce',
  supplychain: 'dependency vendor firmware',
  ddos: 'dos flood amplification',
  mitm: 'man in the middle on-path intercept',
  spoofing: 'jamming fake',
  credential: 'password leak stuffing token',
  dataleak: 'exfiltration leak breach',
  physical: 'tamper access',
  person: 'user employee staff admin',
  storage: 'disk file archive',
  eeprom: 'flash memory nor w25q',
  sdcard: 'microsd tf',
  rtc: 'clock ds3231',
  crystal: 'oscillator xtal',
  debug: 'jtag swd',
  header: 'pins connector',
  fuse: 'protection',
};

export function partHaystack(part) {
  const category = CATEGORY_NAME[part.category] || part.category;
  const bits = [
    part.name, trd(part.name), part.kind, category, trd(category),
    ...part.ports.flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus] && trd(BUSES[p.bus].name), BUSES[p.bus]?.short]),
    ...presetsFor(part.kind).flatMap((p) => [p.name, p.sublabel, p.notes, trd(p.notes)]),
    SEARCH_ALIASES[part.kind],
  ];
  return norm(bits.filter(Boolean).join(' '));
}

export function filterParts(query) {
  const ws = words(query);
  const hits = new Set();
  for (const part of Object.values(PARTS)) {
    const hay = partHaystack(part);
    if (ws.every((w) => hay.includes(w))) hits.add(part.kind);
  }
  return hits;
}

// Library templates (custom part definitions with an id) search the same way.
// The list is passed in so this module stays free of storage.
export function templateHaystack(t) {
  const category = CATEGORY_NAME[t.category] || t.category;
  const bits = [
    t.name, category,
    ...(t.ports || []).flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus]?.short, BUSES[p.bus] && trd(BUSES[p.bus].name)]),
    'custom', 'library', trd(category),
  ];
  return norm(bits.filter(Boolean).join(' '));
}

export function filterTemplates(query, templates) {
  const ws = words(query);
  return templates.filter((t) => {
    const hay = templateHaystack(t);
    return ws.every((w) => hay.includes(w));
  });
}
