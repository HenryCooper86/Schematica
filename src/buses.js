// Bus types: the label chip on a wire shows `short`; `flows` says whether the
// traffic animation applies (ground carries no signal). Every bus draws with
// the same net_draw slate stroke — the chip is what tells them apart.
export const BUSES = {
  power: { name: 'Power', short: 'PWR', flows: true },
  gnd:   { name: 'Ground', short: 'GND', flows: false },
  i2c:   { name: 'I2C', short: 'I2C', flows: true },
  spi:   { name: 'SPI', short: 'SPI', flows: true },
  uart:  { name: 'UART', short: 'UART', flows: true },
  can:   { name: 'CAN', short: 'CAN', flows: true },
  usb:   { name: 'USB', short: 'USB', flows: true },
  eth:   { name: 'Ethernet', short: 'ETH', flows: true },
  gpio:  { name: 'GPIO', short: 'GPIO', flows: true },
  pwm:   { name: 'PWM', short: 'PWM', flows: true },
  adc:   { name: 'ADC / analog', short: 'ADC', flows: true },
  rf:    { name: 'RF', short: 'RF', flows: true },
  // Camera links, vehicle networks, and serial servo buses.
  mipi:  { name: 'MIPI CSI-2', short: 'CSI', flows: true },
  gmsl:  { name: 'GMSL / FPD-Link', short: 'GMSL', flows: true },
  canfd: { name: 'CAN FD', short: 'CAN FD', flows: true },
  t1:    { name: 'Automotive Ethernet (T1)', short: 'T1', flows: true },
  rs485: { name: 'RS-485 / serial servo', short: 'RS485', flows: true },
};

export const BUS_ORDER = [
  'power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'canfd', 'usb', 'eth', 't1', 'gpio', 'pwm', 'adc', 'rf',
  'mipi', 'gmsl', 'rs485',
];

export const DEFAULT_BUS = 'gpio';
