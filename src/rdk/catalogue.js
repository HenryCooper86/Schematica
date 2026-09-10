// Architectural interfaces, not a pin-level netlist. null means unverified.
const root = 'https://d-robotics.github.io/';
const source = (title, path, archived = false) => ({
  title,
  url: root + path,
  ...(archived ? { archived: true } : {}),
});
const x3Source = source(
  'X3 hardware guide',
  'rdk_doc/en/Quick_start/hardware_introduction/rdk_x3/',
  true,
);
const x5Source = source(
  'X5 hardware guide',
  'rdk_doc/en/Quick_start/hardware_introduction/rdk_x5/',
  true,
);
const sSource = source(
  'S100 series hardware guide',
  'rdk_doc/en/rdk_s/Quick_start/hardware_introduction/rdk_s100/',
  true,
);
const accessory = source(
  'Accessory list (specific vendor modules)',
  'rdk_doc/en/Quick_start/accessory/',
  true,
);
const tros = source('TogetheROS.Bot capabilities', 'tros_doc/en/tros/');
const p = (id, name, bus, side, offset) => ({ id, name, bus, side, offset });
const boardPorts = [
  p('vcc', 'VCC', 'power', 'left', 0.3),
  p('gnd', 'GND', 'gnd', 'left', 0.7),
  p('eth', 'ETH', 'eth', 'right', 0.2),
  p('usb', 'USB', 'usb', 'right', 0.4),
  p('uart', 'UART', 'uart', 'right', 0.6),
  p('canfd', 'CAN FD', 'canfd', 'right', 0.8),
  p('csi1', 'CSI1', 'mipi', 'bottom', 0.2),
  p('csi2', 'CSI2', 'mipi', 'bottom', 0.4),
  p('i2c', 'I2C', 'i2c', 'bottom', 0.6),
  p('gpio', 'GPIO', 'gpio', 'bottom', 0.8),
  p('spi', 'SPI', 'spi', 'top', 0.35),
  p('uart2', 'UART2', 'uart', 'top', 0.7),
];
const stereoPorts = [
  p('csi', 'CSI left', 'mipi', 'right', 0.35),
  p('csi-right', 'CSI right', 'mipi', 'right', 0.7),
];
const flowPorts = [
  p('in', 'Input', 'flow', 'left', 0.5),
  p('out', 'Output', 'flow', 'right', 0.5),
];
const record = (id, name, kind, sublabel, notes, sources, extra = {}) => ({
  id,
  name,
  kind,
  sublabel,
  aliases: [],
  productClass: 'peripheral',
  notes,
  sources,
  checkedOn: '2026-09-06',
  ports: null,
  power: null,
  compatibility: { boardIds: null, unsupportedBoardIds: [] },
  requirements: [],
  software: null,
  ...extra,
});
const board = (id, sublabel, notes, sources, ports, power, requirements = []) =>
  record(id, `D-Robotics ${sublabel}`, 'aisbc', sublabel, notes, sources, {
    productClass: 'development board',
    ports,
    power,
    requirements,
  });
const stereo = (id, imu) =>
  record(
    id,
    `D-Robotics RDK Stereo Camera ${id.toUpperCase()}`,
    'depthcam',
    id.toUpperCase(),
    `Dual SC132GS global-shutter MIPI stereo camera${imu ? ' with ICM-42688-P IMU' : ''}; requires two distinct CSI connections.`,
    [
      source(
        'Stereo camera product overview',
        `accessories_stereo_camera_doc/en/stereo_camera_${id}/product_overview/`,
      ),
      source(
        'Stereo installation guide',
        `accessories_stereo_camera_doc/en/stereo_camera_${id}/installation/`,
      ),
    ],
    {
      ports: stereoPorts,
      compatibility: {
        boardIds: ['rdk-x5', 'rdk-s100', 'rdk-s100p'],
        unsupportedBoardIds: ['rdk-x3', 'rdk-x3-module'],
      },
      requirements: [
        'Two separate MIPI ribbon cables to the same board.',
        'S100/S100P require the Camera expansion board.',
      ],
    },
  );
export const RDK_PRODUCTS = [
  board(
    'rdk-x5',
    'RDK X5',
    '10 TOPS BPU; two MIPI CSI connectors, USB 3.0, Ethernet, CAN FD and 40-pin GPIO; 5V/5A supply.',
    [
      x5Source,
      {
        title: 'RDK X5 product specifications',
        url: 'https://developer.d-robotics.cc/en/rdkx5',
      },
    ],
    boardPorts,
    { rail: '5V', inputMinV: 5, inputMaxV: 5, recommendedCurrentA: 5 },
  ),
  board(
    'rdk-x3',
    'RDK X3',
    'One MIPI CSI connector on the development board; USB, Ethernet and 40-pin GPIO; 5V/3A supply. Module carrier interfaces are different.',
    [x3Source],
    boardPorts.filter((p) => !['csi2', 'canfd'].includes(p.id)),
    { rail: '5V', inputMinV: 5, inputMaxV: 5, recommendedCurrentA: 3 },
  ),
  record(
    'rdk-x3-module',
    'D-Robotics RDK X3 Module',
    'aisbc',
    'RDK X3 Module',
    'Module for a carrier board; external connectors and system power depend on the carrier.',
    [x3Source],
    {
      productClass: 'module',
      requirements: [
        'Identify the carrier board before choosing connectors or a power supply.',
      ],
    },
  ),
  ...[
    ['rdk-s100', 'RDK S100', '80 TOPS; 12GB LPDDR5'],
    ['rdk-s100p', 'RDK S100P', '128 TOPS; 24GB LPDDR5'],
  ].map(([id, name, spec]) =>
    board(
      id,
      name,
      `${spec}; 12–20V DC input. Camera signals are provided through J25; camera expansion board required for ribbon cameras.`,
      [
        sSource,
        source(
          'S100 Camera expansion board',
          'rdk_doc/en/rdk_s/Quick_start/hardware_introduction/rdk_s100_camera_expansion_board/',
          true,
        ),
      ],
      null,
      {
        rail: '12V',
        inputMinV: 12,
        inputMaxV: 20,
        recommendedPowerW: 70,
        maxLoadPowerW: 150,
      },
      [
        'Camera expansion board provides two MIPI ribbon connectors; J25 carries three CSI signal sets.',
        'Connector availability must be checked against the installed expansion boards.',
      ],
    ),
  ),
  record(
    'rs800w',
    'D-Robotics RDK Camera RS800W',
    'mipicam',
    'RS800W',
    'Legacy RS800W camera identity; exact module revision and board compatibility require verification.',
    [accessory],
    {
      requirements: [
        'Verify the exact module and adapter against the accessory documentation.',
      ],
    },
  ),
  record(
    'rs400w',
    'D-Robotics RDK X3 Camera RS400W',
    'mipicam',
    'RS400W',
    'Legacy RS400W camera identity; exact module revision and board compatibility require verification.',
    [accessory],
    {
      requirements: [
        'Verify the exact module and adapter against the accessory documentation.',
      ],
    },
  ),
  ...[
    ['imx219', 'Sony IMX219 module', 'IMX219', '8MP'],
    ['imx477', 'Sony IMX477 (HQ camera)', 'IMX477', '12.3MP'],
    ['ov5647', 'OmniVision OV5647', 'OV5647', '5MP'],
  ].map(([id, name, sub, res]) =>
    record(
      id,
      name,
      'mipicam',
      sub,
      `${res} sensor-module family. A sensor name does not establish vendor module, connector or driver compatibility.`,
      [accessory],
      {
        requirements: [
          'Select the documented vendor module and matching cable/adapter for the board.',
        ],
      },
    ),
  ),
  record(
    'rdk-stereo-legacy',
    'D-Robotics RDK Stereo Camera Module',
    'depthcam',
    'RDK Stereo Camera',
    'Legacy stereo camera identity; confirm the exact module. This name does not identify GS130W or GS130WI.',
    [accessory],
  ),
  stereo('gs130w', false),
  stereo('gs130wi', true),
  ...[
    ['hobot_sensor', 'Sensor acquisition'],
    ['hobot_dnn', 'BPU model inference'],
    ['hobot_codec', 'Image/video encoding and decoding'],
    ['hobot_render', 'Web/HDMI visualization'],
  ].map(([id, description]) =>
    record(
      id,
      id,
      'rdksoftware',
      id,
      description,
      [
        tros,
        source(
          'TogetheROS.Bot software components',
          'rdk_x_doc/en/Robot_development/',
        ),
      ],
      {
        productClass: 'software component',
        ports: flowPorts,
        compatibility: {
          boardIds: ['rdk-x3', 'rdk-x5', 'rdk-s100'],
          unsupportedBoardIds: [],
        },
        software: {
          package: id,
          boardIds: ['rdk-x3', 'rdk-x5', 'rdk-s100'],
          runtimes: null,
        },
        requirements: [
          'Check the package and example documentation for the selected board and ROS 2 runtime.',
        ],
      },
    ),
  ),
];
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export function profileFor(node) {
  const key = normalize(node?.sublabel);
  if (!key) return null;
  return (
    RDK_PRODUCTS.find(
      (p) =>
        p.kind === node?.kind &&
        [p.sublabel, p.name, ...p.aliases].some((v) => normalize(v) === key),
    ) || null
  );
}
// Words split on underscores as well, so 'hobot' finds hobot_sensor; the
// joined id is kept as a term so 'hobot_sensor' still matches exactly.
const tokens = (text) => {
  const raw = normalize(text).match(/[\p{L}\p{N}_]+/gu) || [];
  return raw.flatMap((w) => [w, ...w.split('_').filter(Boolean)]);
};
export function searchRdk(query) {
  const words = tokens(query);
  if (!words.length) return [];
  const exact = new Set([normalize(query), ...words]);
  const rank = (p) =>
    [p.id, p.sublabel].some((v) => exact.has(normalize(v))) ? 0 : 1;
  return RDK_PRODUCTS.filter((p) => {
    const terms = new Set(
      tokens([p.name, p.sublabel, ...p.aliases, p.notes].join(' ')),
    );
    return words.every((w) => terms.has(w));
  })
    // Products named by the query outrank ones that only mention it in notes.
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 12);
}
export function rdkPresets(kind) {
  return RDK_PRODUCTS.filter((p) => p.kind === kind).map((p) => ({
    name: p.name,
    sublabel: p.sublabel,
    rail: p.power?.rail || '',
    notes: p.notes,
  }));
}
export function profileSummary(profile) {
  if (!profile) return '';
  return [
    profile.name,
    profile.notes,
    `Checked: ${profile.checkedOn}`,
    `Ports: ${profile.ports ? profile.ports.map((p) => `${p.id} (${p.bus})`).join(', ') : 'unverified'}`,
    ...profile.requirements,
    ...profile.sources.map(
      (s) => `${s.title}${s.archived ? ' (archived)' : ''}: ${s.url}`,
    ),
  ].join('\n');
}
