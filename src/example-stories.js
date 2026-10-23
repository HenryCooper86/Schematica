// Authored presentation order, independent of electrical wire direction.
// Each entry is [part ID, English caption, Chinese caption].
const EXAMPLE_STORIES = {
  'weather-station': {
    j1: [
      ['n1', 'Start with the solar source feeding the charger.', '从为充电器供电的太阳能电池板开始。'],
      ['n2', 'The charger connects the solar input, battery, and regulated supply path.', '充电器连接太阳能输入、电池和稳压供电路径。'],
      ['n4', 'The regulator provides the 3.3 V logic rail.', '稳压器提供 3.3 V 逻辑电源。'],
      ['n5', 'The MCU has separate power and ground connections to the regulator.', '微控制器通过独立的电源线和地线连接稳压器。'],
    ],
    j2: [
      ['n5', 'The controller gathers readings before using the uplink.', '控制器采集读数后使用上行链路。'],
      ['n8', 'This board represents the radio uplink with an SPI connection.', '此板图用 SPI 连接表示无线通信上行链路。'],
    ],
    j3: [
      ['n6', 'Begin at the BME280 temperature sensor.', '从 BME280 温度传感器开始。'],
      ['n5', 'The sensor and MCU share I2C; story order does not assign electrical direction.', '传感器与微控制器共享 I2C；讲解顺序并不指定电气方向。'],
      ['n7', 'The second sensing branch connects the soil probe to the MCU ADC.', '另一条传感分支将土壤探头连接到微控制器的 ADC。'],
    ],
  },
  'log4shell-cve': {
    j1: [
      ['atk', 'An unattributed attacker on the Internet sends an ordinary-looking telemetry upload.', '互联网上一名身份未明的攻击者发送一次看似正常的遥测上传。'],
      ['req', 'The User-Agent header carries a ${jndi:ldap://…} string instead of a browser name.', 'User-Agent 头中携带的是 ${jndi:ldap://…} 字符串，而不是浏览器名称。'],
    ],
    j2: [
      ['api', 'The telemetry API logs the header with Log4j 2.14.1, which expands lookups inside logged messages.', '遥测 API 使用 Log4j 2.14.1 记录该头部，而该版本会展开日志消息中的查找表达式。'],
      ['vuln', 'This is CVE-2021-44228 (CVSS 10.0), affecting Log4j 2.0-beta9 to 2.14.1.', '这就是 CVE-2021-44228（CVSS 10.0），影响 Log4j 2.0-beta9 至 2.14.1。'],
      ['ldap', 'The JNDI lookup makes the server contact the attacker\'s LDAP server.', 'JNDI 查找使服务器连接攻击者的 LDAP 服务器。'],
    ],
    j3: [
      ['cls', 'The LDAP reply names a Java class hosted by the attacker.', 'LDAP 回复指向攻击者托管的一个 Java 类。'],
      ['rce', 'The API loads that class, so the attacker\'s code runs as the service account.', 'API 加载该类，攻击者的代码便以服务账户身份运行。'],
      ['keys', 'From there it can read the fleet API keys held in the environment.', '随后它可以读取环境变量中保存的车队 API 密钥。'],
    ],
    j4: [
      ['vuln', 'Upgrading Log4j to 2.17.1 or later removes the lookup path.', '将 Log4j 升级到 2.17.1 或更高版本即可消除该查找路径。'],
      ['api', 'Blocking outbound LDAP and RMI from servers limits what a host you missed can fetch.', '阻止服务器发起的出站 LDAP 和 RMI 连接，可限制遗漏主机能获取的内容。'],
    ],
  },
  'robot-fleet-incident': {
    j1: [
      ['laptop', '03-11 08:14 UTC · Attacker → Operator laptop · phishing email · ×2 · fake invoice with a credential page', '03-11 08:14 UTC · 攻击者 → 运维笔记本 · 钓鱼邮件 · ×2 · 带凭据页面的伪造发票'],
      ['laptop', '03-11 08:21 UTC · Attacker → Operator laptop · captures credentials · operator username and password captured', '03-11 08:21 UTC · 攻击者 → 运维笔记本 · 窃取凭据 · 运维人员的用户名和密码被截获'],
    ],
    j2: [
      ['vpn', '03-11 09:40 UTC · Attacker → Fleet VPN · VPN login with stolen credentials · session from 203.0.113.7; no second factor', '03-11 09:40 UTC · 攻击者 → 车队 VPN · 使用被盗凭据登录 VPN · 会话来自 203.0.113.7；未启用第二因素'],
      ['fleet', '03-11 09:47 UTC · Attacker → Fleet manager · operator session · 12 robots on the test channel listed', '03-11 09:47 UTC · 攻击者 → 车队管理器 · 运维会话 · 列出测试通道上的 12 台机器人'],
    ],
    j3: [
      ['fleet', '03-11 09:51 UTC · Attacker → Fleet manager · enumerates the API · ×3 · test channel has signature checks off', '03-11 09:51 UTC · 攻击者 → 车队管理器 · 枚举 API · ×3 · 测试通道关闭了签名检查'],
    ],
    j4: [
      ['ota', '03-11 10:05 UTC · Attacker → OTA server · uploads unsigned update · accepted: signature check disabled for the test channel', '03-11 10:05 UTC · 攻击者 → OTA 服务器 · 上传未签名更新 · 已接受：测试通道关闭了签名检查'],
      ['robot', '03-11 10:20 UTC · OTA server → Delivery robot · pushes update · 12 robots updated', '03-11 10:20 UTC · OTA 服务器 → 配送机器人 · 推送更新 · 12 台机器人已更新'],
    ],
    j5: [
      ['store', '03-12 01:30 UTC · Attacker → Telemetry store · exports telemetry · ×3 · route history, 41 MB', '03-12 01:30 UTC · 攻击者 → 遥测存储 · 导出遥测数据 · ×3 · 路线历史，41 MB'],
    ],
  },
  'ev-bms': {
    j1: [
      ['n1', 'Locate the high-voltage battery pack.', '定位高压电池组。'],
      ['n2', 'The pack connection passes through the pyro fuse.', '电池组连接经过烟火式熔断器。'],
      ['n3', 'The main contactor is on the protected high-voltage branch.', '主接触器位于受保护的高压分支。'],
    ],
    j2: [
      ['n7', 'Begin at the second cell monitor in the chain.', '从链路中的第二个电芯监测器开始。'],
      ['n6', 'The two cell monitors have a direct link on this board.', '此板图中的两个电芯监测器直接相连。'],
      ['n9', 'The first monitor connects to the BMS controller over SPI.', '第一个监测器通过 SPI 连接电池管理控制器。'],
      ['n5', 'The current sensor has a separate analog connection to the controller.', '电流传感器通过独立的模拟连接接入控制器。'],
    ],
    j3: [
      ['n13', 'The auxiliary battery powers the low-voltage control electronics.', '辅助电池为低压控制电路供电。'],
      ['n12', 'The converter supplies the controller rail and ground reference.', '转换器提供控制器电源及接地参考。'],
      ['n9', 'The controller supervises the pack and contactors.', '控制器监控电池组和接触器。'],
      ['n4', 'The precharge contactor has an authored GPIO control connection.', '预充接触器具有板图中定义的 GPIO 控制连接。'],
    ],
    j4: [
      ['n9', 'Begin with status and fault reporting at the BMS controller.', '从电池管理控制器的状态和故障报告开始。'],
      ['n10', 'The CAN transceiver bridges the controller to the vehicle bus.', 'CAN 收发器将控制器连接到车辆总线。'],
      ['n11', 'The gateway receives the vehicle-side connection.', '网关接入车辆侧连接。'],
    ],
  },
  'secure-boot': {
    j1: [
      ['f1', 'Power-on begins the authored boot flow.', '上电启动板图中定义的启动流程。'],
      ['f2', 'ROM checks the bootloader before transferring control.', 'ROM 在移交控制权之前检查引导程序。'],
      ['f3', 'The signature decision separates accepted and rejected images.', '签名判定区分已接受和被拒绝的镜像。'],
      ['f4', 'On the yes branch, the bootloader verifies the application.', '在通过分支中，引导程序验证应用程序。'],
      ['f5', 'A second decision checks the application image.', '第二次判定检查应用镜像。'],
      ['f6', 'The accepted application reaches the run step.', '通过验证的应用进入运行步骤。'],
    ],
    j2: [
      ['n2', 'The secure element holds device security material.', '安全元件保存设备安全材料。'],
      ['n1', 'The application MCU connects to the secure element over I2C.', '应用微控制器通过 I2C 连接安全元件。'],
      ['n3', 'External flash is a separate SPI connection.', '外部闪存使用独立的 SPI 连接。'],
    ],
    j3: [
      ['n5', 'The signing HSM is the starting point for provisioning.', '签名 HSM 是配置流程的起点。'],
      ['n6', 'The provisioning station connects to the signing infrastructure.', '配置工作站连接签名基础设施。'],
      ['n1', 'The station reaches the device through its USB connection.', '工作站通过 USB 连接设备。'],
    ],
    j4: [
      ['t1', 'Inspect the debug-port probing threat.', '检查调试端口探测威胁。'],
      ['n4', 'The authored threat relationship points at the SWD header.', '板图中定义的威胁关系指向 SWD 接口。'],
      ['t3', 'Switch to rollback threats; these two stops have no direct wire.', '切换到回滚威胁；这两个停靠点之间没有直接连线。'],
      ['n2', 'The rollback relationship terminates at the secure element.', '回滚关系终止于安全元件。'],
    ],
    j5: [
      ['f2', 'Start with the ROM bootloader verification.', '从 ROM 引导程序验证开始。'],
      ['f3', 'Follow the rejected-signature branch.', '沿签名被拒绝的分支继续。'],
      ['f7', 'The authored no branch halts and indicates a fault.', '板图中定义的失败分支停机并指示故障。'],
    ],
    j6: [
      ['f4', 'Begin with application verification.', '从应用程序验证开始。'],
      ['f5', 'Follow the failed application check.', '沿应用检查失败的分支继续。'],
      ['f8', 'The failure branch selects the other image slot.', '失败分支选择另一个镜像槽位。'],
      ['f4', 'The explicit retry link returns to verification; playback stops after the authored sequence.', '明确的重试连线返回验证步骤；播放在已定义序列结束后停止。'],
    ],
  },
};

export function attachExampleStories(examples) {
  for (const ex of examples) for (const step of ex.doc.journey) {
    const stops = EXAMPLE_STORIES[ex.id]?.[step.id];
    if (stops) step.stops = stops.map(([node, caption], i) => ({ id: `${step.id}-stop-${i + 1}`, node, caption }));
  }
}
export function localizeExampleStories(id, doc) {
  for (const step of doc.journey) (step.stops || []).forEach((stop, i) => {
    const translated = EXAMPLE_STORIES[id]?.[step.id]?.[i]?.[2];
    if (translated) stop.caption = translated;
  });
}
