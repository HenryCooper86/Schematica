export const BUSES = {
  power: { name: 'Power', short: 'PWR', color: '#dc2626', width: 4, dash: null },
  gnd:   { name: 'Ground', short: 'GND', color: '#111827', width: 4, dash: '8 4' },
  i2c:   { name: 'I2C', short: 'I2C', color: '#0284c7', width: 2, dash: null },
  spi:   { name: 'SPI', short: 'SPI', color: '#7c3aed', width: 2, dash: null },
  uart:  { name: 'UART', short: 'UART', color: '#16a34a', width: 2, dash: null },
  can:   { name: 'CAN', short: 'CAN', color: '#ca8a04', width: 2, dash: null },
  usb:   { name: 'USB', short: 'USB', color: '#db2777', width: 2, dash: null },
  eth:   { name: 'Ethernet', short: 'ETH', color: '#0f766e', width: 2, dash: null },
  gpio:  { name: 'GPIO', short: 'GPIO', color: '#64748b', width: 1.5, dash: null },
  pwm:   { name: 'PWM', short: 'PWM', color: '#f97316', width: 2, dash: '6 4' },
  adc:   { name: 'ADC / analog', short: 'ADC', color: '#92400e', width: 2, dash: '4 3' },
  rf:    { name: 'RF', short: 'RF', color: '#6366f1', width: 2, dash: '1.5 5' },
};

export const BUS_ORDER = ['power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'usb', 'eth', 'gpio', 'pwm', 'adc', 'rf'];

export const DEFAULT_BUS = 'gpio';
