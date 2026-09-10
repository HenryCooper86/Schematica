import { attachExampleStories, localizeExampleStories } from './example-stories.js';
import { RDK_EXAMPLES } from './rdk/examples.js';
import EXAMPLE_OVERLAYS_ZH from './i18n/examples.zh.js';
export { EXAMPLE_OVERLAYS_ZH };

// Built-in example boards. Every document must round-trip through
// serialize/deserialize with zero warnings (enforced by tests/examples.test.js),
// so every node kind, port id, bus, and journey step here is guaranteed valid.

// Menu headings, in display order; every example names one as its `group`.
export const EXAMPLE_GROUPS = ['Embedded', 'Vehicle', 'Security'];

export const EXAMPLES = [
  {
    id: 'weather-station',
    name: 'Weather Station',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Weather Station',
      nodes: [
        { id: 'n1', kind: 'solar', x: 77, y: 135.8, label: 'Solar panel', sublabel: '6V 2W', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'charger', x: 82, y: 271.8, label: 'Charger', sublabel: 'TP4056', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'battery', x: 77, y: 407.8, label: 'Battery', sublabel: 'LiPo 3.7V', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { capacity: '2000mAh' } },
        { id: 'n4', kind: 'regulator', x: 306, y: 271.8, label: 'Regulator', sublabel: '3.3V LDO', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { imax: '600mA' } },
        { id: 'n5', kind: 'mcu', x: 532, y: 256.5, label: 'MCU', sublabel: 'ESP32-S3', color: null, addr: '', rail: '3.3V', notes: 'Deep sleep between readings; wake every 10 min.', status: 'production', flags: [], fields: { ityp: '100mA', ipeak: '355mA' } },
        { id: 'n6', kind: 'temp', x: 797, y: 131.3, label: 'Temp sensor', sublabel: 'BME280', color: null, addr: '0x76', rail: '3.3V', notes: '', status: 'production', flags: [], fields: { ityp: '3.6uA', ipeak: '0.72mA' } },
        { id: 'n7', kind: 'adcin', x: 797, y: 279.8, label: 'Soil probe', sublabel: 'capacitive', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'wifi', x: 802, y: 418.3, label: 'WiFi / BLE', sublabel: 'uplink', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'bat' }, to: { node: 'n3', port: 'out' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'power', from: { node: 'n4', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gnd', from: { node: 'n4', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'i2c', from: { node: 'n5', port: 'i2c' }, to: { node: 'n6', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'adc', from: { node: 'n5', port: 'adc' }, to: { node: 'n7', port: 'out' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'spi', from: { node: 'n5', port: 'spi' }, to: { node: 'n8', port: 'spi' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 40, y: 112, w: 408, h: 408, label: 'Power', color: '#f87171' },
        { id: 'z2', x: 760, y: 104, w: 190, h: 280, label: 'Sensor pod', color: '#22d3ee' },
      ],
      notes: [
        { id: 't1', x: 504, y: 120, text: 'All logic runs on the 3.3V rail' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power path', view: { cx: 244, cy: 316, zoom: 1 },
          caption: 'Sunlight charges the LiPo through the TP4056; the LDO feeds a clean 3.3V rail.',
        },
        {
          id: 'j2', label: 'The brain', view: { cx: 584, cy: 306, zoom: 1.2 },
          caption: 'An ESP32-S3 polls the sensors and pushes readings upstream over WiFi.',
        },
        {
          id: 'j3', label: 'Sensors', view: { cx: 855, cy: 300, zoom: 1.15 },
          caption: 'The BME280 shares the I2C bus; the soil probe feeds the ADC directly.',
        },
      ],
    },
  },
  {
    id: 'drone-fc',
    name: 'Drone Flight Controller',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Drone Flight Controller',
      nodes: [
        { id: 'n1', kind: 'battery', x: 77, y: 295.8, label: 'Battery', sublabel: 'LiPo 4S', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 306, y: 295.8, label: 'BEC', sublabel: '5V 3A', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { imax: '3A' } },
        { id: 'n3', kind: 'mcu', x: 514.2, y: 264.5, label: 'Flight controller', sublabel: 'STM32F405', color: null, addr: '', rail: '3.3V', notes: 'Loop timing is safety critical - do not block the PID task.', status: 'tested', flags: ['safety'], fields: { ityp: '87mA' } },
        { id: 'n4', kind: 'imu', x: 797, y: 135.8, label: 'IMU', sublabel: 'MPU-6050', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { ityp: '3.8mA' } },
        { id: 'n5', kind: 'gps', x: 797, y: 255.8, label: 'GPS', sublabel: 'NEO-M8N', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { ityp: '23mA', ipeak: '67mA' } },
        { id: 'n6', kind: 'motor', x: 799.4, y: 404.8, label: 'Motor + driver', sublabel: 'ESC 30A', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'servo', x: 796.2, y: 519.8, label: 'Gimbal servo', sublabel: 'SG90', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n4', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'uart', from: { node: 'n3', port: 'uart' }, to: { node: 'n5', port: 'uart' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'pwm', from: { node: 'n3', port: 'pwm' }, to: { node: 'n6', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'pwm', from: { node: 'n3', port: 'gpio1' }, to: { node: 'n7', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        // The IMU and the GPS run from the same BEC as the flight controller;
        // both are breakout modules with their own on-board regulator, so 5 V
        // is what they take. Drawing these makes the board's own declared
        // currents count towards the BEC's rail instead of hanging in the air.
        { id: 'w8', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 40, y: 280, w: 408, h: 120, label: 'Power', color: '#f87171' },
        { id: 'z2', x: 760, y: 112, w: 190, h: 248, label: 'Flight sensors', color: '#22d3ee' },
        { id: 'z3', x: 760, y: 384, w: 190, h: 240, label: 'Actuators', color: '#fbbf24' },
      ],
      notes: [
        { id: 't1', x: 488, y: 128, text: 'PID loop runs at 8 kHz on the F405' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power', view: { cx: 280, cy: 340, zoom: 1 },
          caption: 'The 4S pack feeds a 5V BEC that powers the flight controller.',
        },
        {
          id: 'j2', label: 'Sense', view: { cx: 850, cy: 240, zoom: 1.1 },
          caption: 'The IMU streams attitude over I2C while the GPS reports position over UART.',
        },
        {
          id: 'j3', label: 'Act', view: { cx: 860, cy: 480, zoom: 1.1 },
          caption: 'PWM outputs drive the ESC and the gimbal servo.',
        },
      ],
    },
  },
  {
    id: 'can-network',
    name: 'CAN Bus Network',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'CAN Bus Network',
      nodes: [
        { id: 'n1', kind: 'mcu', x: 116, y: 122.3, label: 'Engine ECU', sublabel: 'STM32F1', color: null, addr: 'CAN ID 0x100', rail: '5V', notes: '', status: 'prototype', flags: ['thermal'] },
        { id: 'n2', kind: 'cantrx', x: 399, y: 135.8, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'mcu', x: 116, y: 358.8, label: 'Dash ECU', sublabel: 'STM32F1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'cantrx', x: 399, y: 359.8, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'mcu', x: 116, y: 582.8, label: 'Sensor ECU', sublabel: 'STM32F1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'cantrx', x: 399, y: 583.8, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'can', from: { node: 'n1', port: 'can' }, to: { node: 'n2', port: 'mcu' }, label: 'TX/RX', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'can', from: { node: 'n3', port: 'can' }, to: { node: 'n4', port: 'mcu' }, label: 'TX/RX', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'can', from: { node: 'n5', port: 'can' }, to: { node: 'n6', port: 'mcu' }, label: 'TX/RX', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'can', from: { node: 'n2', port: 'bus' }, to: { node: 'n4', port: 'bus' }, label: 'CAN H/L', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'can', from: { node: 'n4', port: 'bus' }, to: { node: 'n6', port: 'bus' }, label: 'CAN H/L', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 64, y: 96, w: 496, h: 160, label: 'Engine module', color: '#f87171' },
        { id: 'z2', x: 64, y: 320, w: 496, h: 160, label: 'Dash module', color: '#60a5fa' },
        { id: 'z3', x: 64, y: 544, w: 496, h: 160, label: 'Sensor module', color: '#34d399' },
      ],
      notes: [
        { id: 't1', x: 640, y: 120, text: 'One twisted pair links every module at 500 kbit/s' },
      ],
      journey: [
        {
          id: 'j1', label: 'A module', view: { cx: 315, cy: 180, zoom: 1.1 },
          caption: 'Each ECU talks CAN through its own MCP2551 transceiver.',
        },
        {
          id: 'j2', label: 'The bus', view: { cx: 462, cy: 400, zoom: 0.95 },
          caption: 'Transceivers share one differential pair - the yellow CAN H/L backbone.',
        },
        {
          id: 'j3', label: 'The network', view: { cx: 350, cy: 400, zoom: 0.75 },
          caption: 'Three modules, one bus: add a node by tapping the pair anywhere.',
        },
      ],
    },
  },
  {
    id: 'smart-greenhouse',
    name: 'Smart Greenhouse (edge to cloud)',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Smart Greenhouse',
      nodes: [
        { id: 'n1', kind: 'temp', x: 53.4, y: 99.3, label: 'Climate sensor', sublabel: 'BME280', color: null, addr: '0x76', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n2', kind: 'adcin', x: 61, y: 239.8, label: 'Soil probe', sublabel: 'capacitive', color: null, addr: '', rail: '', notes: 'Reads noisy near the pump - needs filtering.', status: 'prototype', flags: ['bug'] },
        { id: 'n3', kind: 'battery', x: 61, y: 383.8, label: 'Battery', sublabel: 'LiFePO4', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'regulator', x: 266, y: 383.8, label: 'Regulator', sublabel: '3.3V buck', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'mcu', x: 324, y: 160.5, label: 'Node MCU', sublabel: 'ESP32-C6', color: null, addr: '', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'lora', x: 554, y: 170.3, label: 'LoRa', sublabel: 'SX1262', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'gateway', x: 582.2, y: 388.8, label: 'Edge gateway', sublabel: 'LoRaWAN', color: null, addr: '', rail: '', notes: '', status: 'tested', flags: [] },
        { id: 'n8', kind: 'cloud', x: 822.2, y: 236.8, label: 'Cloud / MQTT', sublabel: 'broker', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'server', x: 1066, y: 140.8, label: 'Server', sublabel: 'ingest API', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n10', kind: 'database', x: 1069, y: 292.8, label: 'Database', sublabel: 'timeseries', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n11', kind: 'mobile', x: 824, y: 423.8, label: 'Mobile app', sublabel: 'grower UI', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'i2c', from: { node: 'n5', port: 'i2c' }, to: { node: 'n1', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'adc', from: { node: 'n5', port: 'adc' }, to: { node: 'n2', port: 'out' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'power', from: { node: 'n3', port: 'out' }, to: { node: 'n4', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'power', from: { node: 'n4', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gnd', from: { node: 'n4', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'spi', from: { node: 'n5', port: 'spi' }, to: { node: 'n6', port: 'spi' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'rf', from: { node: 'n6', port: 'ant' }, to: { node: 'n7', port: 'rf' }, label: '868 MHz', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'eth', from: { node: 'n7', port: 'wan' }, to: { node: 'n8', port: 'net' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'eth', from: { node: 'n9', port: 'net' }, to: { node: 'n8', port: 'net' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'eth', from: { node: 'n9', port: 'db' }, to: { node: 'n10', port: 'net' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 'rf', from: { node: 'n11', port: 'ble' }, to: { node: 'n8', port: 'rf' }, label: 'push', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 96, w: 704, h: 400, label: 'Greenhouse node', color: '#34d399' },
        { id: 'z2', x: 776, y: 112, w: 440, h: 288, label: 'Backend', color: '#e879f9' },
      ],
      notes: [
        { id: 't1', x: 792, y: 40, text: 'MQTT topics: greenhouse/#' },
      ],
      journey: [
        {
          id: 'j1', label: 'In the greenhouse', view: { cx: 300, cy: 300, zoom: 1.05 },
          caption: 'Sensors feed an ESP32-C6; everything runs from a LiFePO4 pack.',
        },
        {
          id: 'j2', label: 'Over the air', view: { cx: 700, cy: 320, zoom: 1.05 },
          caption: 'Readings hop over 868 MHz LoRa to the edge gateway, then up to the MQTT broker.',
        },
        {
          id: 'j3', label: 'To the grower', view: { cx: 990, cy: 300, zoom: 0.95 },
          caption: 'The ingest API stores timeseries; the mobile app subscribes for live alerts.',
        },
      ],
    },
  },
  {
    id: 'robot-arm',
    name: 'Robot Arm Controller',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Robot Arm Controller',
      nodes: [
        { id: 'n1', kind: 'battery', x: 61, y: 131.8, label: 'Battery', sublabel: '2S LiPo', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 314, y: 131.8, label: 'Regulator', sublabel: '5V 5A', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'hostpc', x: 66, y: 314.3, label: 'Host PC', sublabel: 'teach pendant', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'mcu', x: 324, y: 300.5, label: 'Motion MCU', sublabel: 'STM32F7', color: null, addr: '', rail: '3.3V', notes: 'Trajectory interpolation at 1 kHz.', status: 'tested', flags: ['safety'] },
        { id: 'n5', kind: 'servo', x: 613, y: 131.8, label: 'Base servo', sublabel: 'MG996R', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'servo', x: 613, y: 251.8, label: 'Elbow servo', sublabel: 'MG996R', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'motor', x: 618.8, y: 376.8, label: 'Gripper motor', sublabel: 'N20 + driver', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n8', kind: 'imu', x: 613, y: 499.3, label: 'Wrist IMU', sublabel: 'BNO055', color: null, addr: '0x28', rail: '3.3V', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'usb', from: { node: 'n3', port: 'usb' }, to: { node: 'n4', port: 'usb' }, label: 'CDC', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'pwm', from: { node: 'n4', port: 'pwm' }, to: { node: 'n5', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'pwm', from: { node: 'n4', port: 'gpio1' }, to: { node: 'n6', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'pwm', from: { node: 'n4', port: 'gpio2' }, to: { node: 'n7', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'i2c', from: { node: 'n4', port: 'i2c' }, to: { node: 'n8', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 272, y: 112, w: 220, h: 320, label: 'Controller', color: '#818cf8' },
        { id: 'z2', x: 576, y: 112, w: 220, h: 500, label: 'Arm', color: '#fbbf24' },
      ],
      notes: [
        { id: 't1', x: 64, y: 480, text: 'E-stop cuts the 5V rail directly' },
      ],
      journey: [
        {
          id: 'j1', label: 'Command in', view: { cx: 270, cy: 340, zoom: 1.05 },
          caption: 'The host PC streams waypoints over USB CDC to the motion MCU.',
        },
        {
          id: 'j2', label: 'Motion out', view: { cx: 500, cy: 300, zoom: 1 },
          caption: 'Three PWM channels drive the joints; trajectories interpolate at 1 kHz.',
        },
        {
          id: 'j3', label: 'Feedback', view: { cx: 500, cy: 440, zoom: 1.05 },
          caption: 'A wrist IMU closes the loop over I2C at address 0x28.',
        },
      ],
    },
  },
  {
    id: 'rover',
    name: 'Autonomous Rover',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Autonomous Rover',
      nodes: [
        { id: 'n1', kind: 'battery', x: 61, y: 111.8, label: 'Battery', sublabel: '2S Li-ion', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 66, y: 255.8, label: 'Regulator', sublabel: '5V buck', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'mcu', x: 316, y: 176.5, label: 'Rover MCU', sublabel: 'RP2040', color: null, addr: '', rail: '3.3V', notes: 'Odometry fused with ToF ranging at 50 Hz.', status: 'production', flags: [] },
        { id: 'n4', kind: 'stepper', x: 578.8, y: 436.8, label: 'Drive stepper', sublabel: 'NEMA 17', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n5', kind: 'tof', x: 573, y: 131.3, label: 'ToF ranger', sublabel: 'VL53L0X', color: null, addr: '0x29', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'lidar', x: 578, y: 268, label: 'LiDAR', sublabel: 'RPLIDAR A1', color: null, addr: '', rail: '5V', notes: '', status: 'tested', flags: [] },
        { id: 'n7', kind: 'limitswitch', x: 296, y: 438.8, label: 'Bumper', sublabel: 'front', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'vcc' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'gpio', from: { node: 'n3', port: 'gpio1' }, to: { node: 'n4', port: 'step' }, label: 'STEP', arrow: 'fwd', style: null, flow: null },
        { id: 'w7', bus: 'gpio', from: { node: 'n3', port: 'gpio2' }, to: { node: 'n4', port: 'dir' }, label: 'DIR', arrow: 'fwd', style: null, flow: null },
        { id: 'w8', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n5', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'uart', from: { node: 'n3', port: 'uart' }, to: { node: 'n6', port: 'uart' }, label: '115200', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'gpio', from: { node: 'n7', port: 'out' }, to: { node: 'n3', port: 'pwm' }, label: 'IRQ', arrow: 'fwd', style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 96, w: 190, h: 264, label: 'Power', color: '#f87171' },
        { id: 'z2', x: 536, y: 416, w: 200, h: 128, label: 'Drive', color: '#f472b6' },
        { id: 'z3', x: 536, y: 128, w: 200, h: 250, label: 'Perception', color: '#22d3ee' },
      ],
      notes: [
        { id: 't1', x: 288, y: 56, text: 'Bumper interrupt stops the stepper in under 2 ms' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power', view: { cx: 180, cy: 240, zoom: 1.05 },
          caption: 'A 2S pack and a 5V buck feed the MCU and the drive stepper.',
        },
        {
          id: 'j2', label: 'Drive', view: { cx: 480, cy: 380, zoom: 0.95 },
          caption: 'STEP and DIR pulses drive the NEMA 17; the bumper interrupt halts motion instantly.',
        },
        {
          id: 'j3', label: 'Perception', view: { cx: 600, cy: 250, zoom: 1.05 },
          caption: 'A VL53L0X at 0x29 handles close ranging; the RPLIDAR streams scans over UART.',
        },
      ],
    },
  },
  {
    id: 'vehicle-can',
    name: 'Vehicle CAN Backbone',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'Vehicle CAN Backbone',
      nodes: [
        { id: 'n1', kind: 'vbat', x: 55, y: 111.8, label: 'Vehicle battery', sublabel: '12V lead-acid', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'fusebox', x: 71, y: 260.8, label: 'Fuse box', sublabel: 'engine bay', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'wheelspeed', x: 66, y: 423.8, label: 'Wheel speed', sublabel: 'front-left', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'mcu', x: 328, y: 106.3, label: 'Body ECU', sublabel: 'STM32F1', color: null, addr: 'CAN ID 0x2A0', rail: '5V', notes: '', status: 'production', flags: [] },
        { id: 'n5', kind: 'hbridge', x: 318, y: 282.3, label: 'H-bridge', sublabel: 'BTS7960', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'mcu', x: 328, y: 426.3, label: 'Gateway ECU', sublabel: 'STM32F4', color: null, addr: 'CAN ID 0x7DF', rail: '5V', notes: '', status: 'tested', flags: [] },
        { id: 'n7', kind: 'cantrx', x: 567, y: 127.8, label: 'CAN transceiver', sublabel: 'TJA1050', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'cantrx', x: 567, y: 439.8, label: 'CAN transceiver', sublabel: 'TJA1050', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'motor', x: 823, y: 284.8, label: 'Wiper motor', sublabel: '12V DC', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n10', kind: 'obd', x: 818, y: 439.8, label: 'OBD-II port', sublabel: 'under dash', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n11', kind: 'lin', x: 567, y: 567.8, label: 'LIN transceiver', sublabel: 'TJA1021', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n12', kind: 'ic', x: 813, y: 572.8, label: 'Door module', sublabel: 'window lift', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out1' }, to: { node: 'n4', port: 'vcc' }, label: 'F1', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'power', from: { node: 'n2', port: 'out2' }, to: { node: 'n5', port: 'vcc' }, label: 'F2', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'power', from: { node: 'n2', port: 'out3' }, to: { node: 'n6', port: 'vcc' }, label: 'F3', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n6', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'can', from: { node: 'n4', port: 'can' }, to: { node: 'n7', port: 'mcu' }, label: 'TX/RX', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'can', from: { node: 'n6', port: 'can' }, to: { node: 'n8', port: 'mcu' }, label: 'TX/RX', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'can', from: { node: 'n7', port: 'bus' }, to: { node: 'n8', port: 'bus' }, label: 'CAN H/L', arrow: 'both', style: null, flow: null },
        { id: 'w10', bus: 'can', from: { node: 'n10', port: 'can' }, to: { node: 'n8', port: 'bus' }, label: 'diag tap', arrow: null, style: 'dashed', flow: null },
        { id: 'w11', bus: 'adc', from: { node: 'n3', port: 'out' }, to: { node: 'n4', port: 'adc' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w12', bus: 'pwm', from: { node: 'n4', port: 'pwm' }, to: { node: 'n5', port: 'in1' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w13', bus: 'power', from: { node: 'n5', port: 'out' }, to: { node: 'n9', port: 'vcc' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w14', bus: 'uart', from: { node: 'n6', port: 'uart' }, to: { node: 'n11', port: 'mcu' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w15', bus: 'gpio', from: { node: 'n11', port: 'bus' }, to: { node: 'n12', port: 'io1' }, label: 'LIN', arrow: null, style: 'dashed', flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 96, w: 200, h: 270, label: 'Power distribution', color: '#facc15' },
        { id: 'z2', x: 536, y: 112, w: 190, h: 430, label: 'CAN backbone', color: '#f87171' },
      ],
      notes: [
        { id: 't1', x: 800, y: 120, text: 'Scan tools query every ECU through the OBD-II tap' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power tree', view: { cx: 220, cy: 260, zoom: 1.05 },
          caption: 'The 12V battery feeds three fused branches: body ECU, H-bridge, and gateway.',
        },
        {
          id: 'j2', label: 'The backbone', view: { cx: 630, cy: 330, zoom: 0.95 },
          caption: 'Both ECUs talk through TJA1050 transceivers on one differential pair; the OBD-II port taps the same bus.',
        },
        {
          id: 'j3', label: 'Body control', view: { cx: 620, cy: 440, zoom: 0.95 },
          caption: 'The body ECU drives the wiper through an H-bridge; the gateway bridges CAN to LIN for the door module.',
        },
      ],
    },
  },
  {
    id: 'ota-pipeline',
    name: 'OTA Update Pipeline (swimlane)',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'OTA Update Pipeline',
      nodes: [
        { id: 'n1', kind: 'server', x: 117.2, y: 153.8, label: 'Build server', sublabel: 'CI artifacts', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n2', kind: 'database', x: 333, y: 153.8, label: 'Release DB', sublabel: 'versions', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'cloud', x: 623, y: 147.5, label: 'Update broker', sublabel: 'MQTT', color: null, addr: 'mqtts://updates:8883', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n4', kind: 'gateway', x: 622.2, y: 303.8, label: 'Edge gateway', sublabel: 'site LAN', color: null, addr: '', rail: '', notes: '', status: 'tested', flags: [] },
        { id: 'n5', kind: 'wifi', x: 258, y: 448, label: 'WiFi radio', sublabel: 'ESP32 NIC', color: null, addr: '', rail: '3.3V', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'mcu', x: 588, y: 447.5, label: 'Device MCU', sublabel: 'STM32F4', color: null, addr: '', rail: '3.3V', notes: 'Verifies the image signature before flashing.', status: 'production', flags: [] },
        { id: 'n7', kind: 'ic', x: 813, y: 453.8, label: 'SPI flash', sublabel: 'W25Q128', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'eth', from: { node: 'n1', port: 'db' }, to: { node: 'n2', port: 'net' }, label: 'artifacts', arrow: 'fwd', style: null, flow: null },
        { id: 'w2', bus: 'eth', from: { node: 'n1', port: 'db' }, to: { node: 'n3', port: 'net' }, label: 'publish', arrow: 'fwd', style: null, flow: null },
        { id: 'w3', bus: 'eth', from: { node: 'n4', port: 'wan' }, to: { node: 'n3', port: 'net' }, label: 'TLS uplink', arrow: 'both', style: null, flow: null },
        { id: 'w4', bus: 'rf', from: { node: 'n4', port: 'rf' }, to: { node: 'n5', port: 'ant' }, label: 'OTA push', arrow: 'fwd', style: null, flow: null },
        { id: 'w5', bus: 'uart', from: { node: 'n5', port: 'uart' }, to: { node: 'n6', port: 'uart' }, label: 'AT link', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'spi', from: { node: 'n6', port: 'spi' }, to: { node: 'n7', port: 'io1' }, label: 'image', arrow: 'fwd', style: null, flow: null },
      ],
      zones: [
        {
          id: 'z1', x: 48, y: 96, w: 940, h: 476, label: 'Firmware OTA pipeline', color: '#a78bfa',
          kind: 'swimlane', orient: 'h', lanes: ['Cloud', 'Gateway', 'Device'],
        },
      ],
      notes: [
        { id: 't1', x: 1010, y: 130, text: 'Signed images only - the MCU verifies before flashing' },
      ],
      journey: [
        {
          id: 'j1', label: 'Three lanes', view: { cx: 540, cy: 334, zoom: 0.9 },
          caption: 'One swimlane, three owners: the cloud builds, the gateway relays, the device flashes.',
        },
        {
          id: 'j2', label: 'Cloud lane', view: { cx: 440, cy: 210, zoom: 1.1 },
          caption: 'CI drops artifacts into the release DB and publishes to the MQTT broker.',
        },
        {
          id: 'j3', label: 'Down to the device', view: { cx: 590, cy: 430, zoom: 1 },
          caption: 'The gateway pushes the image over the air; the MCU checks the signature, then writes SPI flash.',
        },
      ],
    },
  },
  ...RDK_EXAMPLES,
  {
    id: 'journey-adas',
    name: 'Journey 6 ADAS Stack (Horizon)',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'Journey 6 ADAS Stack',
      nodes: [
        { id: 'n1', kind: 'vbat', x: 40, y: 330, label: 'Vehicle battery', sublabel: '12V', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'fusebox', x: 210, y: 330, label: 'Fuse box', sublabel: 'ADAS feed', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'adas', x: 440, y: 300, label: 'ADAS controller', sublabel: 'Journey 6M', color: null, addr: '', rail: '12V', notes: 'Horizon Journey 6M domain controller (80 TOPS, 100K DMIPS, BPU Nash): highway NOA and urban commute NOA from camera and radar fusion.', status: 'tested', flags: ['safety'] },
        { id: 'n4', kind: 'frontcam', x: 300, y: 80, label: 'Front camera', sublabel: '8MP GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'frontcam', x: 430, y: 80, label: 'Left camera', sublabel: '3MP GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'frontcam', x: 560, y: 80, label: 'Right camera', sublabel: '3MP GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'frontcam', x: 690, y: 80, label: 'Rear camera', sublabel: '3MP GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'radar', x: 760, y: 300, label: 'Front radar', sublabel: '77 GHz', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 't1switch', x: 760, y: 470, label: 'T1 switch', sublabel: '100BASE-T1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n10', kind: 'vgateway', x: 440, y: 540, label: 'Vehicle gateway', sublabel: 'CAN FD / body CAN', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n11', kind: 'obd', x: 220, y: 560, label: 'OBD-II port', sublabel: 'diagnostics', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n12', kind: 'autosoc', x: 940, y: 470, label: 'Cabin SoC', sublabel: 'Journey 6B', color: null, addr: '', rail: '', notes: 'Driver monitoring on a Horizon Journey 6B (10 TOPS); IR camera over MIPI CSI-2.', status: 'prototype', flags: [] },
        { id: 'n13', kind: 'mipicam', x: 940, y: 620, label: 'DMS camera', sublabel: 'IR 2MP', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out1' }, to: { node: 'n3', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'gmsl', from: { node: 'n4', port: 'out' }, to: { node: 'n3', port: 'cam1' }, label: 'GMSL2', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gmsl', from: { node: 'n5', port: 'out' }, to: { node: 'n3', port: 'cam2' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'gmsl', from: { node: 'n6', port: 'out' }, to: { node: 'n3', port: 'cam3' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'gmsl', from: { node: 'n7', port: 'out' }, to: { node: 'n3', port: 'cam4' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'canfd', from: { node: 'n8', port: 'canfd' }, to: { node: 'n3', port: 'canfd' }, label: 'radar', arrow: 'fwd', style: null, flow: null },
        { id: 'w9', bus: 't1', from: { node: 'n3', port: 't1' }, to: { node: 'n9', port: 'p1' }, label: '1000BASE-T1', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 't1', from: { node: 'n9', port: 'p2' }, to: { node: 'n12', port: 't1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 't1', from: { node: 'n9', port: 'p3' }, to: { node: 'n10', port: 't1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w12', bus: 'canfd', from: { node: 'n3', port: 'canfd2' }, to: { node: 'n10', port: 'canfd1' }, label: 'vehicle CAN FD', arrow: null, style: null, flow: null },
        { id: 'w13', bus: 'can', from: { node: 'n10', port: 'obd' }, to: { node: 'n11', port: 'can' }, label: 'OBD', arrow: null, style: null, flow: null },
        { id: 'w16', bus: 'mipi', from: { node: 'n12', port: 'csi' }, to: { node: 'n13', port: 'csi' }, label: 'CSI-2', arrow: null, style: null, flow: null },
        { id: 'w17', bus: 'power', from: { node: 'n2', port: 'out3' }, to: { node: 'n10', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w18', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n10', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 280, y: 60, w: 540, h: 130, label: 'Cameras', color: '#22d3ee' },
        { id: 'z2', x: 420, y: 280, w: 170, h: 140, label: 'Compute', color: '#facc15' },
        { id: 'z3', x: 200, y: 450, w: 690, h: 220, label: 'Vehicle network', color: '#60a5fa' },
        { id: 'z4', x: 920, y: 450, w: 150, h: 300, label: 'Cabin', color: '#a78bfa' },
        { id: 'z5', x: 24, y: 310, w: 310, h: 130, label: 'Power', color: '#f87171' },
      ],
      notes: [
        { id: 't1', x: 40, y: 60, text: 'Journey 6M runs highway and urban commute NOA. The cabin runs driver monitoring on a Journey 6B.' },
      ],
      journey: [
        {
          id: 'j1', label: 'Sensors', view: { cx: 550, cy: 125, zoom: 1 },
          caption: 'Four GMSL2 cameras and a 77 GHz radar feed the controller; the cameras take power over the coax.',
        },
        {
          id: 'j2', label: 'Compute', view: { cx: 640, cy: 350, zoom: 1.05 },
          caption: 'A Journey 6M domain controller (80 TOPS, BPU Nash) fuses cameras and radar for highway and urban commute NOA.',
        },
        {
          id: 'j3', label: 'Vehicle network', view: { cx: 560, cy: 550, zoom: 1 },
          caption: 'A T1 Ethernet switch links the controller, gateway, and cabin SoC; the gateway bridges CAN FD to the OBD-II port.',
        },
      ],
    },
  },
  {
    id: 'mono2-adas',
    name: 'Mono 2 Front-Camera ADAS (Horizon)',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'Mono 2 Front-Camera ADAS',
      nodes: [
        { id: 'n1', kind: 'vbat', x: 40, y: 330, label: 'Vehicle battery', sublabel: '12V', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'fusebox', x: 210, y: 330, label: 'Fuse box', sublabel: 'ADAS feed', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'adas', x: 440, y: 300, label: 'Front camera ECU', sublabel: 'Mono 2', color: null, addr: '', rail: '12V', notes: 'Horizon Mono 2 on Journey 2 (4 TOPS, BPU Bernoulli, 2W): single 1.7/2.6MP front camera @100/120 deg; FCW, LDW, AEB, BSD, ACC, TJA, TSR, ISA. All-in-one unit: the imager and the SoC share one housing; the imager card is drawn separately for clarity.', status: null, flags: [] },
        { id: 'n4', kind: 'frontcam', x: 440, y: 100, label: 'Imager', sublabel: '1.7MP, 100 deg', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'vgateway', x: 440, y: 540, label: 'Vehicle gateway', sublabel: 'CAN FD / body CAN', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'mcu', x: 720, y: 470, label: 'Brake ECU', sublabel: 'ESC', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'mcu', x: 720, y: 600, label: 'Steering ECU', sublabel: 'EPS', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'mcu', x: 720, y: 730, label: 'Instrument cluster', sublabel: 'HMI', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'obd', x: 220, y: 560, label: 'OBD-II port', sublabel: 'diagnostics', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out1' }, to: { node: 'n3', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'gmsl', from: { node: 'n4', port: 'out' }, to: { node: 'n3', port: 'cam1' }, label: 'imager', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'canfd', from: { node: 'n3', port: 'canfd' }, to: { node: 'n5', port: 'canfd1' }, label: 'ADAS CAN FD', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'can', from: { node: 'n5', port: 'can' }, to: { node: 'n6', port: 'can' }, label: 'chassis CAN', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'can', from: { node: 'n5', port: 'can' }, to: { node: 'n7', port: 'can' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'can', from: { node: 'n5', port: 'can' }, to: { node: 'n8', port: 'can' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'can', from: { node: 'n5', port: 'obd' }, to: { node: 'n9', port: 'can' }, label: 'OBD', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'power', from: { node: 'n2', port: 'out2' }, to: { node: 'n5', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 420, y: 80, w: 180, h: 340, label: 'Mono 2 all-in-one', color: '#facc15' },
        { id: 'z2', x: 200, y: 520, w: 440, h: 150, label: 'Vehicle network', color: '#60a5fa' },
        { id: 'z3', x: 700, y: 440, w: 190, h: 420, label: 'Chassis and cabin ECUs', color: '#a78bfa' },
        { id: 'z4', x: 24, y: 310, w: 310, h: 130, label: 'Power', color: '#f87171' },
      ],
      notes: [
        { id: 't1', x: 40, y: 60, text: 'Mono 2 is a vision-only all-in-one: the imager and the Journey 2 SoC share one housing. Brake, steering and cluster ECU supplies are not drawn.' },
      ],
      journey: [
        {
          id: 'j1', label: 'One camera', view: { cx: 510, cy: 250, zoom: 1 },
          caption: 'A single 1.7MP imager and a Journey 2 (4 TOPS, 2W) share one housing; the imager is drawn as its own card so the link stays visible. FCW, LDW, AEB, ACC, TJA and traffic-sign functions run here.',
        },
        {
          id: 'j2', label: 'Into the vehicle', view: { cx: 500, cy: 560, zoom: 1 },
          caption: 'The camera ECU speaks CAN FD to the vehicle gateway, which bridges to chassis CAN and exposes diagnostics on the OBD-II port.',
        },
        {
          id: 'j3', label: 'Acting on it', view: { cx: 800, cy: 640, zoom: 1 },
          caption: 'Brake and steering ECUs take AEB and lane-keeping requests over chassis CAN; the instrument cluster shows the warnings. ECU supplies remain undrawn general findings.',
        },
      ],
    },
  },
  {
    id: 'hsd600-adas',
    name: 'SuperDrive HSD 600 Urban NOA (Horizon)',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'SuperDrive HSD 600 Urban NOA',
      nodes: [
        { id: 'n1', kind: 'vbat', x: 40, y: 330, label: 'Vehicle battery', sublabel: '12V', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'fusebox', x: 210, y: 330, label: 'Fuse box', sublabel: 'ADAS feed', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'adas', x: 440, y: 300, label: 'Domain controller', sublabel: 'HSD 600', color: null, addr: '', rail: '12V', notes: 'Horizon SuperDrive HSD 600 on Journey 6P (560 TOPS effective, 410K CPU DMIPS, BPU Nash): 11 cameras, 3 radars, optional LiDAR; one-stage end-to-end urban, highway, and parking assistance.', status: null, flags: [] },
        { id: 'n4', kind: 'frontcam', x: 300, y: 80, label: 'Front cluster', sublabel: 'x3 GMSL2', color: null, addr: '', rail: '', notes: 'Three forward cameras drawn as one cluster; each keeps its own coax in the harness.', status: null, flags: [] },
        { id: 'n5', kind: 'frontcam', x: 440, y: 80, label: 'Left cluster', sublabel: 'x2 GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'frontcam', x: 580, y: 80, label: 'Right cluster', sublabel: 'x2 GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'frontcam', x: 720, y: 80, label: 'Rear and parking', sublabel: 'x4 GMSL2', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'radar', x: 760, y: 250, label: 'Front radar', sublabel: '77 GHz', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'radar', x: 700, y: 350, label: 'Left corner radar', sublabel: '77 GHz', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n10', kind: 'radar', x: 860, y: 450, label: 'Right corner radar', sublabel: '77 GHz', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n11', kind: 't1switch', x: 760, y: 600, label: 'T1 switch', sublabel: '1000BASE-T1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n12', kind: 'vgateway', x: 220, y: 600, label: 'Vehicle gateway', sublabel: 'CAN FD / body CAN', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n13', kind: 'obd', x: 60, y: 620, label: 'OBD-II port', sublabel: 'diagnostics', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out1' }, to: { node: 'n3', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'gmsl', from: { node: 'n4', port: 'out' }, to: { node: 'n3', port: 'cam1' }, label: 'GMSL2 x3', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'gmsl', from: { node: 'n5', port: 'out' }, to: { node: 'n3', port: 'cam2' }, label: 'x2', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'gmsl', from: { node: 'n6', port: 'out' }, to: { node: 'n3', port: 'cam3' }, label: 'x2', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'gmsl', from: { node: 'n7', port: 'out' }, to: { node: 'n3', port: 'cam4' }, label: 'x4', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'canfd', from: { node: 'n8', port: 'canfd' }, to: { node: 'n3', port: 'canfd' }, label: 'front radar', arrow: 'fwd', style: null, flow: null },
        { id: 'w9', bus: 't1', from: { node: 'n3', port: 't1' }, to: { node: 'n11', port: 'p1' }, label: '1000BASE-T1', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 't1', from: { node: 'n9', port: 't1' }, to: { node: 'n11', port: 'p2' }, label: 'corner radar', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 't1', from: { node: 'n10', port: 't1' }, to: { node: 'n11', port: 'p3' }, label: 'corner radar', arrow: null, style: null, flow: null },
        { id: 'w12', bus: 'canfd', from: { node: 'n3', port: 'canfd2' }, to: { node: 'n12', port: 'canfd1' }, label: 'vehicle CAN FD', arrow: null, style: null, flow: null },
        { id: 'w13', bus: 'can', from: { node: 'n12', port: 'obd' }, to: { node: 'n13', port: 'can' }, label: 'OBD', arrow: null, style: null, flow: null },
        { id: 'w14', bus: 'power', from: { node: 'n2', port: 'out2' }, to: { node: 'n12', port: 'vcc' }, label: '12V', arrow: null, style: null, flow: null },
        { id: 'w15', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n12', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 280, y: 60, w: 600, h: 130, label: 'Cameras (11)', color: '#22d3ee' },
        { id: 'z2', x: 420, y: 280, w: 180, h: 140, label: 'Compute', color: '#facc15' },
        { id: 'z3', x: 680, y: 230, w: 340, h: 330, label: 'Radars', color: '#fbbf24' },
        { id: 'z4', x: 40, y: 580, w: 860, h: 150, label: 'Vehicle network', color: '#60a5fa' },
        { id: 'z5', x: 24, y: 310, w: 310, h: 130, label: 'Power', color: '#f87171' },
      ],
      notes: [
        { id: 't1', x: 40, y: 30, text: 'HSD 600 sensor set: 11 cameras drawn as four clusters, 3 radars; the optional LiDAR is not drawn. Camera, radar and switch supplies are not drawn.' },
      ],
      journey: [
        {
          id: 'j1', label: 'Eleven cameras', view: { cx: 580, cy: 125, zoom: 1 },
          caption: 'Eleven GMSL2 cameras reach the controller as four clusters: three forward, two per side, and four rear and parking. Each camera keeps its own coax in the harness; the clusters keep the drawing readable.',
        },
        {
          id: 'j2', label: 'Compute', view: { cx: 600, cy: 350, zoom: 1.05 },
          caption: 'A Journey 6P (560 TOPS effective, BPU Nash) runs Horizon SuperDrive end to end across urban, highway and parking scenes. The front radar arrives over CAN FD, the corner radars over T1.',
        },
        {
          id: 'j3', label: 'Vehicle network', view: { cx: 470, cy: 640, zoom: 1 },
          caption: 'A 1000BASE-T1 switch joins the controller and corner radars; the gateway bridges CAN FD to body CAN and the OBD-II port. Camera, radar and switch supplies remain undrawn general findings.',
        },
      ],
    },
  },
  {
    id: 'sensor-node-clean',
    name: 'Sensor Node (DRC clean)',
    group: 'Embedded',
    doc: {
      schema: 2,
      title: 'Sensor Node',
      nodes: [
        { id: 'n1', kind: 'battery', x: 40, y: 300, label: 'Battery', sublabel: '1S LiPo', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n2', kind: 'regulator', x: 220, y: 300, label: 'Regulator', sublabel: '3.3V LDO', color: null, addr: '', rail: '', notes: 'Low-quiescent LDO; every peripheral hangs off its 3.3V rail.', status: 'production', flags: [] },
        { id: 'n3', kind: 'mcu', x: 460, y: 80, label: 'MCU', sublabel: 'ESP32-C3', color: null, addr: '', rail: '3.3V', notes: 'Wakes every minute, samples the BME280, updates the OLED, blinks once.', status: 'production', flags: [] },
        { id: 'n4', kind: 'temp', x: 720, y: 60, label: 'Temp sensor', sublabel: 'BME280', color: null, addr: '0x76', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n5', kind: 'display', x: 720, y: 220, label: 'OLED', sublabel: 'SSD1306', color: null, addr: '0x3C', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'led', x: 720, y: 400, label: 'Status LED', sublabel: 'green', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: 'VBAT', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n2', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n6', port: 'vcc' }, label: '3V3', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n6', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n4', port: 'i2c' }, label: '400 kHz', arrow: null, style: null, flow: null },
        { id: 'w12', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n5', port: 'i2c' }, label: '400 kHz', arrow: null, style: null, flow: null },
        { id: 'w13', bus: 'gpio', from: { node: 'n3', port: 'gpio1' }, to: { node: 'n6', port: 'in' }, label: 'GPIO 8', arrow: 'fwd', style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 280, w: 316, h: 130, label: 'Power', color: '#f87171' },
        { id: 'z2', x: 700, y: 40, w: 150, h: 320, label: 'I2C peripherals', color: '#22d3ee' },
      ],
      notes: [
        { id: 't1', x: 420, y: 470, text: 'Every supply pin is wired and both I2C addresses differ: Check reports nothing.' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power tree', view: { cx: 300, cy: 340, zoom: 1.1 },
          caption: 'A 1S LiPo feeds a 3.3V LDO; the LDO powers every other part, VCC and GND alike.',
        },
        {
          id: 'j2', label: 'Controller', view: { cx: 520, cy: 180, zoom: 1.1 },
          caption: 'An ESP32-C3 drives one I2C bus and a status LED on GPIO 8.',
        },
        {
          id: 'j3', label: 'Peripherals', view: { cx: 770, cy: 270, zoom: 1.05 },
          caption: 'The BME280 at 0x76 and the SSD1306 at 0x3C share the bus without an address clash.',
        },
      ],
    },
  },
  {
    id: 'ota-security',
    name: 'Vehicle OTA Security (threats & flow)',
    group: 'Security',
    doc: {
      schema: 2,
      title: 'Vehicle OTA Security',
      nodes: [
        { id: 't1', kind: 'insider', x: 60, y: 80, label: 'Rogue engineer', sublabel: '', color: null, addr: '', rail: '', notes: 'Could push an unsigned build if signing keys were shared.', status: null, flags: [], disposition: 'adversary', fields: { type: 'insider-disgruntled', motivation: 'personal-gain', owner: 'svc-build', severity: 'high' } },
        { id: 't2', kind: 'mitm', x: 60, y: 230, label: 'On-path adversary', sublabel: '', color: null, addr: '', rail: '', notes: 'Tries to swap the image between the CDN and the vehicle.', status: null, flags: [], disposition: 'adversary', fields: { position: 'OTA path', severity: 'high' } },
        { id: 't3', kind: 'malware', x: 60, y: 470, label: 'Trojan image', sublabel: '', color: null, addr: '', rail: '', notes: 'A tampered bundle fails the signature check on the device.', status: null, flags: [], disposition: 'adversary', fields: { family: 'trojanized bundle', type: 'trojan', severity: 'critical' } },
        { id: 'c1', kind: 'server', x: 260, y: 80, label: 'Build server', sublabel: 'CI + signing', color: null, addr: '', rail: '', notes: 'Every image is signed with the release key in an HSM.', status: 'production', flags: ['safety'], fields: { ip: '10.9.0.2' } },
        { id: 'c2', kind: 'apigateway', x: 400, y: 80, label: 'Update API', sublabel: 'mTLS', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.9.0.4' } },
        { id: 'c3', kind: 'waf', x: 540, y: 80, label: 'WAF', sublabel: '', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.9.0.5' } },
        { id: 'c4', kind: 'cdn', x: 680, y: 80, label: 'Image CDN', sublabel: 'signed bundles', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], disposition: 'victim', fields: { dns: 'cdn.example.net' } },
        { id: 'net', kind: 'internet', x: 970, y: 80, label: 'Internet', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f1', kind: 'startend', x: 260, y: 330, label: 'Start', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f2', kind: 'process', x: 400, y: 330, label: 'Download image', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f3', kind: 'decision', x: 560, y: 319, label: 'Signature valid?', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f4', kind: 'process', x: 790, y: 330, label: 'Flash slot B', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f5', kind: 'dataio', x: 560, y: 440, label: 'Reject & report', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f6', kind: 'process', x: 790, y: 440, label: 'Reboot & attest', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f7', kind: 'startend', x: 790, y: 550, label: 'End', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'v1', kind: 'gateway', x: 970, y: 250, label: 'Telematics unit', sublabel: 'TCU', color: null, addr: '', rail: '', notes: 'Pulls the bundle over HTTPS and forwards it on the vehicle network.', status: 'production', flags: [] },
        { id: 'v2', kind: 'vgateway', x: 970, y: 390, label: 'Vehicle gateway', sublabel: 'CAN FD / T1', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'v3', kind: 'mcu', x: 970, y: 520, label: 'Device MCU', sublabel: 'STM32F4', color: null, addr: '', rail: '3.3V', notes: 'Verifies the signature, then writes slot B and reboots into it.', status: 'production', flags: ['safety'] },
        { id: 'v4', kind: 'eeprom', x: 1120, y: 520, label: 'SPI flash', sublabel: 'W25Q128', color: null, addr: '', rail: '3.3V', notes: '', status: 'production', flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'eth', from: { node: 'c1', port: 'db' }, to: { node: 'c2', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w2', bus: 'eth', from: { node: 'c2', port: 'e' }, to: { node: 'c3', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w3', bus: 'eth', from: { node: 'c3', port: 'e' }, to: { node: 'c4', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w4', bus: 'eth', from: { node: 'c4', port: 'e' }, to: { node: 'net', port: 'w' }, label: 'signed image', arrow: 'fwd', style: null, flow: null },
        { id: 'w5', bus: 'eth', from: { node: 'net', port: 's' }, to: { node: 'v1', port: 'wan' }, label: 'HTTPS', arrow: 'fwd', style: null, flow: null },
        { id: 'w6', bus: 't1', from: { node: 'v1', port: 'lan' }, to: { node: 'v2', port: 't1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'canfd', from: { node: 'v2', port: 'canfd1' }, to: { node: 'v3', port: 'can' }, label: 'CAN FD', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'spi', from: { node: 'v3', port: 'spi' }, to: { node: 'v4', port: 'spi' }, label: 'SPI', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'flow', from: { node: 'f1', port: 'e' }, to: { node: 'f2', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w10', bus: 'flow', from: { node: 'f2', port: 'e' }, to: { node: 'f3', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w11', bus: 'flow', from: { node: 'f3', port: 'e' }, to: { node: 'f4', port: 'w' }, label: 'yes', arrow: 'fwd', style: null, flow: null },
        { id: 'w12', bus: 'flow', from: { node: 'f3', port: 's' }, to: { node: 'f5', port: 'n' }, label: 'no', arrow: 'fwd', style: null, flow: null },
        { id: 'w13', bus: 'flow', from: { node: 'f4', port: 's' }, to: { node: 'f6', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w14', bus: 'flow', from: { node: 'f6', port: 's' }, to: { node: 'f7', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w15', bus: 'flow', from: { node: 'f5', port: 'e' }, to: { node: 'f7', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w16', bus: 'link', from: { node: 't1', port: 'e' }, to: { node: 'c1', port: 'net' }, label: 'poisons', arrow: 'fwd', style: 'dotted', flow: null },
        { id: 'w17', bus: 'link', from: { node: 't2', port: 'e' }, to: { node: 'c4', port: 's' }, label: 'tampers', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w18', bus: 'link', from: { node: 't3', port: 'e' }, to: { node: 'f2', port: 's' }, label: 'injected', arrow: 'fwd', style: 'dashed', flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 40, w: 190, h: 540, label: 'Threats', color: '#f87171' },
        { id: 'z2', x: 240, y: 40, w: 690, h: 170, label: 'Build & delivery', color: '#38bdf8' },
        { id: 'z3', x: 240, y: 300, w: 690, h: 330, label: 'Update verification', color: '#60a5fa' },
        { id: 'z4', x: 950, y: 230, w: 300, h: 400, label: 'Vehicle', color: '#facc15' },
      ],
      notes: [
        { id: 'n1', x: 240, y: 650, text: 'Signed images only: a poisoned build or a tampered CDN copy fails the check on the MCU.' },
      ],
      journey: [
        {
          id: 'j1', label: 'Delivery', view: { cx: 600, cy: 125, zoom: 1.05 },
          caption: 'The build server signs every image; it travels through the update API, the WAF, and the CDN to the Internet.',
        },
        {
          id: 'j2', label: 'Verification', view: { cx: 590, cy: 460, zoom: 1 },
          caption: 'The device downloads, checks the signature, flashes slot B, and reboots into it; a bad signature is rejected and reported.',
        },
        {
          id: 'j3', label: 'Threats', view: { cx: 130, cy: 260, zoom: 1.05 },
          caption: 'A rogue engineer, an on-path adversary, and a trojanized image each aim at a different link; the signature check defeats all three.',
        },
        {
          id: 'j4', label: 'Vehicle', view: { cx: 1100, cy: 430, zoom: 1 },
          caption: 'TCU to gateway over T1, gateway to MCU over CAN FD, MCU to SPI flash: the update ends in the device.',
        },
      ],
    },
  },
  {
    id: 'adas-security',
    name: 'ADAS Security (threats & response)',
    group: 'Security',
    doc: {
      schema: 2,
      title: 'ADAS Security',
      nodes: [
        { id: 't1', kind: 'spoofing', x: 60, y: 60, label: 'Sensor spoofer', sublabel: '', color: null, addr: '', rail: '', notes: 'Fake GNSS signals and projected images against the perception stack.', status: null, flags: [], disposition: 'adversary', fields: { target: 'GNSS', severity: 'high' } },
        { id: 's1', kind: 'frontcam', x: 260, y: 60, label: 'Front camera', sublabel: '8MP GMSL2', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 's2', kind: 'radar', x: 260, y: 190, label: 'Front radar', sublabel: '77 GHz', color: null, addr: '', rail: '', notes: 'Independent range truth for plausibility checks.', status: 'production', flags: [] },
        { id: 's3', kind: 'gps', x: 260, y: 320, label: 'GNSS', sublabel: 'RTK', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'c1', kind: 'adas', x: 480, y: 190, label: 'ADAS controller', sublabel: 'Journey 6M', color: null, addr: '', rail: '12V', notes: 'Fusion with plausibility checks: camera frames that disagree with radar are dropped.', status: 'tested', flags: ['safety'] },
        { id: 'c2', kind: 'firewall', x: 480, y: 340, label: 'CAN IDS', sublabel: 'domain firewall', color: null, addr: '', rail: '', notes: 'Rate and plausibility rules on the CAN FD segments; drops unexpected control frames.', status: 'prototype', flags: [] },
        { id: 'n4', kind: 'autosoc', x: 680, y: 60, label: 'Head unit', sublabel: 'cockpit SoC', color: null, addr: '', rail: '', notes: 'Connected infotainment; the usual foothold.', status: 'production', flags: [] },
        { id: 'n2', kind: 't1switch', x: 680, y: 190, label: 'T1 switch', sublabel: '100BASE-T1', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n1', kind: 'vgateway', x: 680, y: 320, label: 'Vehicle gateway', sublabel: 'CAN FD / T1', color: null, addr: '', rail: '', notes: 'Separates the diagnostic, infotainment, and safety domains.', status: 'production', flags: ['safety'] },
        { id: 'n5', kind: 'mcu', x: 880, y: 320, label: 'Brake ECU', sublabel: 'ASIL-D', color: null, addr: 'CAN ID 0x0C0', rail: '5V', notes: 'The asset every attack here is ultimately after.', status: 'production', flags: ['safety'] },
        { id: 'n3', kind: 'obd', x: 880, y: 450, label: 'OBD-II port', sublabel: 'diagnostics', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], disposition: 'victim' },
        { id: 't3', kind: 'malware', x: 1060, y: 60, label: 'Infotainment RAT', sublabel: '', color: null, addr: '', rail: '', notes: 'Pivots from the connected head unit toward the vehicle network.', status: null, flags: [], disposition: 'adversary', fields: { family: 'infotainment RAT', type: 'remote-access-trojan', severity: 'critical' } },
        { id: 't4', kind: 'c2', x: 1060, y: 190, label: 'C2 server', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], disposition: 'adversary', fields: { ip: '198.51.100.7', severity: 'high' } },
        { id: 'vu', kind: 'vulnerability', x: 1060, y: 320, label: 'Unauthenticated UDS', sublabel: '', color: null, addr: '', rail: '', notes: 'Diagnostic reprogramming on the brake ECU accepts sessions without a seed/key exchange.', status: null, flags: [], fields: { cvss: '8.8', affected: 'UDS reprogramming', severity: 'critical' } },
        { id: 't2', kind: 'physical', x: 1060, y: 450, label: 'CAN injector', sublabel: '', color: null, addr: '', rail: '', notes: 'A dongle on the diagnostic port injects control frames.', status: null, flags: [], disposition: 'adversary', fields: { access: 'OBD-II', severity: 'critical' } },
        { id: 'f1', kind: 'startend', x: 260, y: 600, label: 'Anomaly', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f2', kind: 'process', x: 400, y: 600, label: 'Isolate domain', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f3', kind: 'decision', x: 580, y: 589, label: 'Safety critical?', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f4', kind: 'process', x: 800, y: 600, label: 'Degrade to safe mode', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f5', kind: 'dataio', x: 580, y: 690, label: 'Log & alert SOC', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f6', kind: 'startend', x: 900, y: 690, label: 'End', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'gmsl', from: { node: 's1', port: 'out' }, to: { node: 'c1', port: 'cam1' }, label: 'GMSL2', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'canfd', from: { node: 's2', port: 'canfd' }, to: { node: 'c1', port: 'canfd' }, label: 'radar', arrow: 'fwd', style: null, flow: null },
        { id: 'w3', bus: 'uart', from: { node: 's3', port: 'uart' }, to: { node: 'c1', port: 'canfd2' }, label: 'NMEA', arrow: 'fwd', style: null, flow: null },
        { id: 'w4', bus: 't1', from: { node: 'c1', port: 't1' }, to: { node: 'n2', port: 'p1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 't1', from: { node: 'n2', port: 'p2' }, to: { node: 'n4', port: 't1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 't1', from: { node: 'n2', port: 'p3' }, to: { node: 'n1', port: 't1' }, label: 'T1', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'canfd', from: { node: 'n1', port: 'canfd1' }, to: { node: 'n5', port: 'can' }, label: 'CAN FD', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'can', from: { node: 'n1', port: 'obd' }, to: { node: 'n3', port: 'can' }, label: 'diag CAN', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'canfd', from: { node: 'n1', port: 'canfd2' }, to: { node: 'c2', port: 'e' }, label: 'mirror', arrow: 'fwd', style: null, flow: null },
        { id: 'w10', bus: 'link', from: { node: 't1', port: 'e' }, to: { node: 's1', port: 'out' }, label: 'spoofs', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w11', bus: 'link', from: { node: 't1', port: 'e' }, to: { node: 's3', port: 'ant' }, label: 'GNSS spoof', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w12', bus: 'link', from: { node: 't2', port: 'w' }, to: { node: 'n3', port: 'can' }, label: 'injects', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w13', bus: 'link', from: { node: 't3', port: 'w' }, to: { node: 'n4', port: 'eth' }, label: 'infects', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w14', bus: 'link', from: { node: 'n4', port: 'eth' }, to: { node: 't4', port: 'w' }, label: 'beacons', arrow: 'fwd', style: 'dotted', flow: null },
        { id: 'w21', bus: 'link', from: { node: 'vu', port: 'w' }, to: { node: 'n5', port: 'uart' }, label: 'exposes', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w15', bus: 'flow', from: { node: 'f1', port: 'e' }, to: { node: 'f2', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w16', bus: 'flow', from: { node: 'f2', port: 'e' }, to: { node: 'f3', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w17', bus: 'flow', from: { node: 'f3', port: 'e' }, to: { node: 'f4', port: 'w' }, label: 'yes', arrow: 'fwd', style: null, flow: null },
        { id: 'w18', bus: 'flow', from: { node: 'f3', port: 's' }, to: { node: 'f5', port: 'n' }, label: 'no', arrow: 'fwd', style: null, flow: null },
        { id: 'w19', bus: 'flow', from: { node: 'f4', port: 's' }, to: { node: 'f6', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w20', bus: 'flow', from: { node: 'f5', port: 'e' }, to: { node: 'f6', port: 'w' }, label: '', arrow: 'fwd', style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 24, y: 20, w: 190, h: 150, label: 'Perception threats', color: '#f87171' },
        { id: 'z2', x: 240, y: 20, w: 150, h: 410, label: 'Sensors', color: '#22d3ee' },
        { id: 'z3', x: 460, y: 150, w: 170, h: 300, label: 'Compute & controls', color: '#facc15' },
        { id: 'z4', x: 660, y: 20, w: 370, h: 540, label: 'Vehicle network', color: '#60a5fa' },
        { id: 'z5', x: 1040, y: 20, w: 190, h: 540, label: 'Network threats & flaws', color: '#f87171' },
        { id: 'z6', x: 240, y: 560, w: 790, h: 220, label: 'Intrusion response', color: '#a78bfa' },
      ],
      notes: [
        { id: 'x1', x: 1060, y: 600, text: 'Plausibility checks, a CAN IDS, and domain isolation: each threat meets a control.' },
      ],
      journey: [
        {
          id: 'j1', label: 'Perception attacks', view: { cx: 300, cy: 230, zoom: 1.05 },
          caption: 'Projected images and spoofed GNSS reach the camera and receiver; radar gives the controller independent truth to check them against.',
        },
        {
          id: 'j2', label: 'Network and injection', view: { cx: 870, cy: 290, zoom: 1 },
          caption: 'The gateway separates diagnostic, infotainment, and safety domains; the OBD dongle and the infected head unit never reach the brake ECU directly.',
        },
        {
          id: 'j3', label: 'Controls', view: { cx: 545, cy: 300, zoom: 1.05 },
          caption: 'A CAN IDS mirrors the safety segment and drops unexpected control frames; the ADAS controller drops camera frames that disagree with radar.',
        },
        {
          id: 'j4', label: 'Response', view: { cx: 630, cy: 670, zoom: 1 },
          caption: 'An anomaly isolates its domain; safety-critical cases degrade to a safe mode, the rest are logged and raised to the SOC.',
        },
      ],
    },
  },
  {
    id: 'ev-bms',
    name: 'EV Battery Management (HV + CAN)',
    group: 'Vehicle',
    doc: {
      schema: 2,
      title: 'EV Battery Management',
      nodes: [
        { id: 'n1', kind: 'battery', x: 60, y: 140, label: 'HV pack', sublabel: '96S 400 V', color: null, addr: '', rail: '', notes: 'Ninety-six cells in series; the contactors isolate it from the vehicle whenever the BMS opens them.', status: 'production', flags: ['safety'] },
        { id: 'n2', kind: 'fuse', x: 320, y: 140, label: 'Pyro fuse', sublabel: '500 A', color: null, addr: '', rail: '', notes: '', status: 'production', flags: ['safety'], fields: { imax: '500A' } },
        { id: 'n3', kind: 'relay', x: 580, y: 60, label: 'Main contactor', sublabel: 'EV200', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n4', kind: 'relay', x: 580, y: 230, label: 'Precharge contactor', sublabel: 'EV200 + 50 Ω', color: null, addr: '', rail: '', notes: 'Closes first so the inverter capacitors charge through the resistor.', status: 'production', flags: [] },
        { id: 'n5', kind: 'adcin', x: 320, y: 330, label: 'Current sensor', sublabel: 'shunt 500 A', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'ic', x: 60, y: 330, label: 'Cell monitor A', sublabel: 'BQ79616', color: null, addr: 'cells 1-16', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n7', kind: 'ic', x: 60, y: 500, label: 'Cell monitor B', sublabel: 'BQ79616', color: null, addr: 'cells 17-32', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n8', kind: 'adcin', x: 320, y: 500, label: 'Pack NTCs', sublabel: 'NTC ×8', color: null, addr: '', rail: '', notes: '', status: 'tested', flags: ['thermal'] },
        { id: 'n9', kind: 'mcu', x: 900, y: 180, label: 'BMS MCU', sublabel: 'TC377', color: null, addr: '', rail: '5 V', notes: 'ASIL-C lockstep core; opens both contactors on any cell over 4.25 V or under 2.8 V.', status: 'production', flags: ['safety'] },
        { id: 'n10', kind: 'cantrx', x: 1160, y: 180, label: 'CAN transceiver', sublabel: 'TJA1051', color: null, addr: '', rail: '5 V', notes: '', status: 'production', flags: [], fields: { ityp: '5mA', ipeak: '50mA' } },
        { id: 'n11', kind: 'vgateway', x: 1440, y: 180, label: 'Vehicle gateway', sublabel: '', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n12', kind: 'regulator', x: 900, y: 420, label: '12 V to 5 V', sublabel: 'buck', color: null, addr: '', rail: '5 V', notes: '', status: 'production', flags: [], fields: { imax: '1A' } },
        { id: 'n13', kind: 'vbat', x: 900, y: 590, label: '12 V aux battery', sublabel: 'AGM', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n14', kind: 'sensor', x: 1160, y: 420, label: 'Isolation monitor', sublabel: 'IMD', color: null, addr: '', rail: '5 V', notes: '', status: 'prototype', flags: ['safety'] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: 'HV+', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '400 V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'vcc' }, label: 'precharge', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'gpio', from: { node: 'n9', port: 'gpio1' }, to: { node: 'n3', port: 'in' }, label: 'MAIN_EN', arrow: 'fwd', style: null, flow: null },
        { id: 'w5', bus: 'gpio', from: { node: 'n9', port: 'gpio2' }, to: { node: 'n4', port: 'in' }, label: 'PRECHG_EN', arrow: 'fwd', style: null, flow: null },
        { id: 'w6', bus: 'adc', from: { node: 'n5', port: 'out' }, to: { node: 'n9', port: 'adc' }, label: 'I_PACK', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'adc', from: { node: 'n8', port: 'out' }, to: { node: 'n9', port: 'adc' }, label: 'T_PACK', arrow: null, style: null, flow: null },
        { id: 'w8', bus: 'spi', from: { node: 'n9', port: 'spi' }, to: { node: 'n6', port: 'io1' }, label: 'isoSPI', arrow: 'both', style: null, flow: null },
        { id: 'w9', bus: 'gpio', from: { node: 'n6', port: 'io2' }, to: { node: 'n7', port: 'io1' }, label: 'daisy chain', arrow: 'both', style: null, flow: null },
        { id: 'w10', bus: 'can', from: { node: 'n9', port: 'can' }, to: { node: 'n10', port: 'mcu' }, label: 'CAN TX/RX', arrow: null, style: null, flow: null },
        { id: 'w11', bus: 'can', from: { node: 'n10', port: 'bus' }, to: { node: 'n11', port: 'can' }, label: '500 kbit/s', arrow: 'both', style: null, flow: null },
        { id: 'w12', bus: 'power', from: { node: 'n13', port: 'out' }, to: { node: 'n12', port: 'in' }, label: '12 V', arrow: null, style: null, flow: null },
        { id: 'w13', bus: 'gnd', from: { node: 'n13', port: 'gnd' }, to: { node: 'n12', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w14', bus: 'power', from: { node: 'n12', port: 'out' }, to: { node: 'n9', port: 'vcc' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w15', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n9', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w16', bus: 'power', from: { node: 'n12', port: 'out' }, to: { node: 'n10', port: 'vcc' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w17', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n10', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w18', bus: 'i2c', from: { node: 'n9', port: 'i2c' }, to: { node: 'n14', port: 'i2c' }, label: 'status', arrow: null, style: null, flow: null },
        { id: 'w19', bus: 'power', from: { node: 'n12', port: 'out' }, to: { node: 'n14', port: 'vcc' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w20', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n14', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w21', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n6', port: 'vcc' }, label: 'cell taps', arrow: null, style: null, flow: null },
        { id: 'w22', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n6', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w23', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n7', port: 'vcc' }, label: 'cell taps', arrow: null, style: null, flow: null },
        { id: 'w24', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n7', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w25', bus: 'power', from: { node: 'n12', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w26', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w27', bus: 'power', from: { node: 'n12', port: 'out' }, to: { node: 'n8', port: 'vcc' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w28', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n8', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w29', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: 'coil return', arrow: null, style: null, flow: null },
        { id: 'w30', bus: 'gnd', from: { node: 'n12', port: 'gnd' }, to: { node: 'n4', port: 'gnd' }, label: 'coil return', arrow: null, style: null, flow: null },
        { id: 'w31', bus: 'power', from: { node: 'n13', port: 'out' }, to: { node: 'n11', port: 'vcc' }, label: '12 V', arrow: null, style: null, flow: null },
        { id: 'w32', bus: 'gnd', from: { node: 'n13', port: 'gnd' }, to: { node: 'n11', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 30, y: 30, w: 800, h: 620, label: 'HV pack', color: '#f87171' },
        { id: 'z2', x: 870, y: 120, w: 540, h: 560, label: 'Low-voltage control', color: '#60a5fa' },
        { id: 'z3', x: 1420, y: 120, w: 260, h: 200, label: 'Vehicle', color: '#fbbf24' },
      ],
      notes: [
        { id: 'x1', x: 60, y: 690, text: 'Precharge closes first; the main contactor follows once the bus voltage matches the pack. Any cell fault opens both.' },
      ],
      journey: [
        { id: 'j1', label: 'HV pack', view: { cx: 430, cy: 340, zoom: 0.9 }, caption: 'Ninety-six cells, a pyro fuse, and two contactors: nothing leaves the pack unless the BMS says so.' },
        { id: 'j2', label: 'Cell monitoring', view: { cx: 300, cy: 450, zoom: 1.05 }, caption: 'Two BQ79616 monitors daisy-chained over isoSPI report every cell voltage; a shunt and eight NTCs cover current and temperature.' },
        { id: 'j3', label: 'Control', view: { cx: 1140, cy: 400, zoom: 1.0 }, caption: 'The lockstep MCU runs from the 12 V aux rail, drives both contactors, and talks to the vehicle over 500 kbit/s CAN.' },
        { id: 'j4', label: 'Vehicle', view: { cx: 1500, cy: 220, zoom: 1.1 }, caption: 'State of charge, current limits, and faults reach the gateway; the gateway never touches the HV side.' },
      ],
    },
  },
  {
    id: 'ot-purdue',
    name: 'OT Network Segmentation (Purdue swimlane)',
    group: 'Security',
    doc: {
      schema: 2,
      title: 'OT Network Segmentation',
      nodes: [
        { id: 'n1', kind: 'hostpc', x: 60, y: 116, label: 'Engineering workstation', sublabel: 'Windows 11', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.1.0.20', dns: 'eng01.corp.local' } },
        { id: 'n2', kind: 'server', x: 320, y: 116, label: 'ERP / MES', sublabel: '', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.1.0.5', dns: 'mes.corp.local' } },
        { id: 'n3', kind: 'firewall', x: 580, y: 116, label: 'Perimeter firewall', sublabel: '', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.1.0.1' } },
        { id: 'n4', kind: 'internet', x: 840, y: 116, label: 'Internet', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'firewall', x: 580, y: 276, label: 'OT firewall', sublabel: 'deny by default', color: null, addr: '', rail: '', notes: 'Only the jump host and the historian replica cross it.', status: 'production', flags: ['safety'], fields: { ip: '10.3.0.1' } },
        { id: 'n6', kind: 'server', x: 320, y: 276, label: 'Jump host', sublabel: 'MFA + session recording', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.3.0.10' } },
        { id: 'n7', kind: 'database', x: 840, y: 276, label: 'Historian mirror', sublabel: 'read-only replica', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.3.0.20' } },
        { id: 'n8', kind: 'switch', x: 580, y: 436, label: 'Cell switch', sublabel: 'managed, VLAN 110', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.10.0.2' } },
        { id: 'n9', kind: 'server', x: 840, y: 436, label: 'Historian', sublabel: '', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.10.0.5' } },
        { id: 'n10', kind: 'hostpc', x: 320, y: 436, label: 'HMI', sublabel: 'panel PC', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [], fields: { ip: '10.10.0.30' } },
        { id: 'n11', kind: 'sbc', x: 580, y: 596, label: 'PLC', sublabel: 'S7-1500', color: null, addr: '', rail: '24 V', notes: '', status: 'production', flags: ['safety'] },
        { id: 'n12', kind: 'sensor', x: 320, y: 596, label: 'Safety light curtain', sublabel: 'OSSD', color: null, addr: '', rail: '24 V', notes: '', status: 'production', flags: ['safety'] },
        { id: 'n13', kind: 'relay', x: 840, y: 596, label: 'Motor contactor', sublabel: 'STO chain', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n14', kind: 'motor', x: 1100, y: 596, label: 'Conveyor motor', sublabel: '400 V 3~', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n15', kind: 'jack', x: 60, y: 596, label: '24 V PSU', sublabel: 'DIN rail', color: null, addr: '', rail: '24 V', notes: '', status: 'production', flags: [] },
        { id: 't1', kind: 'threatactor', x: 1420, y: 116, label: 'Ransomware crew', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { type: 'crime-syndicate', sophistication: 'advanced', motivation: 'organizational-gain', severity: 'critical' }, disposition: 'adversary' },
        { id: 't2', kind: 'phishing', x: 1420, y: 276, label: 'Invoice lure', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { campaign: 'Q3 invoice lure', email: 'billing@vendor-example.net', severity: 'high' }, disposition: 'adversary' },
        { id: 't3', kind: 'credential', x: 1420, y: 436, label: 'Reused vendor VPN login', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { type: 'password', severity: 'high' }, disposition: 'adversary' },
        { id: 't4', kind: 'misconfig', x: 1420, y: 596, label: 'Flat VLAN to L3', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { control: 'VLAN segmentation', affected: 'cell switch', severity: 'medium' }, disposition: 'suspicious' },
      ],
      wires: [
        { id: 'w1', bus: 'eth', from: { node: 'n1', port: 'eth' }, to: { node: 'n2', port: 'net' }, label: 'ERP client', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'eth', from: { node: 'n2', port: 'net' }, to: { node: 'n3', port: 'w' }, label: 'LAN', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'eth', from: { node: 'n3', port: 'e' }, to: { node: 'n4', port: 'w' }, label: 'WAN', arrow: 'both', style: null, flow: null },
        { id: 'w4', bus: 'eth', from: { node: 'n3', port: 's' }, to: { node: 'n5', port: 'n' }, label: 'IDMZ conduit', arrow: 'both', style: null, flow: null },
        { id: 'w5', bus: 'eth', from: { node: 'n5', port: 'w' }, to: { node: 'n6', port: 'net' }, label: 'admin access', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'eth', from: { node: 'n9', port: 'net' }, to: { node: 'n7', port: 'net' }, label: 'one-way replication', arrow: 'fwd', style: null, flow: null },
        { id: 'w7', bus: 'eth', from: { node: 'n5', port: 's' }, to: { node: 'n8', port: 'n' }, label: 'L3 conduit', arrow: 'both', style: null, flow: null },
        { id: 'w8', bus: 'eth', from: { node: 'n8', port: 'w' }, to: { node: 'n10', port: 'eth' }, label: 'HMI', arrow: null, style: null, flow: null },
        { id: 'w9', bus: 'eth', from: { node: 'n8', port: 'e' }, to: { node: 'n9', port: 'net' }, label: 'historian', arrow: null, style: null, flow: null },
        { id: 'w10', bus: 'eth', from: { node: 'n8', port: 's' }, to: { node: 'n11', port: 'eth' }, label: 'PROFINET', arrow: 'both', style: null, flow: null },
        { id: 'w11', bus: 'gpio', from: { node: 'n12', port: 'int' }, to: { node: 'n11', port: 'gpio1' }, label: 'OSSD', arrow: 'fwd', style: null, flow: null },
        { id: 'w12', bus: 'gpio', from: { node: 'n11', port: 'gpio2' }, to: { node: 'n13', port: 'in' }, label: 'STO', arrow: 'fwd', style: null, flow: null },
        { id: 'w13', bus: 'power', from: { node: 'n13', port: 'vcc' }, to: { node: 'n14', port: 'vcc' }, label: 'switched 400 V', arrow: null, style: null, flow: null },
        { id: 'w14', bus: 'eth', from: { node: 'n6', port: 'net' }, to: { node: 'n10', port: 'eth' }, label: 'RDP via jump host', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w15', bus: 'link', from: { node: 't2', port: 'w' }, to: { node: 'n1', port: 'eth' }, label: 'lure mail', arrow: 'fwd', style: null, flow: null },
        { id: 'w16', bus: 'link', from: { node: 't3', port: 'w' }, to: { node: 'n6', port: 'net' }, label: 'VPN login', arrow: 'fwd', style: null, flow: null },
        { id: 'w17', bus: 'link', from: { node: 't1', port: 's' }, to: { node: 't2', port: 'n' }, label: 'runs', arrow: 'fwd', style: null, flow: null },
        { id: 'w18', bus: 'link', from: { node: 't1', port: 's' }, to: { node: 't3', port: 'n' }, label: 'buys', arrow: 'fwd', style: null, flow: null },
        { id: 'w19', bus: 'link', from: { node: 't4', port: 'w' }, to: { node: 'n8', port: 'e' }, label: 'no ACL between VLANs', arrow: 'fwd', style: 'dashed', flow: null },
        { id: 'w20', bus: 'power', from: { node: 'n15', port: 'out' }, to: { node: 'n11', port: 'vcc' }, label: '24 V', arrow: null, style: null, flow: null },
        { id: 'w21', bus: 'gnd', from: { node: 'n15', port: 'gnd' }, to: { node: 'n11', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w22', bus: 'power', from: { node: 'n15', port: 'out' }, to: { node: 'n12', port: 'vcc' }, label: '24 V', arrow: null, style: null, flow: null },
        { id: 'w23', bus: 'gnd', from: { node: 'n15', port: 'gnd' }, to: { node: 'n12', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w24', bus: 'gnd', from: { node: 'n15', port: 'gnd' }, to: { node: 'n13', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w25', bus: 'gnd', from: { node: 'n15', port: 'gnd' }, to: { node: 'n14', port: 'gnd' }, label: 'PE', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 30, y: 60, w: 1340, h: 666, label: 'Plant network by Purdue level', color: '#38bdf8', kind: 'swimlane', orient: 'h', lanes: ['Enterprise (L4-5)', 'DMZ (L3.5)', 'Site operations (L3)', 'Control (L0-2)'] },
      ],
      notes: [
        { id: 'x1', x: 1420, y: 740, text: 'Every crossing between levels passes a firewall. The jump host is the only path from the enterprise side into L3, and the ERP reads the historian mirror, never the historian.' },
      ],
      journey: [
        { id: 'j1', label: 'Four levels', view: { cx: 700, cy: 400, zoom: 0.75 }, caption: 'Enterprise, DMZ, site operations, and control each get a lane; nothing crosses a lane without a firewall.' },
        { id: 'j2', label: 'The DMZ', view: { cx: 700, cy: 320, zoom: 1.05 }, caption: 'The OT firewall admits the jump host and a one-way historian replica, nothing else.' },
        { id: 'j3', label: 'The cell', view: { cx: 700, cy: 620, zoom: 1.0 }, caption: 'The PLC talks PROFINET to the cell switch, reads the light curtain, and holds the contactor through the safe-torque-off chain.' },
        { id: 'j4', label: 'Threats', view: { cx: 1500, cy: 400, zoom: 1.0 }, caption: 'A ransomware crew phishes the engineering workstation and reuses a vendor VPN password; a flat VLAN would carry them straight to the PLC.' },
      ],
    },
  },
  {
    id: 'secure-boot',
    name: 'Secure Boot Chain (flow + hardware)',
    group: 'Security',
    doc: {
      schema: 2,
      title: 'Secure Boot Chain',
      nodes: [
        { id: 'f1', kind: 'startend', x: 90, y: 60, label: 'Power on', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f2', kind: 'process', x: 90, y: 170, label: 'ROM verifies bootloader', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f3', kind: 'decision', x: 90, y: 290, label: 'Signature OK?', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f4', kind: 'process', x: 90, y: 420, label: 'Bootloader verifies app', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f5', kind: 'decision', x: 90, y: 540, label: 'App OK?', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f6', kind: 'predefined', x: 90, y: 660, label: 'Run application', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f7', kind: 'process', x: 440, y: 290, label: 'Halt, blink fault', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'f8', kind: 'process', x: 440, y: 540, label: 'Boot the other slot', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n1', kind: 'mcu', x: 830, y: 60, label: 'Application MCU', sublabel: 'STM32H573', color: null, addr: '', rail: '3.3 V', notes: 'Immutable ROM boot, RDP level 2, TrustZone. The public key hash lives in OTP.', status: 'production', flags: ['safety'] },
        { id: 'n2', kind: 'ic', x: 1100, y: 60, label: 'Secure element', sublabel: 'ATECC608B', color: null, addr: '0x35', rail: '', notes: 'Device key, attestation, and the anti-rollback counter.', status: 'production', flags: [] },
        { id: 'n3', kind: 'ic', x: 830, y: 230, label: 'QSPI flash', sublabel: 'W25Q128', color: null, addr: 'slots A / B', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n4', kind: 'debug', x: 1100, y: 230, label: 'SWD header', sublabel: 'locked', color: null, addr: '', rail: '', notes: 'Disabled by RDP level 2 before the unit ships.', status: 'production', flags: [] },
        { id: 'n7', kind: 'regulator', x: 830, y: 390, label: 'LDO', sublabel: '3.3 V', color: null, addr: '', rail: '3.3 V', notes: '', status: 'production', flags: [] },
        { id: 'n8', kind: 'jack', x: 1100, y: 390, label: 'DC in', sublabel: '5 V', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n5', kind: 'server', x: 830, y: 580, label: 'Signing HSM', sublabel: 'offline', color: null, addr: '', rail: '', notes: 'Holds the release private key; signs images and per-device certificates.', status: 'production', flags: [] },
        { id: 'n6', kind: 'hostpc', x: 1100, y: 580, label: 'Provisioning PC', sublabel: 'DFU station', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 't1', kind: 'physical', x: 1420, y: 230, label: 'Debug port probing', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { access: 'debug port', severity: 'medium' }, disposition: 'adversary' },
        { id: 't2', kind: 'supplychain', x: 1420, y: 580, label: 'Tampered flash image', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { vector: 'firmware image', affected: 'QSPI flash', severity: 'high' }, disposition: 'adversary' },
        { id: 't3', kind: 'vulnerability', x: 1420, y: 60, label: 'Rollback to an old bootloader', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], fields: { cve: 'CWE-1328', affected: 'bootloader', severity: 'medium' }, disposition: 'suspicious' },
      ],
      wires: [
        { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'io1' }, label: 'attest + keys', arrow: 'both', style: null, flow: null },
        { id: 'w2', bus: 'spi', from: { node: 'n1', port: 'spi' }, to: { node: 'n3', port: 'io1' }, label: 'QSPI image', arrow: 'both', style: null, flow: null },
        { id: 'w3', bus: 'gpio', from: { node: 'n1', port: 'gpio1' }, to: { node: 'n4', port: 'swd' }, label: 'SWD (locked)', arrow: null, style: 'dashed', flow: null },
        { id: 'w4', bus: 'usb', from: { node: 'n6', port: 'usb' }, to: { node: 'n1', port: 'usb' }, label: 'DFU', arrow: 'fwd', style: null, flow: null },
        { id: 'w5', bus: 'eth', from: { node: 'n5', port: 'net' }, to: { node: 'n6', port: 'eth' }, label: 'signed image + cert', arrow: 'fwd', style: null, flow: null },
        { id: 'w6', bus: 'flow', from: { node: 'f1', port: 's' }, to: { node: 'f2', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w7', bus: 'flow', from: { node: 'f2', port: 's' }, to: { node: 'f3', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w8', bus: 'flow', from: { node: 'f3', port: 's' }, to: { node: 'f4', port: 'n' }, label: 'yes', arrow: 'fwd', style: null, flow: null },
        { id: 'w9', bus: 'flow', from: { node: 'f3', port: 'e' }, to: { node: 'f7', port: 'w' }, label: 'no', arrow: 'fwd', style: null, flow: null },
        { id: 'w10', bus: 'flow', from: { node: 'f4', port: 's' }, to: { node: 'f5', port: 'n' }, label: '', arrow: 'fwd', style: null, flow: null },
        { id: 'w11', bus: 'flow', from: { node: 'f5', port: 's' }, to: { node: 'f6', port: 'n' }, label: 'yes', arrow: 'fwd', style: null, flow: null },
        { id: 'w12', bus: 'flow', from: { node: 'f5', port: 'e' }, to: { node: 'f8', port: 'w' }, label: 'no', arrow: 'fwd', style: null, flow: null },
        { id: 'w13', bus: 'flow', from: { node: 'f8', port: 'n' }, to: { node: 'f4', port: 'e' }, label: 'retry', arrow: 'fwd', style: null, flow: null },
        { id: 'w14', bus: 'link', from: { node: 't1', port: 'w' }, to: { node: 'n4', port: 'swd' }, label: 'probe', arrow: 'fwd', style: null, flow: null },
        { id: 'w15', bus: 'link', from: { node: 't2', port: 'w' }, to: { node: 'n6', port: 'eth' }, label: 'swapped on the station', arrow: 'fwd', style: null, flow: null },
        { id: 'w16', bus: 'link', from: { node: 't3', port: 'w' }, to: { node: 'n2', port: 'io2' }, label: 'counter blocks it', arrow: 'fwd', style: null, flow: null },
        { id: 'w17', bus: 'power', from: { node: 'n8', port: 'out' }, to: { node: 'n7', port: 'in' }, label: '5 V', arrow: null, style: null, flow: null },
        { id: 'w18', bus: 'gnd', from: { node: 'n8', port: 'gnd' }, to: { node: 'n7', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w19', bus: 'power', from: { node: 'n7', port: 'out' }, to: { node: 'n1', port: 'vcc' }, label: '3.3 V', arrow: null, style: null, flow: null },
        { id: 'w20', bus: 'gnd', from: { node: 'n7', port: 'gnd' }, to: { node: 'n1', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w21', bus: 'power', from: { node: 'n7', port: 'out' }, to: { node: 'n2', port: 'vcc' }, label: '3.3 V', arrow: null, style: null, flow: null },
        { id: 'w22', bus: 'gnd', from: { node: 'n7', port: 'gnd' }, to: { node: 'n2', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w23', bus: 'power', from: { node: 'n7', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '3.3 V', arrow: null, style: null, flow: null },
        { id: 'w24', bus: 'gnd', from: { node: 'n7', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
      ],
      zones: [
        { id: 'z1', x: 30, y: 30, w: 720, h: 710, label: 'Boot sequence', color: '#34d399' },
        { id: 'z2', x: 800, y: 30, w: 560, h: 480, label: 'Device', color: '#60a5fa' },
        { id: 'z3', x: 800, y: 540, w: 560, h: 230, label: 'Factory provisioning', color: '#a78bfa' },
      ],
      notes: [
        { id: 'x1', x: 90, y: 770, text: 'Each stage checks the next before jumping to it: ROM, bootloader, application. A bad signature never runs; a bad slot falls back to the other one.' },
      ],
      journey: [
        { id: 'j1', label: 'Chain of trust', view: { cx: 390, cy: 400, zoom: 0.85 }, caption: 'ROM verifies the bootloader, the bootloader verifies the application; either check failing stops the chain.' },
        { id: 'j2', label: 'Roots', view: { cx: 1080, cy: 270, zoom: 1.0 }, caption: 'The ROM trusts an OTP hash, the secure element holds the device key and the anti-rollback counter, the flash carries two image slots.' },
        { id: 'j3', label: 'Provisioning', view: { cx: 1080, cy: 650, zoom: 1.05 }, caption: 'An offline HSM signs every image and each device certificate; the DFU station only relays them.' },
        { id: 'j4', label: 'Threats', view: { cx: 1500, cy: 320, zoom: 1.0 }, caption: 'A probed debug port meets RDP level 2, a tampered image fails the signature, a rollback meets the counter.' },
        { id: 'j5', label: 'Rejected bootloader', view: { cx: 390, cy: 400, zoom: 0.85 }, caption: 'A failed bootloader signature follows the explicit halt branch.' },
        { id: 'j6', label: 'Recovery slot', view: { cx: 390, cy: 400, zoom: 0.85 }, caption: 'A failed application check selects the other slot and returns to verification.' },
      ],
    },
  },
];

attachExampleStories(EXAMPLES);

// The example as the interface language shows it. English (or any language
// without an overlay) is the example itself; Chinese is a deep copy with the
// overlay's text applied — including wire labels, of which the overlay
// translates the word-like ones and leaves bus codes alone. Part numbers,
// fields, ids and geometry are never touched, so the copy round-trips like
// the original.
export function localizedExample(example, lang = 'en') {
  const overlay = lang === 'zh' ? EXAMPLE_OVERLAYS_ZH[example.id] : undefined;
  if (!overlay) return example;
  const doc = structuredClone(example.doc);
  if (overlay.title !== undefined) doc.title = overlay.title;
  for (const n of doc.nodes) {
    const o = overlay.nodes?.[n.id];
    if (!o) continue;
    if (o.label !== undefined) n.label = o.label;
    if (o.notes !== undefined) n.notes = o.notes;
  }
  for (const z of doc.zones) {
    const o = overlay.zones?.[z.id];
    if (!o) continue;
    if (o.label !== undefined) z.label = o.label;
    if (o.lanes !== undefined) z.lanes = [...o.lanes];
  }
  for (const w of doc.wires) {
    const label = overlay.wires?.[w.id];
    if (label !== undefined) w.label = label;
  }
  for (const t of doc.notes) {
    const text = overlay.notes?.[t.id];
    if (text !== undefined) t.text = text;
  }
  for (const j of doc.journey) {
    const o = overlay.journey?.[j.id];
    if (!o) continue;
    if (o.label !== undefined) j.label = o.label;
    if (o.caption !== undefined) j.caption = o.caption;
  }
  localizeExampleStories(example.id, doc);
  return { ...example, name: overlay.name ?? example.name, doc };
}
