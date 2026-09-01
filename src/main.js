import { createRenderer } from './render.js';

const demoDoc = {
  schema: 1,
  title: 'Demo Board',
  nodes: [
    { id: 'n1', kind: 'mcu', x: 240, y: 160, w: 160, h: 100, label: 'MCU', sublabel: 'STM32F401', color: null },
    { id: 'n2', kind: 'temp', x: 560, y: 120, w: 130, h: 70, label: 'Temp sensor', sublabel: 'BME280', color: null },
    { id: 'n3', kind: 'battery', x: 20, y: 160, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 3.7V', color: null },
  ],
  wires: [
    { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' }, label: '' },
    { id: 'w2', bus: 'power', from: { node: 'n3', port: 'out' }, to: { node: 'n1', port: 'vcc' }, label: '' },
  ],
  zones: [{ id: 'z1', x: 540, y: 90, w: 180, h: 130, label: 'Sensor pod', color: '#4a90d9' }],
  notes: [{ id: 't1', x: 250, y: 40, text: 'Demo board - tools arrive in the next task' }],
};

const svg = document.getElementById('canvas');
const renderer = createRenderer(svg);
renderer.render(demoDoc, { x: 40, y: 40, zoom: 1 }, { selection: new Set(['n1']), grid: true });
