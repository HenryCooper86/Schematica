const common = {
  zones: { z1: { label: '示例接口契约' } },
  journey: {
    j2: { label: '检查声明', caption: '打开工程 → 接口，比较连接限制与两端能力，并阅读示例来源。' },
  },
};
const entries = [
  ['power', '电源声明参考', '示例电源', '示例负载', '电源与地的声明仅覆盖电压和方向。本画板不声明电流容量或安全性；真实电源和负载需要经过核实的来源。', '运行检查，然后将负载电压上限降低到所需范围以下。电压声明冲突将阻止就绪；电流容量不在这些检查范围内。'],
  ['i2c', 'I2C 声明参考', '示例控制器', '示例外设', '每条线表示同一逻辑 I2C 总线上的 SDA/SCL 聚合连接，外设地址互不相同。上拉值、上升时间、布线电容与供电仍需进行硬件设计与验证。', '运行检查，然后将端点速率降低到连接所需速率以下。实际带宽检查将阻止就绪；恢复声明可使其重新就绪。'],
  ['can', 'CAN 声明参考', '示例 CAN 模块 1', '示例 CAN 模块', '每条线表示 CAN H/L 聚合总线的一段逻辑连接。人为设定的电压范围仅用于演示范围检查；终端电阻、物理布线、收发器选择和时序必须单独验证。', '运行检查，然后将端点速率降低到连接所需速率以下。实际带宽检查将阻止就绪；恢复声明可使其重新就绪。'],
];
export default Object.fromEntries(entries.map(([bus, name, first, rest, scope, challenge]) => [`declared-${bus}-reference`, {
  ...common, name, title: name,
  nodes: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`n${i + 1}`, { label: i ? `${rest} ${bus === 'can' ? i + 1 : i}` : first, notes: scope }])),
  notes: { t1: scope },
  journey: { ...common.journey, j1: { label: '阅读假设', caption: scope }, j3: { label: '检查并尝试冲突', caption: challenge } },
}]));
