export const CATEGORIES = [
  { id: 'compute', name: 'Compute' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'actuators', name: 'Actuators' },
  { id: 'power', name: 'Power' },
  { id: 'connectivity', name: 'Connectivity' },
  { id: 'misc', name: 'Storage / Misc' },
];

const p = (id, name, side, offset, bus) => ({ id, name, side, offset, bus });
const pwr = (side = 'left') => [p('vcc', 'VCC', side, 0.3, 'power'), p('gnd', 'GND', side, 0.7, 'gnd')];
const part = (kind, category, name, w, h, ports) => ({ kind, category, name, w, h, ports });

export const PARTS = {
  // Compute
  mcu: part('mcu', 'compute', 'MCU', 160, 100, [
    ...pwr(),
    p('i2c', 'I2C', 'right', 0.2, 'i2c'), p('spi', 'SPI', 'right', 0.4, 'spi'),
    p('uart', 'UART', 'right', 0.6, 'uart'), p('usb', 'USB', 'right', 0.8, 'usb'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('pwm', 'PWM', 'bottom', 0.6, 'pwm'), p('adc', 'ADC', 'bottom', 0.8, 'adc'),
    p('can', 'CAN', 'top', 0.5, 'can'),
  ]),
  sbc: part('sbc', 'compute', 'SoC / SBC', 180, 110, [
    ...pwr(),
    p('eth', 'ETH', 'right', 0.25, 'eth'), p('usb', 'USB', 'right', 0.5, 'usb'),
    p('uart', 'UART', 'right', 0.75, 'uart'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('i2c', 'I2C', 'bottom', 0.6, 'i2c'), p('spi', 'SPI', 'bottom', 0.8, 'spi'),
  ]),
  fpga: part('fpga', 'compute', 'FPGA', 160, 110, [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.25, 'spi'), p('uart', 'UART', 'right', 0.5, 'uart'),
    p('gpio1', 'IO', 'right', 0.75, 'gpio'),
    p('gpio2', 'IO', 'bottom', 0.33, 'gpio'), p('gpio3', 'IO', 'bottom', 0.66, 'gpio'),
  ]),
  dsp: part('dsp', 'compute', 'DSP', 150, 90, [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.33, 'spi'), p('i2c', 'I2C', 'right', 0.66, 'i2c'),
    p('adc1', 'ADC', 'bottom', 0.33, 'adc'), p('adc2', 'ADC', 'bottom', 0.66, 'adc'),
  ]),
  // Sensors
  temp: part('temp', 'sensors', 'Temp sensor', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  imu: part('imu', 'sensors', 'IMU', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('spi', 'SPI', 'right', 0.7, 'spi')]),
  gps: part('gps', 'sensors', 'GPS', 130, 70, [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  camera: part('camera', 'sensors', 'Camera', 140, 80, [...pwr(), p('i2c', 'CTRL', 'right', 0.3, 'i2c'), p('spi', 'DATA', 'right', 0.7, 'spi')]),
  adcin: part('adcin', 'sensors', 'Analog input', 130, 70, [...pwr(), p('out', 'OUT', 'right', 0.5, 'adc')]),
  sensor: part('sensor', 'sensors', 'Sensor', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('int', 'INT', 'right', 0.7, 'gpio')]),
  // Actuators (power on top, control on the left)
  motor: part('motor', 'actuators', 'Motor + driver', 150, 80, [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  servo: part('servo', 'actuators', 'Servo', 130, 70, [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  relay: part('relay', 'actuators', 'Relay', 130, 70, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  led: part('led', 'actuators', 'LED', 110, 60, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  display: part('display', 'actuators', 'Display', 150, 80, [...pwr('top'), p('i2c', 'I2C', 'left', 0.35, 'i2c'), p('spi', 'SPI', 'left', 0.7, 'spi')]),
  buzzer: part('buzzer', 'actuators', 'Buzzer', 110, 60, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'pwm')]),
  // Power (outputs on the right)
  battery: part('battery', 'power', 'Battery', 130, 70, [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  regulator: part('regulator', 'power', 'Regulator', 140, 70, [p('in', 'IN', 'left', 0.5, 'power'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  charger: part('charger', 'power', 'Charger', 140, 70, [p('in', 'USB IN', 'left', 0.5, 'usb'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd'), p('bat', 'BAT', 'bottom', 0.5, 'power')]),
  solar: part('solar', 'power', 'Solar panel', 130, 70, [p('out', 'OUT', 'right', 0.5, 'power')]),
  jack: part('jack', 'power', 'Power jack', 120, 60, [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  // Connectivity
  wifi: part('wifi', 'connectivity', 'WiFi / BLE', 140, 75, [...pwr(), p('uart', 'UART', 'right', 0.3, 'uart'), p('spi', 'SPI', 'right', 0.6, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  lora: part('lora', 'connectivity', 'LoRa', 140, 75, [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  cellular: part('cellular', 'connectivity', 'Cellular', 140, 75, [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  ethphy: part('ethphy', 'connectivity', 'Ethernet PHY', 140, 75, [...pwr(), p('eth', 'ETH', 'right', 0.5, 'eth'), p('mii', 'MII', 'bottom', 0.5, 'gpio')]),
  usbport: part('usbport', 'connectivity', 'USB port', 110, 60, [p('usb', 'USB', 'right', 0.5, 'usb')]),
  cantrx: part('cantrx', 'connectivity', 'CAN transceiver', 140, 70, [...pwr('top'), p('mcu', 'TX/RX', 'left', 0.5, 'can'), p('bus', 'BUS', 'right', 0.5, 'can')]),
  antenna: part('antenna', 'connectivity', 'RF antenna', 100, 60, [p('feed', 'FEED', 'bottom', 0.5, 'rf')]),
  // Storage / Misc
  eeprom: part('eeprom', 'misc', 'EEPROM / Flash', 140, 70, [...pwr(), p('spi', 'SPI', 'right', 0.35, 'spi'), p('i2c', 'I2C', 'right', 0.7, 'i2c')]),
  sdcard: part('sdcard', 'misc', 'SD card', 130, 70, [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi')]),
  rtc: part('rtc', 'misc', 'RTC', 120, 65, [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  crystal: part('crystal', 'misc', 'Crystal', 100, 50, [p('osc', 'OSC', 'right', 0.5, 'gpio')]),
  debug: part('debug', 'misc', 'Debug header', 130, 60, [p('swd', 'SWD', 'right', 0.35, 'gpio'), p('uart', 'UART', 'right', 0.7, 'uart')]),
  ic: part('ic', 'misc', 'Generic IC', 130, 80, [...pwr(), p('io1', 'IO', 'right', 0.35, 'gpio'), p('io2', 'IO', 'right', 0.7, 'gpio')]),
  generic: part('generic', 'misc', 'Custom box', 140, 80, [
    p('top', 'P1', 'top', 0.5, 'gpio'), p('right', 'P2', 'right', 0.5, 'gpio'),
    p('bottom', 'P3', 'bottom', 0.5, 'gpio'), p('left', 'P4', 'left', 0.5, 'gpio'),
  ]),
};

export function getPart(kind) {
  return PARTS[kind] ?? PARTS.generic;
}
