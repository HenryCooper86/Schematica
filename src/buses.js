export const BUSES = {
  power: { name: 'Power', short: 'PWR', color: '#f87171', width: 3.5, dash: null },
  gnd:   { name: 'Ground', short: 'GND', color: '#cbd5e1', width: 3.5, dash: '8 4' },
  i2c:   { name: 'I2C', short: 'I2C', color: '#38bdf8', width: 2, dash: null },
  spi:   { name: 'SPI', short: 'SPI', color: '#a78bfa', width: 2, dash: null },
  uart:  { name: 'UART', short: 'UART', color: '#4ade80', width: 2, dash: null },
  can:   { name: 'CAN', short: 'CAN', color: '#facc15', width: 2, dash: null },
  usb:   { name: 'USB', short: 'USB', color: '#f472b6', width: 2, dash: null },
  eth:   { name: 'Ethernet', short: 'ETH', color: '#2dd4bf', width: 2, dash: null },
  gpio:  { name: 'GPIO', short: 'GPIO', color: '#7d8ba1', width: 1.5, dash: null },
  pwm:   { name: 'PWM', short: 'PWM', color: '#fb923c', width: 2, dash: '6 4' },
  adc:   { name: 'ADC / analog', short: 'ADC', color: '#e879f9', width: 2, dash: '4 3' },
  rf:    { name: 'RF', short: 'RF', color: '#818cf8', width: 2, dash: '1.5 5' },
};

export const BUS_ORDER = ['power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'usb', 'eth', 'gpio', 'pwm', 'adc', 'rf'];

export const DEFAULT_BUS = 'gpio';
