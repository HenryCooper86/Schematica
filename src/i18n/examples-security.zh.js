// Simplified Chinese overlays for the security explainer examples.
export default {
  'log4shell-cve': {
    name: 'CVE 讲解：Log4Shell（CVE-2021-44228）',
    title: '遥测后端上的 Log4Shell',
    nodes: {
      atk: { label: '远程攻击者' },
      req: { label: '遥测上传' },
      api: { label: '遥测 API', notes: '记录每次车辆上传的 User-Agent 头。' },
      vuln: { label: 'Log4Shell 漏洞' },
      ldap: { label: '攻击者 LDAP 服务器' },
      cls: { label: '远程 Java 类' },
      rce: { label: '代码在 API 中运行' },
      keys: { label: '车队 API 密钥' },
    },
    wires: { w1: '发送', w2: '头部被记录', w3: 'JNDI 查找', w4: '指向', w5: '类被加载', w6: '运行', w7: '读取', w8: '影响' },
    zones: {
      z1: { label: '互联网（攻击者控制）' },
      z2: { label: '遥测后端' },
    },
    notes: {
      n1: '修复：将 Log4j 升级到 2.17.1 或更高版本，并阻止服务器发起的出站 LDAP/RMI 连接。本图说明一个已公开的 CVE，并非对真实系统的评估。',
    },
    journey: {
      j1: { label: '构造的请求', caption: '攻击者在后端会记录的头部中放入 ${jndi:ldap://…} 字符串。' },
      j2: { label: '查找', caption: 'Log4j 展开该字符串，并向攻击者的 LDAP 服务器请求指定对象。' },
      j3: { label: '远程代码', caption: 'LDAP 回复指向一个远程 Java 类；API 加载并运行它。' },
      j4: { label: '修复', caption: '升级 Log4j 可消除查找路径；阻止出站 LDAP 可限制遗漏主机能获取的内容。' },
    },
  },
  'robot-fleet-incident': {
    name: '事件回放：机器人车队（基于日志）',
    title: '机器人车队事件（基于日志）',
    nodes: {
      atk: { label: '攻击者' },
      laptop: { label: '运维笔记本' },
      vpn: { label: '车队 VPN' },
      fleet: { label: '车队管理器' },
      ota: { label: 'OTA 服务器' },
      robot: { label: '配送机器人' },
      store: { label: '遥测存储' },
    },
    wires: { w1: '钓鱼邮件', w2: '使用被盗凭据登录 VPN', w3: '运维会话', w4: '上传未签名更新', w5: '推送更新', w6: '导出遥测数据' },
    zones: {
      z1: { label: '运维办公室' },
      z2: { label: '车队云' },
      z3: { label: '外勤机器人' },
    },
    notes: {
      n1: '基于日志重建。步骤是日志所记录的内容，并非执行的独立证明。IR-2026-03（虚构教学日志）',
    },
    journey: {
      j1: { label: '阶段：初始访问', caption: '初始访问 — 3 条日志记录。' },
      j2: { label: '阶段：访问', caption: '访问 — 2 条日志记录。' },
      j3: { label: '阶段：探查', caption: '探查 — 3 条日志记录。' },
      j4: { label: '阶段：影响', caption: '影响 — 2 条日志记录。' },
      j5: { label: '阶段：数据外泄', caption: '数据外泄 — 3 条日志记录。' },
    },
  },
};
