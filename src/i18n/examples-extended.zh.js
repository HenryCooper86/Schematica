// Text-only Simplified Chinese overlays for the additional architecture examples.
export default {
  "model-delivery-security": {
    name: "AI 模型签名交付",
    title: "AI 模型签名交付",
    nodes: {
      "build": {"label":"模型构建"},
      "registry": {"label":"制品仓库","notes":"保存不可变模型摘要和签名清单；签名密钥应与构建工作节点隔离。"},
      "edge": {"label":"推理目标"},
      "attacker": {"label":"模型替换"},
      "verify": {"label":"验证签名和摘要"},
      "gate": {"label":"全部检查通过？","notes":"要求签名有效、摘要匹配、目标正确且版本获准。任意检查失败均进入拒绝分支。"},
      "activate": {"label":"启用模型"},
      "reject": {"label":"拒绝并记录"},
    },
    wires: {
      "w1": "发布",
      "w2": "下载",
      "w3": "篡改",
      "w5": "是",
      "w6": "否",
    },
    zones: {
      "z1": {"label":"构建与分发"},
      "z2": {"label":"设备边界"},
      "z3": {"label":"建议的准入策略"},
    },
    notes: {
      "note1": "设计建议：启用前验证清单签名、模型摘要、目标和最低版本。这不是 RDK 内置安全保证；供电未绘出。",
    },
    journey: {
      "j1": {"label":"发布","caption":"隔离模型构建与签名权限，并发布不可变制品。"},
      "j2": {"label":"检查威胁","caption":"即使传输成功，被替换的仓库对象也必须在设备完整性检查中被拒绝。"},
      "j3": {"label":"允许或拒绝","caption":"签名和摘要验证通过后检查版本策略；被拒绝的制品不会启用。"},
    },
  },
  "robot-command-security": {
    name: "机器人指令信任边界",
    title: "机器人指令信任边界",
    nodes: {
      "operator": {"label":"操作员工作站"},
      "boundary": {"label":"网络边界","notes":"限制可访问的服务；应用身份认证和授权属于独立控制。"},
      "robot": {"label":"机器人监控器"},
      "drive": {"label":"驱动控制器","notes":"独立看门狗在指令过期时停止运动；电机供电和急停电路需要单独设计。"},
      "threat": {"label":"操作员会话被盗"},
      "auth": {"label":"认证和授权"},
      "fresh": {"label":"指令有效且新鲜？"},
      "accept": {"label":"受限运动"},
      "stop": {"label":"停止并审计"},
    },
    wires: {
      "w4": "会话窃取",
      "w6": "是",
      "w7": "否",
    },
    zones: {
      "z1": {"label":"远程访问"},
      "z2": {"label":"机器人控制"},
      "z3": {"label":"建议的指令检查"},
    },
    notes: {
      "note1": "概念性控制：会话认证、逐条指令授权、序号、过期时间及速度限制。UART 本身不认证指令。硬件供电未绘出。",
    },
    journey: {
      "j1": {"label":"远程边界","caption":"防火墙限制网络暴露面；机器人应用仍需验证每个操作员会话。"},
      "j2": {"label":"指令新鲜度","caption":"在转换为运动指令之前拒绝重放、过期或未经授权的指令。"},
      "j3": {"label":"独立停止","caption":"驱动控制器独立于 RDK 监控器执行看门狗超时停止。"},
    },
  },
  "rdk-x3-usb-vision": {
    name: "RDK X3 USB 视觉工作台",
    title: "RDK X3 USB 视觉工作台",
    nodes: {
      "supply": {"label":"稳压电源","notes":"电源输入未绘出；根据开发板和相机需求选择适配器并核算 USB 供电预算。"},
      "board": {"label":"边缘计算"},
      "camera": {"label":"USB 相机","notes":"选择受支持的 UVC 相机，并验证像素格式、帧率和标定。"},
      "pc": {"label":"结果检查工作站"},
      "capture": {"label":"USB 图像采集","notes":"描述性采集阶段；须为开发板镜像选择软件包、运行时和相机配置。 采集参考：https://developer.d-robotics.cc/rdk_doc/en/Robot_development/quick_demo/demo_sensor/"},
      "infer": {"label":"BPU 推理","notes":"仅描述逻辑流水线；未选择运行时，也不执行部署。"},
      "review": {"label":"检查结果","notes":"在信任推理结果前检查相机标定与图像时间戳。"},
    },
    wires: {
    },
    zones: {
      "z1": {"label":"电源与计算"},
      "z2": {"label":"采集与检查"},
      "z3": {"label":"描述性软件流水线"},
    },
    notes: {
      "note1": "仅为架构：USB 表示相机连接；流程箭头描述软件，而非可执行启动文件。请验证所选开发板镜像及模型兼容性。",
    },
    journey: {
      "j1": {"label":"连接相机","caption":"UVC 相机使用 USB，保留 CSI 接口；请确认相机格式和供电预算。"},
      "j2": {"label":"本地推理","caption":"采集阶段向 BPU 推理阶段提供图像；运行时与模型部署仍需明确集成。"},
      "j3": {"label":"检查依据","caption":"在信任推理结果前检查相机标定与图像时间戳。"},
    },
  },
  "rdk-x5-inspection": {
    name: "RDK X5 视觉检测",
    title: "RDK X5 视觉检测",
    nodes: {
      "supply": {"label":"稳压电源","notes":"电源输入未绘出；根据开发板和相机需求选择适配器并核算 USB 供电预算。"},
      "board": {"label":"边缘计算"},
      "camera": {"label":"USB 相机","notes":"选择受支持的 UVC 相机，并验证像素格式、帧率和标定。"},
      "pc": {"label":"结果检查工作站"},
      "capture": {"label":"USB 图像采集","notes":"描述性采集阶段；须为开发板镜像选择软件包、运行时和相机配置。 采集参考：https://developer.d-robotics.cc/rdk_doc/en/Robot_development/quick_demo/demo_sensor/"},
      "infer": {"label":"BPU 推理","notes":"仅描述逻辑流水线；未选择运行时，也不执行部署。"},
      "review": {"label":"检测到缺陷？","notes":"在用检测结果剔除产品之前，使用带标签的验证集评估缺陷检测。"},
      "hold": {"label":"暂存待复核"},
      "pass": {"label":"记录通过"},
    },
    wires: {
      "w7": "是",
      "w8": "否",
    },
    zones: {
      "z1": {"label":"电源与计算"},
      "z2": {"label":"采集与检查"},
      "z3": {"label":"描述性软件流水线"},
    },
    notes: {
      "note1": "仅为架构：USB 表示相机连接；流程箭头描述软件，而非可执行启动文件。请验证所选开发板镜像及模型兼容性。",
    },
    journey: {
      "j1": {"label":"连接相机","caption":"UVC 相机使用 USB，保留 CSI 接口；请确认相机格式和供电预算。"},
      "j2": {"label":"本地推理","caption":"采集阶段向 BPU 推理阶段提供图像；运行时与模型部署仍需明确集成。"},
      "j3": {"label":"检查依据","caption":"检测到缺陷时暂存物品等待人工复核；其他物品记录通过。在自动剔除之前，使用带标签的数据集验证误报和漏检。"},
    },
  },
  "horizon-sensor-replay": {
    name: "征程 6 传感器回放台（地平线）",
    title: "征程 6 传感器回放台（地平线）",
    nodes: {
      "camera": {"label":"录像回放源","notes":"抽象回放装置包含串行器适配器；不是 PC 直接连接 GMSL 的线缆。"},
      "ecu": {"label":"被测控制器","notes":"概念性地平线征程 6M ECU。端口描述拟议载板，而非芯片引脚或经认可的参考板。 平台背景：https://www.horizon.auto/en/solutions/horizon-journey"},
      "bridge": {"label":"测试台以太网桥"},
      "host": {"label":"回放工作站"},
      "gateway": {"label":"CAN 剩余总线仿真器","notes":"仅模拟车辆流量；此测试台不连接执行器。"},
      "align": {"label":"对齐时间戳"},
      "compare": {"label":"比较检测结果"},
      "report": {"label":"记录回归问题"},
    },
    wires: {
    },
    zones: {
      "z1": {"label":"隔离回放台"},
      "z2": {"label":"测量网络"},
      "z3": {"label":"评估流程"},
    },
    notes: {
      "note1": "示意性验证架构，并非地平线参考设计。供电、时序适配器与回放工具均需集成。",
    },
    journey: {
      "j1": {"label":"回放输入","caption":"回放装置提供相机录像数据，剩余总线仿真器提供受控 CAN 流量。"},
      "j2": {"label":"采集输出","caption":"T1 到以太网网桥连接概念 ECU 与测量工作站。"},
      "j3": {"label":"比较运行结果","caption":"对齐输入时间戳，将检测结果与预期结果比较并记录回归问题。"},
    },
  },
  "horizon-diagnostics-security": {
    name: "征程 6 诊断访问（地平线）",
    title: "征程 6 诊断访问（地平线）",
    nodes: {
      "tool": {"label":"维修接口"},
      "gateway": {"label":"诊断网关","notes":"建议的策略执行点：认证测试仪、限制服务并使会话按时过期。"},
      "ecu": {"label":"ADAS 目标 ECU","notes":"概念性地平线征程 6E 载板。此处网关控制是设计建议，而非厂商安全认证。 平台背景：https://www.horizon.auto/en/solutions/horizon-journey"},
      "threat": {"label":"维修工具失陷"},
      "auth": {"label":"认证测试仪"},
      "gate": {"label":"服务获准？"},
      "allow": {"label":"受限会话"},
      "deny": {"label":"拒绝并记录"},
    },
    wires: {
      "w3": "未授权请求",
      "w5": "是",
      "w6": "否",
    },
    zones: {
      "z1": {"label":"维修边界"},
      "z2": {"label":"车辆网络"},
      "z3": {"label":"建议的授权流程"},
    },
    notes: {
      "note1": "仅为架构：CAN 和 CAN FD 本身不提供测试仪身份认证。需实现身份认证、服务允许列表、静止状态检查和审计保留；供电未绘出。",
    },
    journey: {
      "j1": {"label":"外部入口","caption":"在诊断应用确认测试仪身份之前，将维修工具视为不可信。"},
      "j2": {"label":"网关控制","caption":"网关控制对征程 ECU 的访问，并将请求限制在获准的服务集合内。"},
      "j3": {"label":"逐项授权服务","caption":"认证后检查角色、车辆状态和会话有效期；被拒绝的请求进入明确的日志分支。"},
    },
  },
};
