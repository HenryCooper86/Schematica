export const CATEGORIES = [
  { id: 'compute', name: 'Compute' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'actuators', name: 'Actuators' },
  { id: 'power', name: 'Power' },
  { id: 'connectivity', name: 'Connectivity' },
  { id: 'robotics', name: 'Robotics' },
  { id: 'automotive', name: 'Automotive' },
  { id: 'system', name: 'System & Cloud' },
  { id: 'network', name: 'Network' },
  { id: 'security', name: 'Security & Edge' },
  { id: 'flow', name: 'Process Flow' },
  { id: 'threats', name: 'Threats' },
  { id: 'misc', name: 'Storage / Misc' },
];

export const CATEGORY_COLORS = {
  compute: '#818cf8',
  sensors: '#22d3ee',
  actuators: '#fbbf24',
  power: '#f87171',
  connectivity: '#60a5fa',
  robotics: '#f472b6',
  automotive: '#facc15',
  system: '#e879f9',
  network: '#38bdf8',
  security: '#f43f5e',
  flow: '#60a5fa',
  threats: '#ef4444',
  misc: '#34d399',
};

// ---- Threat metadata (STIX 2.1 open vocabularies where they exist) ----
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
export const SEVERITY_COLORS = { info: '#94a3b8', low: '#34d399', medium: '#fbbf24', high: '#fb923c', critical: '#ef4444' };
// How an object relates to you; any node may carry one, shown as a tag.
export const DISPOSITIONS = {
  friendly: { name: 'Friendly', color: '#34d399' },
  partner: { name: 'Partner', color: '#2dd4bf' },
  neutral: { name: 'Neutral', color: '#94a3b8' },
  unknown: { name: 'Unknown', color: '#64748b' },
  suspicious: { name: 'Suspicious', color: '#fb923c' },
  adversary: { name: 'Adversary', color: '#ef4444' },
  victim: { name: 'Victim', color: '#fbbf24' },
};
const STIX_ACTOR_TYPES = ['activist', 'competitor', 'crime-syndicate', 'criminal', 'hacker', 'insider-accidental',
  'insider-disgruntled', 'nation-state', 'sensationalist', 'spy', 'terrorist', 'unknown'];
const STIX_SOPHISTICATION = ['none', 'minimal', 'intermediate', 'advanced', 'expert', 'innovator', 'strategic'];
const STIX_MOTIVATION = ['accidental', 'coercion', 'dominance', 'ideology', 'notoriety', 'organizational-gain',
  'personal-gain', 'personal-satisfaction', 'revenge', 'unpredictable'];
const STIX_MALWARE_TYPES = ['adware', 'backdoor', 'bot', 'bootkit', 'ddos', 'downloader', 'dropper', 'exploit-kit',
  'keylogger', 'ransomware', 'remote-access-trojan', 'rootkit', 'screen-capture', 'spyware', 'trojan', 'virus',
  'webshell', 'wiper', 'worm', 'unknown'];
const INSIDER_TYPES = ['insider-accidental', 'insider-disgruntled', 'insider-malicious', 'insider-compromised'];
// A schema field: `options` renders a select, otherwise free text with a placeholder.
const f = (id, label, extra = {}) => ({ id, label, ...extra });
const SEVERITY = f('severity', 'Severity', { options: SEVERITIES });
// Network and security devices: a model stays in the part number, these join it.
const NET_FIELDS = [f('ip', 'IP address', { placeholder: 'e.g. 10.0.20.11' }), f('dns', 'DNS name', { placeholder: 'e.g. web01.corp.local' })];

// ---- Power budget (see power.js) ----
// Current is free text so a datasheet line survives being pasted as written:
// "250mA", "0.25 A", "3.6uA", "2 Ah". A part that carries these keeps the
// hardware trio (part number, address, rail) as well, which `trio` says.
// `feeds` lists the pins current leaves a supply by; `passes` lists the pins
// of a part that carries a rail straight through without being either end of
// it. Everything else on the power bus draws.
const DRAW_FIELDS = [
  f('ityp', 'Typical current', { placeholder: 'e.g. 80mA' }),
  f('ipeak', 'Peak current', { placeholder: 'e.g. 350mA' }),
];
const LIMIT_FIELD = f('imax', 'Output current limit', { placeholder: 'e.g. 600mA' });
// A consumer: it draws from whichever rail its VCC pin is wired to.
const DRAWS = { trio: true, fields: DRAW_FIELDS };
// A supply: it is the head of a rail and nothing upstream of it is modelled.
const SUPPLIES = { trio: true, fields: [LIMIT_FIELD], feeds: ['out'] };
// A cell also stores charge, which is what a runtime estimate needs.
const STORES = { trio: true, fields: [f('capacity', 'Capacity', { placeholder: 'e.g. 2000mAh' }), LIMIT_FIELD], feeds: ['out'] };
// A regulator sits on two rails at once: it draws on its input and supplies
// its output. Its input draw is the one place a declared figure matters more
// than a derived one, so it can state that too.
const REGULATES = { trio: true, fields: [...DRAW_FIELDS, LIMIT_FIELD], feeds: ['out'] };
// A part in series with a whole rail: it heads no rail of its own, but the one
// number it exists for is a limit on everything flowing through it.
const PROTECTS = (pins) => ({ trio: true, fields: [f('imax', 'Current rating', { placeholder: 'e.g. 2A' })], passes: pins });

const p = (id, name, side, offset, bus) => ({ id, name, side, offset, bus });
const pwr = (side = 'left') => [p('vcc', 'VCC', side, 0.3, 'power'), p('gnd', 'GND', side, 0.7, 'gnd')];
const part = (kind, category, name, icon, ports, extra = {}) => ({ kind, category, name, icon, ports, ...extra });
// Four side ports of one bus, for devices that connect on any side.
const sides = (bus, name) => [
  p('n', name, 'top', 0.5, bus), p('e', name, 'right', 0.5, bus), p('s', name, 'bottom', 0.5, bus), p('w', name, 'left', 0.5, bus),
];
// A net_draw-style type: a 24-box glyph (inner SVG markup) and a per-type
// accent instead of a 16-box path; `extra` carries shape, threat, or defaultLabel.
const nd = (kind, category, name, accent, glyph, ports, extra = {}) => ({ kind, category, name, icon: null, glyph, accent, ports, ...extra });

export const PARTS = {
  // Compute
  mcu: part('mcu', 'compute', 'MCU', 'M4 4h8v8H4z M6 1v3 M10 1v3 M6 12v3 M10 12v3 M1 6h3 M1 10h3 M12 6h3 M12 10h3', [
    ...pwr(),
    p('i2c', 'I2C', 'right', 0.2, 'i2c'), p('spi', 'SPI', 'right', 0.4, 'spi'),
    p('uart', 'UART', 'right', 0.6, 'uart'), p('usb', 'USB', 'right', 0.8, 'usb'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('pwm', 'PWM', 'bottom', 0.6, 'pwm'), p('adc', 'ADC', 'bottom', 0.8, 'adc'),
    p('can', 'CAN', 'top', 0.5, 'can'),
  ], DRAWS),
  sbc: part('sbc', 'compute', 'SoC / SBC', 'M2 3h12v10H2z M4.5 5.5h3v3h-3z M10 5.5h2.5 M10 8h2.5 M4.5 11h7', [
    ...pwr(),
    p('eth', 'ETH', 'right', 0.25, 'eth'), p('usb', 'USB', 'right', 0.5, 'usb'),
    p('uart', 'UART', 'right', 0.75, 'uart'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('i2c', 'I2C', 'bottom', 0.6, 'i2c'), p('spi', 'SPI', 'bottom', 0.8, 'spi'),
  ], DRAWS),
  fpga: part('fpga', 'compute', 'FPGA', 'M3 3h10v10H3z M6.3 3v10 M9.6 3v10 M3 6.3h10 M3 9.6h10', [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.25, 'spi'), p('uart', 'UART', 'right', 0.5, 'uart'),
    p('gpio1', 'IO', 'right', 0.75, 'gpio'),
    p('gpio2', 'IO', 'bottom', 0.33, 'gpio'), p('gpio3', 'IO', 'bottom', 0.66, 'gpio'),
  ], DRAWS),
  dsp: part('dsp', 'compute', 'DSP', 'M3 3h10v10H3z M5 8h1.5l1-2 1.5 4 1-2H11', [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.33, 'spi'), p('i2c', 'I2C', 'right', 0.66, 'i2c'),
    p('adc1', 'ADC', 'bottom', 0.33, 'adc'), p('adc2', 'ADC', 'bottom', 0.66, 'adc'),
  ], DRAWS),
  // Sensors
  temp: part('temp', 'sensors', 'Temp sensor', 'M7 2a1.5 1.5 0 0 1 3 0v7a3 3 0 1 1-3 0z M8.5 6v5',
    [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')], DRAWS),
  imu: part('imu', 'sensors', 'IMU', 'M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M8 1v3 M8 12v3 M1 8h3 M12 8h3',
    [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('spi', 'SPI', 'right', 0.7, 'spi')], DRAWS),
  gps: part('gps', 'sensors', 'GPS', 'M8 15s-5-4.5-5-8a5 5 0 1 1 10 0c0 3.5-5 8-5 8z M8 7m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
    [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')], DRAWS),
  camera: part('camera', 'sensors', 'Camera', 'M2 5h3l1.5-2h3L11 5h3v8H2z M8 9m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0',
    [...pwr(), p('i2c', 'CTRL', 'right', 0.3, 'i2c'), p('spi', 'DATA', 'right', 0.7, 'spi')], DRAWS),
  adcin: part('adcin', 'sensors', 'Analog input', 'M2 11c2-6 4-6 6 0 M8 11h2V8h2V5h2',
    [...pwr(), p('out', 'OUT', 'right', 0.5, 'adc')], DRAWS),
  sensor: part('sensor', 'sensors', 'Sensor', 'M8 8m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0 M4.5 4.5a5 5 0 0 0 0 7 M11.5 4.5a5 5 0 0 1 0 7',
    [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('int', 'INT', 'right', 0.7, 'gpio')], DRAWS),
  // Actuators (power on top, control on the left)
  motor: part('motor', 'actuators', 'Motor + driver', 'M2 6h3V4h6v8H5v-2H2z M11 6h3v4h-3 M6.5 6.5v3 M8.5 6.5v3',
    [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')], DRAWS),
  servo: part('servo', 'actuators', 'Servo', 'M2 9h12v4H2z M6 9V5.5a2 2 0 0 1 4 0V9 M8 5.5 11 2.5',
    [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')], DRAWS),
  relay: part('relay', 'actuators', 'Relay', 'M1 8h4 M11 8h4 M5 8l5.5-4',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')], DRAWS),
  led: part('led', 'actuators', 'LED', 'M5 2h6v6a3 3 0 0 1-6 0z M5 8h6 M6.5 11v3 M9.5 11v3',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')], DRAWS),
  display: part('display', 'actuators', 'Display', 'M2 3h12v8H2z M5 13h6 M8 11v2',
    [...pwr('top'), p('i2c', 'I2C', 'left', 0.35, 'i2c'), p('spi', 'SPI', 'left', 0.7, 'spi')], DRAWS),
  buzzer: part('buzzer', 'actuators', 'Buzzer', 'M2 6h3l4-3v10l-4-3H2z M11 5a4 4 0 0 1 0 6 M13 3a7 7 0 0 1 0 10',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'pwm')], DRAWS),
  // Power (outputs on the right)
  battery: part('battery', 'power', 'Battery', 'M2 5h10v6H2z M12 7h2v2h-2 M4 7v2 M6.5 7v2',
    [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')], STORES),
  regulator: part('regulator', 'power', 'Regulator', 'M4 4h8v8H4z M1 8h3 M12 8h3 M6 8h1l1-2 1 3 1-1',
    [p('in', 'IN', 'left', 0.5, 'power'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')], REGULATES),
  // A charger's OUT and BAT pins sit on the cell, so for the budget it carries
  // the battery's rail through rather than heading one of its own.
  charger: part('charger', 'power', 'Charger', 'M3 3h10v10H3z M8.5 5 6.5 8.5h2L7 11l3-4H8z',
    [p('in', 'USB IN', 'left', 0.5, 'usb'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd'), p('bat', 'BAT', 'bottom', 0.5, 'power')], { passes: ['out', 'bat'] }),
  solar: part('solar', 'power', 'Solar panel', 'M2 4h12l-2 8H4z M5.5 4l-1 8 M10.5 4l1 8 M2.7 8h10.6',
    [p('out', 'OUT', 'right', 0.5, 'power')], SUPPLIES),
  jack: part('jack', 'power', 'Power jack', 'M2 5h8v6H2z M10 6h4 M10 10h4 M4 5V3',
    [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')], SUPPLIES),
  // Connectivity
  wifi: part('wifi', 'connectivity', 'WiFi / BLE', 'M1.5 6a9 9 0 0 1 13 0 M4 8.8a5.5 5.5 0 0 1 8 0 M6.5 11.5a2.5 2.5 0 0 1 3 0 M8 14h.01',
    [...pwr(), p('uart', 'UART', 'right', 0.3, 'uart'), p('spi', 'SPI', 'right', 0.6, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')], DRAWS),
  lora: part('lora', 'connectivity', 'LoRa', 'M8 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M5 5a4.5 4.5 0 0 0 0 6 M11 5a4.5 4.5 0 0 1 0 6 M3 3a8 8 0 0 0 0 10 M13 3a8 8 0 0 1 0 10',
    [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')], DRAWS),
  cellular: part('cellular', 'connectivity', 'Cellular', 'M2 13v-3 M5.5 13V7 M9 13V4 M12.5 13V1.5',
    [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')], DRAWS),
  ethphy: part('ethphy', 'connectivity', 'Ethernet PHY', 'M3 3h10v7H3z M5 10v3 M11 10v3 M5.5 5.5v2 M8 5.5v2 M10.5 5.5v2',
    [...pwr(), p('eth', 'ETH', 'right', 0.5, 'eth'), p('mii', 'MII', 'bottom', 0.5, 'gpio')], DRAWS),
  // VBUS is a supply pin, not a consumption one: a USB socket is the commonest
  // 5V source on a hobby board, so it heads a rail like any other supply. It
  // is deliberately not named "vcc" - the checks require a vcc pin to be
  // wired, and a board that only uses the data pins is not wrong.
  usbport: part('usbport', 'connectivity', 'USB port', 'M8 2v12 M8 11 4.5 9V6.5 M8 9l3.5-2V4.5 M8 2 6.5 4h3z',
    [p('vbus', 'VBUS', 'right', 0.2, 'power'), p('usb', 'USB', 'right', 0.6, 'usb')],
    { trio: true, fields: [LIMIT_FIELD], feeds: ['vbus'] }),
  cantrx: part('cantrx', 'connectivity', 'CAN transceiver', 'M1 8h14 M4 8V5h3v3 M9 8v3h3V8',
    [...pwr('top'), p('mcu', 'TX/RX', 'left', 0.5, 'can'), p('bus', 'BUS', 'right', 0.5, 'can')], DRAWS),
  antenna: part('antenna', 'connectivity', 'RF antenna', 'M8 15V6 M3 2a7 7 0 0 1 10 0 M5.3 4.2a4 4 0 0 1 5.4 0 M8 6m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    [p('feed', 'FEED', 'bottom', 0.5, 'rf')]),
  // Robotics
  stepper: part('stepper', 'robotics', 'Stepper + driver', 'M8 8m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0 M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M8 2.5v2 M8 11.5v2 M2.5 8h2 M11.5 8h2 M4.1 4.1l1.4 1.4 M10.5 10.5l1.4 1.4 M11.9 4.1l-1.4 1.4 M5.5 10.5l-1.4 1.4',
    [...pwr('top'), p('step', 'STEP', 'left', 0.35, 'gpio'), p('dir', 'DIR', 'left', 0.7, 'gpio')], DRAWS),
  encoder: part('encoder', 'robotics', 'Encoder', 'M8 8m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0 M8 2.5v2.5 M8 11v2.5 M2.5 8h2.5 M11 8h2.5 M8 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    [...pwr(), p('a', 'A', 'right', 0.35, 'gpio'), p('b', 'B', 'right', 0.7, 'gpio')], DRAWS),
  lidar: part('lidar', 'robotics', 'LiDAR', 'M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 8 14 4 M10 2.5a6 6 0 0 1 3.5 3 M8 8 2 12 M4.5 13.5a6 6 0 0 1-2.4-3.7',
    [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart')], DRAWS),
  ultrasonic: part('ultrasonic', 'robotics', 'Ultrasonic', 'M5 8m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M11 8m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M2 3h12v10H2z',
    [...pwr(), p('trig', 'TRIG', 'right', 0.35, 'gpio'), p('echo', 'ECHO', 'right', 0.7, 'gpio')], DRAWS),
  tof: part('tof', 'robotics', 'ToF sensor', 'M3 5h4v6H3z M7 8h6 M10.5 5.5 13 8l-2.5 2.5',
    [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')], DRAWS),
  limitswitch: part('limitswitch', 'robotics', 'Limit switch', 'M2 11h12 M4 11 10 5 M10.5 4.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M4 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    [p('out', 'OUT', 'right', 0.5, 'gpio')]),
  // Robot compute and perception (vendor kits such as D-Robotics RDK boards
  // are presets on these generic parts; see presets.js).
  rdksoftware: part('rdksoftware', 'robotics', 'RDK software stage', 'M2 3h12v10H2z M5 6l-2 2 2 2 M11 6l2 2-2 2', [p('in', 'IN', 'left', 0.5, 'flow'), p('out', 'OUT', 'right', 0.5, 'flow')], { fields: [f('package', 'Package', { placeholder: 'e.g. hobot_dnn' }), f('runtime', 'Runtime (optional)', { placeholder: 'Not selected' }), f('target', 'Target RDK board')] }),
  aisbc: part('aisbc', 'robotics', 'AI SBC / robot kit', 'M2 3h12v10H2z M5.5 6h5v4h-5z M1 6h1 M1 10h1 M14 6h1 M14 10h1 M4 3V1.5 M8 3V1.5 M12 3V1.5', [
    ...pwr(),
    p('eth', 'ETH', 'right', 0.2, 'eth'), p('usb', 'USB', 'right', 0.4, 'usb'),
    p('uart', 'UART', 'right', 0.6, 'uart'), p('canfd', 'CAN FD', 'right', 0.8, 'canfd'),
    p('csi1', 'CSI1', 'bottom', 0.2, 'mipi'), p('csi2', 'CSI2', 'bottom', 0.4, 'mipi'),
    p('i2c', 'I2C', 'bottom', 0.6, 'i2c'), p('gpio', 'GPIO', 'bottom', 0.8, 'gpio'),
    p('spi', 'SPI', 'top', 0.35, 'spi'), p('uart2', 'UART2', 'top', 0.7, 'uart'),
  ], DRAWS),
  // Powered over the ribbon / cable, so no supply pins.
  mipicam: part('mipicam', 'robotics', 'MIPI camera', 'M2 5h3l1.5-2h3L11 5h3v7H2z M8 8.5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M6 12v2.5 M10 12v2.5',
    [p('csi', 'CSI', 'right', 0.35, 'mipi'), p('i2c', 'CTRL', 'right', 0.7, 'i2c')]),
  depthcam: part('depthcam', 'robotics', 'Depth camera', 'M1.5 4h13v8h-13z M5 8m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M11 8m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M8 6v4',
    [p('usb', 'USB', 'right', 0.35, 'usb'), p('csi', 'CSI', 'right', 0.7, 'mipi')]),
  servobus: part('servobus', 'robotics', 'Serial servo', 'M2 6h8v5H2z M6 6V4a1.5 1.5 0 0 1 3 0v2 M10 8.5h4 M12 7v3',
    [...pwr('top'), p('bus', 'BUS', 'left', 0.5, 'rs485')], DRAWS),
  motorctl: part('motorctl', 'robotics', 'Motor controller', 'M2 4h9v8H2z M4 6.5h5 M4 9.5h3 M11 6h3 M11 10h3 M6.5 12v2',
    [...pwr(), p('canfd', 'CAN FD', 'top', 0.5, 'canfd'),
      p('m1', 'M1', 'right', 0.35, 'pwm'), p('m2', 'M2', 'right', 0.7, 'pwm'), p('enc', 'ENC', 'bottom', 0.5, 'gpio')], DRAWS),
  // Automotive
  vbat: part('vbat', 'automotive', 'Vehicle battery', 'M2 5h12v8H2z M4 5V3.5h2.5V5 M9.5 5V3.5H12V5 M4 8.5h3 M5.5 7v3 M9 8.5h3',
    [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')], STORES),
  fusebox: part('fusebox', 'automotive', 'Fuse box', 'M2 3h12v10H2z M5.5 3v10 M9 3v10 M3.2 5.5h1 M6.7 5.5h1 M10.2 5.5h1 M3.2 8.5h1 M6.7 8.5h1 M10.2 8.5h1',
    [p('in', 'IN', 'left', 0.5, 'power'),
      p('out1', 'OUT1', 'right', 0.25, 'power'), p('out2', 'OUT2', 'right', 0.5, 'power'), p('out3', 'OUT3', 'right', 0.75, 'power')], PROTECTS(['in', 'out1', 'out2', 'out3'])),
  obd: part('obd', 'automotive', 'OBD-II port', 'M2.5 5h11l-1.5 6h-8z M5 7h.01 M7 7h.01 M9 7h.01 M11 7h.01 M6 9h.01 M8 9h.01 M10 9h.01',
    [p('can', 'CAN', 'right', 0.5, 'can')]),
  lin: part('lin', 'automotive', 'LIN transceiver', 'M1 8h5 M10 8h5 M6 5h4v6H6z',
    [...pwr('top'), p('mcu', 'UART', 'left', 0.5, 'uart'), p('bus', 'LIN', 'right', 0.5, 'gpio')], DRAWS),
  hbridge: part('hbridge', 'automotive', 'H-bridge', 'M4 3v10 M12 3v10 M4 8h8 M2 5h2 M2 11h2 M12 5h2 M12 11h2',
    [...pwr('top'), p('in1', 'IN1', 'left', 0.35, 'pwm'), p('in2', 'IN2', 'left', 0.7, 'pwm'), p('out', 'OUT', 'right', 0.5, 'power')], DRAWS),
  wheelspeed: part('wheelspeed', 'automotive', 'Wheel speed', 'M6 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M6 8m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0 M11 8h1l1-2 1 4 1-2',
    [...pwr(), p('out', 'OUT', 'right', 0.5, 'adc')], DRAWS),
  // ADAS / vehicle compute and networks (Horizon Journey SoCs and Mono /
  // SuperDrive stacks are presets on these; see presets.js).
  autosoc: part('autosoc', 'automotive', 'Automotive SoC', 'M3 3h10v10H3z M5.5 5.5h5v5h-5z M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3.5 3.5l-2-2 M12.5 3.5l2-2 M3.5 12.5l-2 2 M12.5 12.5l2 2', [
    ...pwr(),
    p('cam1', 'CAM1', 'top', 0.3, 'gmsl'), p('cam2', 'CAM2', 'top', 0.7, 'gmsl'),
    p('canfd', 'CAN FD', 'right', 0.25, 'canfd'), p('t1', 'T1', 'right', 0.5, 't1'), p('eth', 'ETH', 'right', 0.75, 'eth'),
    p('csi', 'CSI', 'bottom', 0.33, 'mipi'), p('uart', 'UART', 'bottom', 0.66, 'uart'),
  ], DRAWS),
  adas: part('adas', 'automotive', 'ADAS controller', 'M2 10.5h12v2H2z M3.5 10.5 5 7h6l1.5 3.5 M5 12.5v1 M11 12.5v1 M8 2.5v2 M5.5 3.5 6.5 5 M10.5 3.5 9.5 5', [
    ...pwr(),
    p('cam1', 'CAM1', 'top', 0.2, 'gmsl'), p('cam2', 'CAM2', 'top', 0.4, 'gmsl'),
    p('cam3', 'CAM3', 'top', 0.6, 'gmsl'), p('cam4', 'CAM4', 'top', 0.8, 'gmsl'),
    p('canfd', 'CAN FD', 'right', 0.25, 'canfd'), p('canfd2', 'CAN FD2', 'right', 0.5, 'canfd'), p('t1', 'T1', 'right', 0.75, 't1'),
    p('usb', 'USB', 'bottom', 0.5, 'usb'),
  ], DRAWS),
  // Camera modules take power over the coax link, so no supply pins.
  frontcam: part('frontcam', 'automotive', 'Front camera', 'M3 5.5h10v6H3z M8 8.5m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M6 5.5V4h4v1.5 M13 8.5h2',
    [p('out', 'VIDEO', 'right', 0.35, 'gmsl'), p('i2c', 'CTRL', 'right', 0.7, 'i2c')]),
  radar: part('radar', 'automotive', 'mmWave radar', 'M8 13V8 M8 8m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0 M4.5 5.5a5 5 0 0 1 7 0 M2.5 3.5a8 8 0 0 1 11 0 M5 13h6',
    [...pwr(), p('canfd', 'CAN FD', 'right', 0.35, 'canfd'), p('t1', 'T1', 'right', 0.7, 't1')], DRAWS),
  t1switch: part('t1switch', 'automotive', 'T1 Ethernet switch', 'M2 5h12v6H2z M4 8h2 M7 8h2 M10 8h2 M4 11v2.5 M8 11v2.5 M12 11v2.5',
    [...pwr(), p('p1', 'P1', 'right', 0.25, 't1'), p('p2', 'P2', 'right', 0.5, 't1'), p('p3', 'P3', 'right', 0.75, 't1'),
      p('eth', 'ETH', 'bottom', 0.5, 'eth')], DRAWS),
  vgateway: part('vgateway', 'automotive', 'Vehicle gateway', 'M2 6h12v4H2z M4 8h.01 M6 8h.01 M1 3.5 3 6 M15 3.5 13 6 M1 12.5 3 10 M15 12.5 13 10 M8 2v4 M8 10v4',
    [...pwr(), p('canfd1', 'CAN FD1', 'right', 0.2, 'canfd'), p('canfd2', 'CAN FD2', 'right', 0.4, 'canfd'),
      p('can', 'CAN', 'right', 0.6, 'can'), p('t1', 'T1', 'right', 0.8, 't1'), p('obd', 'OBD', 'bottom', 0.5, 'can')], DRAWS),
  // System & Cloud
  cloud: part('cloud', 'system', 'Cloud / MQTT', 'M5 12a3 3 0 0 1-.4-6A4.5 4.5 0 0 1 13.3 7 2.5 2.5 0 0 1 12.5 12z',
    [p('net', 'NET', 'left', 0.5, 'eth'), p('rf', 'RF', 'bottom', 0.5, 'rf')], { fields: NET_FIELDS }),
  server: part('server', 'system', 'Server', 'M3 2h10v5H3z M3 9h10v5H3z M5 4.5h.01 M5 11.5h.01 M8 4.5h3 M8 11.5h3',
    [p('net', 'NET', 'left', 0.5, 'eth'), p('db', 'DB', 'right', 0.5, 'eth')], { fields: NET_FIELDS }),
  database: part('database', 'system', 'Database', 'M8 2c3 0 5 .9 5 2s-2 2-5 2-5-.9-5-2 2-2 5-2z M3 4v8c0 1.1 2 2 5 2s5-.9 5-2V4 M3 8c0 1.1 2 2 5 2s5-.9 5-2',
    [p('net', 'NET', 'left', 0.5, 'eth')], { fields: NET_FIELDS }),
  gateway: part('gateway', 'system', 'Edge gateway', 'M2 9h12v4H2z M4.5 11h.01 M7 11h.01 M8 9V3 M5 6l3-3 3 3',
    [p('lan', 'LAN', 'left', 0.5, 'eth'), p('wan', 'WAN', 'right', 0.5, 'eth'), p('rf', 'RF', 'top', 0.5, 'rf')]),
  mobile: part('mobile', 'system', 'Mobile app', 'M5 1.5h6a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M7 12.5h2',
    [p('ble', 'BLE', 'left', 0.5, 'rf'), p('net', 'NET', 'bottom', 0.5, 'eth')]),
  hostpc: part('hostpc', 'system', 'Host PC', 'M3 3h10v7H3z M1.5 12.5h13L13 10H3z',
    [p('usb', 'USB', 'left', 0.5, 'usb'), p('eth', 'ETH', 'bottom', 0.5, 'eth')], { fields: NET_FIELDS }),
  // ---- Network, Security & Edge, Process Flow, and Threats ----
  // Modelled on net_draw's types: 24-box glyphs, per-type accents, real
  // flowchart shapes, and the dashed red border on threats. Devices link over
  // Ethernet, flow shapes over the untyped "flow" bus, threats over "link".
  // The device and threat glyphs are Lucide icons (ISC, see
  // THIRD_PARTY_NOTICES.md; markup from lucide-static 1.41.0); the flow glyphs
  // are the standard flowchart symbols drawn here.
  // Network
  internet: nd('internet', 'network', 'Internet', '#38bdf8', '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  accesspoint: nd('accesspoint', 'network', 'Access point', '#c084fc', '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    [p('rf', 'WLAN', 'top', 0.5, 'rf'), p('e', 'ETH', 'right', 0.5, 'eth'), p('s', 'ETH', 'bottom', 0.5, 'eth'), p('w', 'ETH', 'left', 0.5, 'eth')], { fields: NET_FIELDS }),
  router: nd('router', 'network', 'Router', '#a78bfa', '<rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6.01 18H6"/><path d="M10.01 18H10"/><path d="M15 10v4"/><path d="M17.84 7.17a4 4 0 0 0-5.66 0"/><path d="M20.66 4.34a8 8 0 0 0-11.31 0"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  switch: nd('switch', 'network', 'Switch', '#60a5fa', '<rect width="20" height="12" x="2" y="6" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  asn: nd('asn', 'network', 'ASN', '#818cf8', '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">AS</text>',
    sides('eth', 'ETH'), { fields: [f('asn', 'AS number', { placeholder: 'e.g. AS64500' }), f('prefix', 'Prefix', { placeholder: 'e.g. 203.0.113.0/24' })] }),
  ipaddress: nd('ipaddress', 'network', 'IP Address', '#67e8f9', '<rect width="20" height="12" x="2" y="6" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">IP</text>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  // Security & Edge
  firewall: nd('firewall', 'security', 'Firewall', '#f87171', '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 9v6"/><path d="M16 15v6"/><path d="M16 3v6"/><path d="M3 15h18"/><path d="M3 9h18"/><path d="M8 15v6"/><path d="M8 3v6"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  waf: nd('waf', 'security', 'WAF', '#f43f5e', '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  proxy: nd('proxy', 'security', 'Proxy Server', '#e879f9', '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  cdn: nd('cdn', 'security', 'CDN', '#38bdf8', '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  loadbalancer: nd('loadbalancer', 'security', 'Load Balancer', '#2dd4bf', '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  apigateway: nd('apigateway', 'security', 'API Gateway', '#22d3ee', '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
    sides('eth', 'ETH'), { fields: NET_FIELDS }),
  // Process Flow (shapes; the label sits inside, no badge or meta lines)
  startend: nd('startend', 'flow', 'Start / End', '#34d399', '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/>',
    sides('flow', 'FLOW'), { shape: 'terminator', defaultLabel: 'Start' }),
  process: nd('process', 'flow', 'Process', '#60a5fa', '<rect x="3" y="7" width="18" height="10" rx="1"/>',
    sides('flow', 'FLOW'), { shape: 'process' }),
  decision: nd('decision', 'flow', 'Decision', '#fbbf24', '<path d="M12 4l8 8-8 8-8-8z"/>',
    sides('flow', 'FLOW'), { shape: 'decision', defaultLabel: 'Decision?' }),
  dataio: nd('dataio', 'flow', 'Data / I-O', '#22d3ee', '<path d="M8 7h13l-5 10H3z"/>',
    sides('flow', 'FLOW'), { shape: 'data' }),
  document: nd('document', 'flow', 'Document', '#94a3b8', '<path d="M4 5h16v10c-2 2.5-4 2.5-6 1s-4-1.5-6 0-3 1.5-4 .5z"/>',
    sides('flow', 'FLOW'), { shape: 'document' }),
  predefined: nd('predefined', 'flow', 'Subprocess', '#818cf8', '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7v10M17 7v10"/>',
    sides('flow', 'FLOW'), { shape: 'predefined' }),
  preparation: nd('preparation', 'flow', 'Preparation', '#a78bfa', '<path d="M6.5 6.5h11l3.5 5.5-3.5 5.5h-11L3 12z"/>',
    sides('flow', 'FLOW'), { shape: 'prep' }),
  manualinput: nd('manualinput', 'flow', 'Manual Input', '#f472b6', '<path d="M3 10l18-4v11H3z"/>',
    sides('flow', 'FLOW'), { shape: 'manual' }),
  delay: nd('delay', 'flow', 'Delay', '#fb923c', '<path d="M3 7h11a5 5 0 0 1 0 10H3z"/>',
    sides('flow', 'FLOW'), { shape: 'delay' }),
  connector: nd('connector', 'flow', 'Connector', '#64748b', '<circle cx="12" cy="12" r="7"/>',
    sides('flow', 'FLOW'), { shape: 'connector', defaultLabel: 'A' }),
  // Threats
  threatactor: nd('threatactor', 'threats', 'Threat Actor', '#ef4444', '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('type', 'Type (STIX)', { options: STIX_ACTOR_TYPES }), f('sophistication', 'Sophistication (STIX)', { options: STIX_SOPHISTICATION }), f('motivation', 'Motivation (STIX)', { options: STIX_MOTIVATION }), f('org', 'Attribution', { placeholder: 'e.g. group / country' }), SEVERITY] }),
  insider: nd('insider', 'threats', 'Insider Threat', '#f97316', '<path d="m16.5 16.5 5 5"/><path d="M2 21a8 8 0 0 1 11.531-7.18"/><path d="m21.5 16.5-5 5"/><circle cx="10" cy="8" r="5"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('type', 'Type (STIX)', { options: INSIDER_TYPES }), f('motivation', 'Motivation (STIX)', { options: STIX_MOTIVATION }), f('owner', 'Account used', { placeholder: 'e.g. svc-build' }), SEVERITY] }),
  malware: nd('malware', 'threats', 'Malware', '#fb7185', '<path d="M12 20v-9"/><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/><path d="M14.12 3.88 16 2"/><path d="M21 21a4 4 0 0 0-3.81-4"/><path d="M21 5a4 4 0 0 1-3.55 3.97"/><path d="M22 13h-4"/><path d="M3 21a4 4 0 0 1 3.81-4"/><path d="M3 5a4 4 0 0 0 3.55 3.97"/><path d="M6 13H2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('family', 'Family / variant', { placeholder: 'e.g. LockBit 3.0' }), f('type', 'Type (STIX)', { options: STIX_MALWARE_TYPES }), SEVERITY] }),
  ransomware: nd('ransomware', 'threats', 'Ransomware', '#f43f5e', '<path d="M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 17v-2a2 2 0 0 0-4 0v2"/><rect width="8" height="5" x="3" y="17" rx="1"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('family', 'Family / variant', { placeholder: 'e.g. LockBit 3.0' }), SEVERITY] }),
  botnet: nd('botnet', 'threats', 'Botnet', '#a855f7', '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('family', 'Family / variant', { placeholder: 'e.g. Mirai' }), f('size', 'Size', { placeholder: 'e.g. 40k bots' }), SEVERITY] }),
  phishing: nd('phishing', 'threats', 'Phishing', '#eab308', '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('campaign', 'Campaign', { placeholder: 'e.g. Q3 invoice lure' }), f('email', 'Sender / lure address', { placeholder: 'e.g. billing@example.net' }), SEVERITY] }),
  c2: nd('c2', 'threats', 'C2 Server', '#f87171', '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
    sides('link', 'LINK'), { threat: true, fields: [f('ip', 'IP address', { placeholder: 'e.g. 198.51.100.7' }), f('dns', 'DNS name', { placeholder: 'e.g. cdn-update.example.net' }), SEVERITY] }),
  // More threats and weaknesses, drawn in Schematica's own 16-box icon style.
  vulnerability: part('vulnerability', 'threats', 'Vulnerability', 'M8 1.5 13.5 3.5v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7v-4z M8 5v3.5 M8 10.5h.01',
    sides('link', 'LINK'), { threat: true, accent: '#f97316', fields: [f('cve', 'CVE / reference', { placeholder: 'e.g. CVE-2025-1234' }), f('cvss', 'CVSS score', { placeholder: 'e.g. 8.1' }), f('affected', 'Affected component', { placeholder: 'e.g. bootloader' }), SEVERITY] }),
  misconfig: part('misconfig', 'threats', 'Misconfiguration', 'M3 4h10 M3 8h10 M3 12h10 M6 2.5v3 M10 6.5v3 M5 10.5v3',
    sides('link', 'LINK'), { threat: true, accent: '#fbbf24', fields: [f('control', 'Control / CWE', { placeholder: 'e.g. CWE-284, open debug port' }), f('affected', 'Affected component'), SEVERITY] }),
  exploit: part('exploit', 'threats', 'Exploit', 'M9 1.5 4 9h4l-1 5.5L12 7H8z',
    sides('link', 'LINK'), { threat: true, accent: '#f43f5e', fields: [f('cve', 'CVE / reference', { placeholder: 'e.g. CVE-2025-1234' }), f('technique', 'ATT&CK technique', { placeholder: 'e.g. T1190' }), SEVERITY] }),
  supplychain: part('supplychain', 'threats', 'Supply-chain compromise', 'M2 9h5v5H2z M9 2h5v5H9z M7 11.5h2 M11.5 7v2 M4.5 9V6.5h4.5',
    sides('link', 'LINK'), { threat: true, accent: '#e879f9', fields: [f('vector', 'Vector', { options: ['dependency', 'build system', 'firmware image', 'vendor access', 'hardware implant'] }), f('affected', 'Affected component'), SEVERITY] }),
  ddos: part('ddos', 'threats', 'DDoS flood', 'M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M8 1.5v3 M8 11.5v3 M1.5 8h3 M11.5 8h3 M3.5 3.5l2 2 M12.5 3.5l-2 2 M3.5 12.5l2-2 M12.5 12.5l-2-2',
    sides('link', 'LINK'), { threat: true, accent: '#f97316', fields: [f('volume', 'Volume', { placeholder: 'e.g. 40 Gbps' }), f('vector', 'Vector', { options: ['volumetric', 'protocol', 'application', 'amplification'] }), SEVERITY] }),
  mitm: part('mitm', 'threats', 'On-path attacker', 'M1.5 8h4 M10.5 8h4 M8 8m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M8 5.5V3 M6.5 3h3',
    sides('link', 'LINK'), { threat: true, accent: '#ef4444', fields: [f('position', 'Position', { options: ['LAN', 'Wi-Fi', 'cellular', 'CAN bus', 'GNSS', 'OTA path'] }), SEVERITY] }),
  spoofing: part('spoofing', 'threats', 'Sensor spoofing', 'M2 10a6 6 0 0 1 12 0 M4.5 10a3.5 3.5 0 0 1 7 0 M8 10h.01 M3 13 13 3',
    sides('link', 'LINK'), { threat: true, accent: '#fb923c', fields: [f('target', 'Spoofed input', { options: ['GNSS', 'camera', 'radar', 'lidar', 'CAN', 'RF key', 'ultrasonic'] }), SEVERITY] }),
  credential: part('credential', 'threats', 'Stolen credentials', 'M9.5 6.5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M7.5 8.5 2 14 M4 12l1.5 1.5 M5.5 10.5 7 12',
    sides('link', 'LINK'), { threat: true, accent: '#eab308', fields: [f('type', 'Credential', { options: ['password', 'API key', 'signing key', 'certificate', 'session token', 'SIM / eSIM'] }), SEVERITY] }),
  dataleak: part('dataleak', 'threats', 'Data exfiltration', 'M3 9v4h10V9 M8 10V2.5 M5.5 5 8 2.5 10.5 5',
    sides('link', 'LINK'), { threat: true, accent: '#e879f9', fields: [f('channel', 'Channel', { options: ['HTTPS', 'DNS', 'cellular', 'USB', 'removable media', 'Bluetooth'] }), f('data', 'Data at risk', { placeholder: 'e.g. telemetry, keys' }), SEVERITY] }),
  physical: part('physical', 'threats', 'Physical tampering', 'M10.5 2.5 13.5 5.5 6 13 3 14 4 11z M9 4l3 3',
    sides('link', 'LINK'), { threat: true, accent: '#f87171', fields: [f('access', 'Access point', { options: ['debug port', 'OBD-II', 'ECU housing', 'harness', 'key fob', 'charging port'] }), SEVERITY] }),
  // Storage / Misc
  eeprom: part('eeprom', 'misc', 'EEPROM / Flash', 'M4 3h8v10H4z M4 6h8 M4 9h8 M2 5h2 M2 8h2 M2 11h2 M12 5h2 M12 8h2 M12 11h2',
    [...pwr(), p('spi', 'SPI', 'right', 0.35, 'spi'), p('i2c', 'I2C', 'right', 0.7, 'i2c')], DRAWS),
  sdcard: part('sdcard', 'misc', 'SD card', 'M4 2h6l3 3v9H4z M6 4v2 M8 4v2 M10 4v2',
    [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi')], DRAWS),
  rtc: part('rtc', 'misc', 'RTC', 'M8 8m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M8 4.5V8l2.5 1.5',
    [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')], DRAWS),
  crystal: part('crystal', 'misc', 'Crystal', 'M5 4h6v8H5z M3 6v4 M1 8h2 M13 6v4 M13 8h2',
    [p('osc', 'OSC', 'right', 0.5, 'gpio')]),
  debug: part('debug', 'misc', 'Debug header', 'M3 4h10v8H3z M5.5 6.5h.01 M8 6.5h.01 M10.5 6.5h.01 M5.5 9.5h.01 M8 9.5h.01 M10.5 9.5h.01',
    [p('swd', 'SWD', 'right', 0.35, 'gpio'), p('uart', 'UART', 'right', 0.7, 'uart')]),
  ic: part('ic', 'misc', 'Generic IC', 'M5 3h6v10H5z M3 5h2 M3 8h2 M3 11h2 M11 5h2 M11 8h2 M11 11h2 M7 3a1 1 0 0 0 2 0',
    [...pwr(), p('io1', 'IO', 'right', 0.35, 'gpio'), p('io2', 'IO', 'right', 0.7, 'gpio')], DRAWS),
  header: part('header', 'misc', 'Pin header', 'M2 6h12v4H2z M4.5 8h.01 M7 8h.01 M9.5 8h.01 M12 8h.01',
    [p('p1', 'P1', 'left', 0.5, 'gpio'), p('p2', 'P2', 'right', 0.5, 'gpio')]),
  testpoint: part('testpoint', 'misc', 'Test point', 'M8 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M8 8m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M8 1v2.5 M8 12.5V15',
    [p('tp', 'TP', 'right', 0.5, 'gpio')]),
  fuse: part('fuse', 'misc', 'Fuse', 'M1 8h3 M12 8h3 M4 5.5h8v5H4z M5 8h6',
    [p('in', 'IN', 'left', 0.5, 'power'), p('out', 'OUT', 'right', 0.5, 'power')], PROTECTS(['in', 'out'])),
  generic: part('generic', 'misc', 'Custom box', 'M2 5V2h3 M11 2h3v3 M14 11v3h-3 M5 14H2v-3', [
    p('top', 'P1', 'top', 0.5, 'gpio'), p('right', 'P2', 'right', 0.5, 'gpio'),
    p('bottom', 'P3', 'bottom', 0.5, 'gpio'), p('left', 'P4', 'left', 0.5, 'gpio'),
  ]),
};

export function getPart(kind) {
  return PARTS[kind] ?? PARTS.generic;
}

// Old port ids that saved files may still reference, per kind. Renaming a
// port above must add its old id here or every wire on it in existing files
// is dropped on load. Shape: { [kind]: { [oldPortId]: newPortId } }.
export const PORT_ALIASES = {};
