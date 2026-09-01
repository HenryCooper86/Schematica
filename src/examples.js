// Built-in example boards. Every document must round-trip through
// serialize/deserialize with zero warnings (enforced by tests/examples.test.js),
// so every node kind, port id, bus, and journey step here is guaranteed valid.

export const EXAMPLES = [
  {
    id: 'weather-station',
    name: 'Weather Station',
    doc: {
      schema: 1,
      title: 'Weather Station',
      nodes: [
        { id: 'n1', kind: 'solar', x: 64, y: 144, w: 130, h: 70, label: 'Solar panel', sublabel: '6V 2W', color: null },
        { id: 'n2', kind: 'charger', x: 64, y: 280, w: 140, h: 70, label: 'Charger', sublabel: 'TP4056', color: null },
        { id: 'n3', kind: 'battery', x: 64, y: 416, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 3.7V', color: null },
        { id: 'n4', kind: 'regulator', x: 288, y: 280, w: 140, h: 70, label: 'Regulator', sublabel: '3.3V LDO', color: null },
        { id: 'n5', kind: 'mcu', x: 504, y: 256, w: 160, h: 100, label: 'MCU', sublabel: 'ESP32-S3', color: null },
        { id: 'n6', kind: 'temp', x: 784, y: 152, w: 130, h: 70, label: 'Temp sensor', sublabel: 'BME280', color: null },
        { id: 'n7', kind: 'adcin', x: 784, y: 288, w: 130, h: 70, label: 'Soil probe', sublabel: 'capacitive', color: null },
        { id: 'n8', kind: 'wifi', x: 784, y: 424, w: 140, h: 75, label: 'WiFi / BLE', sublabel: 'uplink', color: null },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '' },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'bat' }, to: { node: 'n3', port: 'out' }, label: '' },
        { id: 'w3', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n4', port: 'in' }, label: '' },
        { id: 'w4', bus: 'power', from: { node: 'n4', port: 'out' }, to: { node: 'n5', port: 'vcc' }, label: '3V3' },
        { id: 'w5', bus: 'gnd', from: { node: 'n4', port: 'gnd' }, to: { node: 'n5', port: 'gnd' }, label: '' },
        { id: 'w6', bus: 'i2c', from: { node: 'n5', port: 'i2c' }, to: { node: 'n6', port: 'i2c' }, label: '' },
        { id: 'w7', bus: 'adc', from: { node: 'n5', port: 'adc' }, to: { node: 'n7', port: 'out' }, label: '' },
        { id: 'w8', bus: 'spi', from: { node: 'n5', port: 'spi' }, to: { node: 'n8', port: 'spi' }, label: '' },
      ],
      zones: [
        { id: 'z1', x: 40, y: 112, w: 408, h: 408, label: 'Power', color: '#f87171' },
        { id: 'z2', x: 760, y: 120, w: 190, h: 264, label: 'Sensor pod', color: '#22d3ee' },
      ],
      notes: [
        { id: 't1', x: 504, y: 120, text: 'All logic runs on the 3.3V rail' },
      ],
      journey: [
        {
          id: 'j1', label: 'Power path', view: { x: 30, y: 10, zoom: 1 },
          caption: 'Sunlight charges the LiPo through the TP4056; the LDO feeds a clean 3.3V rail.',
        },
        {
          id: 'j2', label: 'The brain', view: { x: -240, y: -60, zoom: 1.2 },
          caption: 'An ESP32-S3 polls the sensors and pushes readings upstream over WiFi.',
        },
        {
          id: 'j3', label: 'Sensors', view: { x: -460, y: -40, zoom: 1.15 },
          caption: 'The BME280 shares the I2C bus; the soil probe feeds the ADC directly.',
        },
      ],
    },
  },
  {
    id: 'drone-fc',
    name: 'Drone Flight Controller',
    doc: {
      schema: 1,
      title: 'Drone Flight Controller',
      nodes: [
        { id: 'n1', kind: 'battery', x: 64, y: 304, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 4S', color: null },
        { id: 'n2', kind: 'regulator', x: 288, y: 304, w: 140, h: 70, label: 'BEC', sublabel: '5V 3A', color: null },
        { id: 'n3', kind: 'mcu', x: 504, y: 264, w: 160, h: 100, label: 'Flight controller', sublabel: 'STM32F405', color: null },
        { id: 'n4', kind: 'imu', x: 784, y: 144, w: 130, h: 70, label: 'IMU', sublabel: 'MPU-6050', color: null },
        { id: 'n5', kind: 'gps', x: 784, y: 264, w: 130, h: 70, label: 'GPS', sublabel: 'NEO-M8N', color: null },
        { id: 'n6', kind: 'motor', x: 784, y: 408, w: 150, h: 80, label: 'Motor + driver', sublabel: 'ESC 30A', color: null },
        { id: 'n7', kind: 'servo', x: 784, y: 528, w: 130, h: 70, label: 'Gimbal servo', sublabel: 'SG90', color: null },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '' },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '5V' },
        { id: 'w3', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '' },
        { id: 'w4', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n4', port: 'i2c' }, label: '' },
        { id: 'w5', bus: 'uart', from: { node: 'n3', port: 'uart' }, to: { node: 'n5', port: 'uart' }, label: '' },
        { id: 'w6', bus: 'pwm', from: { node: 'n3', port: 'pwm' }, to: { node: 'n6', port: 'pwm' }, label: '' },
        { id: 'w7', bus: 'pwm', from: { node: 'n3', port: 'gpio1' }, to: { node: 'n7', port: 'pwm' }, label: '' },
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
          id: 'j1', label: 'Power', view: { x: 30, y: -40, zoom: 1 },
          caption: 'The 4S pack feeds a 5V BEC that powers the flight controller.',
        },
        {
          id: 'j2', label: 'Sense', view: { x: -420, y: 40, zoom: 1.1 },
          caption: 'The IMU streams attitude over I2C while the GPS reports position over UART.',
        },
        {
          id: 'j3', label: 'Act', view: { x: -420, y: -180, zoom: 1.1 },
          caption: 'PWM outputs drive the ESC and the gimbal servo.',
        },
      ],
    },
  },
  {
    id: 'can-network',
    name: 'CAN Bus Network',
    doc: {
      schema: 1,
      title: 'CAN Bus Network',
      nodes: [
        { id: 'n1', kind: 'mcu', x: 88, y: 128, w: 160, h: 100, label: 'Engine ECU', sublabel: 'STM32F1', color: null },
        { id: 'n2', kind: 'cantrx', x: 392, y: 144, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null },
        { id: 'n3', kind: 'mcu', x: 88, y: 352, w: 160, h: 100, label: 'Dash ECU', sublabel: 'STM32F1', color: null },
        { id: 'n4', kind: 'cantrx', x: 392, y: 368, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null },
        { id: 'n5', kind: 'mcu', x: 88, y: 576, w: 160, h: 100, label: 'Sensor ECU', sublabel: 'STM32F1', color: null },
        { id: 'n6', kind: 'cantrx', x: 392, y: 592, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null },
      ],
      wires: [
        { id: 'w1', bus: 'can', from: { node: 'n1', port: 'can' }, to: { node: 'n2', port: 'mcu' }, label: 'TX/RX' },
        { id: 'w2', bus: 'can', from: { node: 'n3', port: 'can' }, to: { node: 'n4', port: 'mcu' }, label: 'TX/RX' },
        { id: 'w3', bus: 'can', from: { node: 'n5', port: 'can' }, to: { node: 'n6', port: 'mcu' }, label: 'TX/RX' },
        { id: 'w4', bus: 'can', from: { node: 'n2', port: 'bus' }, to: { node: 'n4', port: 'bus' }, label: 'CAN H/L' },
        { id: 'w5', bus: 'can', from: { node: 'n4', port: 'bus' }, to: { node: 'n6', port: 'bus' }, label: 'CAN H/L' },
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
          id: 'j1', label: 'A module', view: { x: 40, y: 0, zoom: 1.1 },
          caption: 'Each ECU talks CAN through its own MCP2551 transceiver.',
        },
        {
          id: 'j2', label: 'The bus', view: { x: -60, y: -200, zoom: 0.95 },
          caption: 'Transceivers share one differential pair - the yellow CAN H/L backbone.',
        },
        {
          id: 'j3', label: 'The network', view: { x: 60, y: -100, zoom: 0.8 },
          caption: 'Three modules, one bus: add a node by tapping the pair anywhere.',
        },
      ],
    },
  },
];
