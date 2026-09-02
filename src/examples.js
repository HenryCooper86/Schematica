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
        { id: 'n1', kind: 'solar', x: 64, y: 144, w: 130, h: 70, label: 'Solar panel', sublabel: '6V 2W', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'charger', x: 64, y: 280, w: 140, h: 70, label: 'Charger', sublabel: 'TP4056', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'battery', x: 64, y: 416, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 3.7V', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'regulator', x: 288, y: 280, w: 140, h: 70, label: 'Regulator', sublabel: '3.3V LDO', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'mcu', x: 504, y: 256, w: 160, h: 100, label: 'MCU', sublabel: 'ESP32-S3', color: null, addr: '', rail: '3.3V', notes: 'Deep sleep between readings; wake every 10 min.', status: 'production', flags: [] },
        { id: 'n6', kind: 'temp', x: 784, y: 152, w: 130, h: 70, label: 'Temp sensor', sublabel: 'BME280', color: null, addr: '0x76', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n7', kind: 'adcin', x: 784, y: 288, w: 130, h: 70, label: 'Soil probe', sublabel: 'capacitive', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'wifi', x: 784, y: 424, w: 140, h: 75, label: 'WiFi / BLE', sublabel: 'uplink', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
        { id: 'z2', x: 760, y: 120, w: 190, h: 264, label: 'Sensor pod', color: '#22d3ee' },
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
    doc: {
      schema: 1,
      title: 'Drone Flight Controller',
      nodes: [
        { id: 'n1', kind: 'battery', x: 64, y: 304, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 4S', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 288, y: 304, w: 140, h: 70, label: 'BEC', sublabel: '5V 3A', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'mcu', x: 504, y: 264, w: 160, h: 100, label: 'Flight controller', sublabel: 'STM32F405', color: null, addr: '', rail: '3.3V', notes: 'Loop timing is safety critical - do not block the PID task.', status: 'tested', flags: ['safety'] },
        { id: 'n4', kind: 'imu', x: 784, y: 144, w: 130, h: 70, label: 'IMU', sublabel: 'MPU-6050', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'gps', x: 784, y: 264, w: 130, h: 70, label: 'GPS', sublabel: 'NEO-M8N', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'motor', x: 784, y: 408, w: 150, h: 80, label: 'Motor + driver', sublabel: 'ESC 30A', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'servo', x: 784, y: 528, w: 130, h: 70, label: 'Gimbal servo', sublabel: 'SG90', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      ],
      wires: [
        { id: 'w1', bus: 'power', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w2', bus: 'power', from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'vcc' }, label: '5V', arrow: null, style: null, flow: null },
        { id: 'w3', bus: 'gnd', from: { node: 'n2', port: 'gnd' }, to: { node: 'n3', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w4', bus: 'i2c', from: { node: 'n3', port: 'i2c' }, to: { node: 'n4', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w5', bus: 'uart', from: { node: 'n3', port: 'uart' }, to: { node: 'n5', port: 'uart' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w6', bus: 'pwm', from: { node: 'n3', port: 'pwm' }, to: { node: 'n6', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
        { id: 'w7', bus: 'pwm', from: { node: 'n3', port: 'gpio1' }, to: { node: 'n7', port: 'pwm' }, label: '', arrow: null, style: null, flow: null },
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
    doc: {
      schema: 1,
      title: 'CAN Bus Network',
      nodes: [
        { id: 'n1', kind: 'mcu', x: 88, y: 128, w: 160, h: 100, label: 'Engine ECU', sublabel: 'STM32F1', color: null, addr: 'CAN ID 0x100', rail: '5V', notes: '', status: 'prototype', flags: ['thermal'] },
        { id: 'n2', kind: 'cantrx', x: 392, y: 144, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'mcu', x: 88, y: 352, w: 160, h: 100, label: 'Dash ECU', sublabel: 'STM32F1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'cantrx', x: 392, y: 368, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'mcu', x: 88, y: 576, w: 160, h: 100, label: 'Sensor ECU', sublabel: 'STM32F1', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'cantrx', x: 392, y: 592, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'MCP2551', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
    doc: {
      schema: 1,
      title: 'Smart Greenhouse',
      nodes: [
        { id: 'n1', kind: 'temp', x: 48, y: 120, w: 130, h: 70, label: 'Climate sensor', sublabel: 'BME280', color: null, addr: '0x76', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n2', kind: 'adcin', x: 48, y: 248, w: 130, h: 70, label: 'Soil probe', sublabel: 'capacitive', color: null, addr: '', rail: '', notes: 'Reads noisy near the pump - needs filtering.', status: 'prototype', flags: ['bug'] },
        { id: 'n3', kind: 'battery', x: 48, y: 392, w: 130, h: 70, label: 'Battery', sublabel: 'LiFePO4', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'regulator', x: 248, y: 392, w: 140, h: 70, label: 'Regulator', sublabel: '3.3V buck', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n5', kind: 'mcu', x: 296, y: 160, w: 160, h: 100, label: 'Node MCU', sublabel: 'ESP32-C6', color: null, addr: '', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'lora', x: 536, y: 176, w: 140, h: 75, label: 'LoRa', sublabel: 'SX1262', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'gateway', x: 560, y: 392, w: 150, h: 80, label: 'Edge gateway', sublabel: 'LoRaWAN', color: null, addr: '', rail: '', notes: '', status: 'tested', flags: [] },
        { id: 'n8', kind: 'cloud', x: 800, y: 240, w: 150, h: 80, label: 'Cloud / MQTT', sublabel: 'broker', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'server', x: 1048, y: 144, w: 140, h: 80, label: 'Server', sublabel: 'ingest API', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n10', kind: 'database', x: 1056, y: 296, w: 130, h: 80, label: 'Database', sublabel: 'timeseries', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n11', kind: 'mobile', x: 816, y: 432, w: 120, h: 70, label: 'Mobile app', sublabel: 'grower UI', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
    doc: {
      schema: 1,
      title: 'Robot Arm Controller',
      nodes: [
        { id: 'n1', kind: 'battery', x: 48, y: 140, w: 130, h: 70, label: 'Battery', sublabel: '2S LiPo', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 296, y: 140, w: 140, h: 70, label: 'Regulator', sublabel: '5V 5A', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'hostpc', x: 48, y: 320, w: 140, h: 75, label: 'Host PC', sublabel: 'teach pendant', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'mcu', x: 296, y: 300, w: 160, h: 100, label: 'Motion MCU', sublabel: 'STM32F7', color: null, addr: '', rail: '3.3V', notes: 'Trajectory interpolation at 1 kHz.', status: 'tested', flags: ['safety'] },
        { id: 'n5', kind: 'servo', x: 600, y: 140, w: 130, h: 70, label: 'Base servo', sublabel: 'MG996R', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'servo', x: 600, y: 260, w: 130, h: 70, label: 'Elbow servo', sublabel: 'MG996R', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n7', kind: 'motor', x: 600, y: 380, w: 150, h: 80, label: 'Gripper motor', sublabel: 'N20 + driver', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n8', kind: 'imu', x: 600, y: 520, w: 130, h: 70, label: 'Wrist IMU', sublabel: 'BNO055', color: null, addr: '0x28', rail: '3.3V', notes: '', status: null, flags: [] },
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
    doc: {
      schema: 1,
      title: 'Autonomous Rover',
      nodes: [
        { id: 'n1', kind: 'battery', x: 48, y: 120, w: 130, h: 70, label: 'Battery', sublabel: '2S Li-ion', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'regulator', x: 48, y: 264, w: 140, h: 70, label: 'Regulator', sublabel: '5V buck', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'mcu', x: 288, y: 176, w: 160, h: 100, label: 'Rover MCU', sublabel: 'RP2040', color: null, addr: '', rail: '3.3V', notes: 'Odometry fused with ToF ranging at 50 Hz.', status: 'production', flags: [] },
        { id: 'n4', kind: 'stepper', x: 560, y: 440, w: 150, h: 80, label: 'Drive stepper', sublabel: 'NEMA 17', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n5', kind: 'tof', x: 560, y: 152, w: 130, h: 70, label: 'ToF ranger', sublabel: 'VL53L0X', color: null, addr: '0x29', rail: '3.3V', notes: '', status: 'production', flags: [] },
        { id: 'n6', kind: 'lidar', x: 560, y: 280, w: 140, h: 75, label: 'LiDAR', sublabel: 'RPLIDAR A1', color: null, addr: '', rail: '5V', notes: '', status: 'tested', flags: [] },
        { id: 'n7', kind: 'limitswitch', x: 288, y: 452, w: 120, h: 60, label: 'Bumper', sublabel: 'front', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
    doc: {
      schema: 1,
      title: 'Vehicle CAN Backbone',
      nodes: [
        { id: 'n1', kind: 'vbat', x: 48, y: 120, w: 140, h: 70, label: 'Vehicle battery', sublabel: '12V lead-acid', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n2', kind: 'fusebox', x: 48, y: 264, w: 150, h: 80, label: 'Fuse box', sublabel: 'engine bay', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'wheelspeed', x: 48, y: 432, w: 140, h: 70, label: 'Wheel speed', sublabel: 'front-left', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n4', kind: 'mcu', x: 300, y: 112, w: 160, h: 100, label: 'Body ECU', sublabel: 'STM32F1', color: null, addr: 'CAN ID 0x2A0', rail: '5V', notes: '', status: 'production', flags: [] },
        { id: 'n5', kind: 'hbridge', x: 300, y: 288, w: 140, h: 75, label: 'H-bridge', sublabel: 'BTS7960', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'mcu', x: 300, y: 432, w: 160, h: 100, label: 'Gateway ECU', sublabel: 'STM32F4', color: null, addr: 'CAN ID 0x7DF', rail: '5V', notes: '', status: 'tested', flags: [] },
        { id: 'n7', kind: 'cantrx', x: 560, y: 136, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'TJA1050', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n8', kind: 'cantrx', x: 560, y: 448, w: 140, h: 70, label: 'CAN transceiver', sublabel: 'TJA1050', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n9', kind: 'motor', x: 800, y: 288, w: 150, h: 80, label: 'Wiper motor', sublabel: '12V DC', color: null, addr: '', rail: '', notes: '', status: null, flags: ['power'] },
        { id: 'n10', kind: 'obd', x: 800, y: 448, w: 140, h: 70, label: 'OBD-II port', sublabel: 'under dash', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n11', kind: 'lin', x: 560, y: 576, w: 140, h: 70, label: 'LIN transceiver', sublabel: 'TJA1021', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n12', kind: 'ic', x: 800, y: 576, w: 130, h: 80, label: 'Door module', sublabel: 'window lift', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
    doc: {
      schema: 1,
      title: 'OTA Update Pipeline',
      nodes: [
        { id: 'n1', kind: 'server', x: 100, y: 157, w: 140, h: 80, label: 'Build server', sublabel: 'CI artifacts', color: null, addr: '', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n2', kind: 'database', x: 320, y: 157, w: 130, h: 80, label: 'Release DB', sublabel: 'versions', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
        { id: 'n3', kind: 'cloud', x: 620, y: 157, w: 150, h: 80, label: 'Update broker', sublabel: 'MQTT', color: null, addr: 'mqtts://updates:8883', rail: '', notes: '', status: 'production', flags: [] },
        { id: 'n4', kind: 'gateway', x: 600, y: 307, w: 150, h: 80, label: 'Edge gateway', sublabel: 'site LAN', color: null, addr: '', rail: '', notes: '', status: 'tested', flags: [] },
        { id: 'n5', kind: 'wifi', x: 240, y: 460, w: 140, h: 75, label: 'WiFi radio', sublabel: 'ESP32 NIC', color: null, addr: '', rail: '3.3V', notes: '', status: null, flags: [] },
        { id: 'n6', kind: 'mcu', x: 560, y: 447, w: 160, h: 100, label: 'Device MCU', sublabel: 'STM32F4', color: null, addr: '', rail: '3.3V', notes: 'Verifies the image signature before flashing.', status: 'production', flags: [] },
        { id: 'n7', kind: 'ic', x: 800, y: 457, w: 130, h: 80, label: 'SPI flash', sublabel: 'W25Q128', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
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
];
