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
};

export const BUS_ORDER = ['power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'usb', 'eth', 'gpio', 'pwm', 'adc', 'rf'];

export const DEFAULT_BUS = 'gpio';
