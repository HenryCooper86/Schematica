export const HCT_STORIES = {
  "hct-astra-degraded": {
    "j1": [
      [
        "front",
        "Published: wide and narrow front cameras, each 8 MP.",
        "官方配置：广角和窄角前视摄像头，均为 8 MP。"
      ],
      [
        "surround",
        "Published: four side cameras and one rear camera, each 3 MP.",
        "官方配置：四个侧视和一个后视摄像头，均为 3 MP。"
      ],
      [
        "park",
        "Published: four 3 MP fisheye cameras. Review calibration and blind zones before parking trials.",
        "官方配置：四个 3 MP 鱼眼摄像头。泊车试验前审查标定及盲区。"
      ],
      [
        "radar",
        "Published: one standard forward radar; two front-side and two rear-side radars are optional. Optional equipment must match the vehicle configuration.",
        "官方配置：一个标配前雷达；两个前角和两个后角雷达为选配。配置必须与实车一致。"
      ]
    ],
    "j2": [
      [
        "astra",
        "Published compute: Journey 6M. This card is a functional boundary, not a connector map.",
        "官方计算平台：征程 6M。此卡表示功能边界，不代表连接器定义。"
      ],
      [
        "health",
        "Proposed OEM gate: check sensor freshness, calibration, selected radar variant and operating domain for the requested mode. A healthy highway mode does not imply parking availability.",
        "整车建议门控：按请求模式检查数据新鲜度、标定、雷达选型及运行条件。高速模式可用不代表泊车可用。"
      ],
      [
        "arbiter",
        "Proposed: validate request freshness and driver override before forwarding motion requests; agree the authority split with HCT.",
        "建议：检查请求新鲜度及驾驶员接管，再转发运动请求；与 HCT 明确控制权限。"
      ],
      [
        "vehicle",
        "Brake and steering controllers remain vehicle integration responsibilities. Feedback must confirm accepted requests; this diagram does not establish safe actuator behavior.",
        "制动及转向控制器属于整车集成职责。反馈须确认请求是否接受；此图不证明执行器安全。"
      ]
    ],
    "j3": [
      [
        "park",
        "Published: four 3 MP fisheye cameras. Review calibration and blind zones before parking trials.",
        "官方配置：四个 3 MP 鱼眼摄像头。泊车试验前审查标定及盲区。"
      ],
      [
        "health",
        "Proposed OEM gate: check sensor freshness, calibration, selected radar variant and operating domain for the requested mode. A healthy highway mode does not imply parking availability.",
        "整车建议门控：按请求模式检查数据新鲜度、标定、雷达选型及运行条件。高速模式可用不代表泊车可用。"
      ],
      [
        "degrade",
        "Exercise: obscure a fisheye camera during parking preparation. Reject parking entry and report the cause; do not silently continue with stale imagery. Actual response requires safety analysis.",
        "练习：泊车准备时遮挡鱼眼摄像头。拒绝进入泊车并报告原因，不静默使用旧图像。实际响应须经过安全分析。"
      ],
      [
        "hmi",
        "Proposed: identify the unavailable function and request driver action. Validate warning timing and recovery criteria with the OEM.",
        "建议：指出不可用功能并提示驾驶员操作。与整车厂验证警告时机及恢复条件。"
      ],
      [
        "record",
        "Record sensor identity, selected mode, timestamps, calibration version and driver action so a failed handover can be reproduced.",
        "记录传感器身份、模式、时间戳、标定版本及驾驶员操作，以复现交接失败。"
      ]
    ]
  },
  "hct-luna-arbitration": {
    "j1": [
      [
        "scene",
        "Test cut-in vehicles, vulnerable road users, glare and partial occlusion as separate scenario classes; these are proposed test cases.",
        "将加塞、弱势道路使用者、眩光及部分遮挡作为独立测试类别；这些是建议用例。"
      ],
      [
        "luna",
        "Published: Journey 6B, 2 MP or 8 MP camera at 120 degrees, optional 1–5 radars. Confirm the ordered variant.",
        "官方配置：征程 6B，2 MP 或 8 MP、120 度摄像头，选配 1–5 个雷达。须确认订购版本。"
      ],
      [
        "radar",
        "Treat radar presence and calibration as variant inputs. Do not assume every Luna installation has five radars.",
        "将雷达安装及标定作为配置输入，不假定每套 Luna 都有五个雷达。"
      ],
      [
        "cal",
        "Proposed: block feature enablement when camera alignment, variant coding or health status is invalid. Verify after windshield replacement.",
        "建议：相机对准、配置编码或健康状态无效时阻止功能启用。更换风挡后重新验证。"
      ]
    ],
    "j2": [
      [
        "luna",
        "Published: Journey 6B, 2 MP or 8 MP camera at 120 degrees, optional 1–5 radars. Confirm the ordered variant.",
        "官方配置：征程 6B，2 MP 或 8 MP、120 度摄像头，选配 1–5 个雷达。须确认订购版本。"
      ],
      [
        "fresh",
        "Proposed OEM boundary: validate source identity, counter, timestamp and requested authority. Obtain the actual message contract; no CAN or Ethernet transport is assumed.",
        "整车建议边界：验证来源、计数器、时间戳及请求权限。须取得真实报文契约，不假定 CAN 或以太网传输。"
      ],
      [
        "driver",
        "Test simultaneous driver braking, cruise demand and AEB request. Log the selected authority and reason.",
        "测试驾驶员制动、巡航需求与 AEB 请求同时发生的情况，记录最终权限及理由。"
      ],
      [
        "arbitrate",
        "Define AEB, cruise and driver pedal priority in the vehicle safety concept. The example deliberately does not prescribe that cruise or driver input always wins.",
        "在整车安全概念中定义 AEB、巡航及驾驶员踏板优先级。此例不规定巡航或驾驶员输入总是优先。"
      ],
      [
        "brake",
        "Compare requested and achieved deceleration in a controlled bench model before any vehicle trial. Establish limits from vehicle requirements.",
        "实车试验前，在受控台架模型中比较请求与实际减速度。依据整车需求确定限值。"
      ]
    ],
    "j3": [
      [
        "fresh",
        "Proposed OEM boundary: validate source identity, counter, timestamp and requested authority. Obtain the actual message contract; no CAN or Ethernet transport is assumed.",
        "整车建议边界：验证来源、计数器、时间戳及请求权限。须取得真实报文契约，不假定 CAN 或以太网传输。"
      ],
      [
        "reject",
        "Inject duplicate counters, stale timestamps and an incorrect source. Rejected requests must not enter the brake request path; handling of an ongoing maneuver needs a separate safety decision.",
        "注入重复计数器、过期时间戳及错误来源。被拒请求不得进入制动请求路径；进行中动作的处理须单独作安全决策。"
      ],
      [
        "warning",
        "Proposed: signal reduced feature availability and persist a diagnostic reason without representing a fault indication as a braking command.",
        "建议：提示功能可用性下降并保存诊断原因，不把故障指示当作制动命令。"
      ],
      [
        "observer",
        "Compare arbitration output, brake feedback and event timestamps. Acceptance: no rejected request reaches the actuator model; response timing must meet agreed vehicle requirements.",
        "比较仲裁输出、制动反馈及事件时间戳。验收：被拒请求不得到达执行器模型；响应时序须满足约定整车需求。"
      ]
    ]
  },
  "hct-luna-regression": {
    "j1": [
      [
        "corpus",
        "Freeze scenario IDs, ground truth, lighting and vehicle dynamics. Include nuisance-braking negatives and missed-detection positives; split results by scenario class.",
        "冻结场景编号、真值、光照及车辆动力学。包含误制动负样本及漏检正样本，按场景类别拆分结果。"
      ],
      [
        "adapter",
        "Proposed supplier-approved interfaces convert the same semantic scenarios for each product. This is not a claim of compatible pinouts or raw-camera replay support.",
        "建议使用供应商认可接口，为各产品转换同一语义场景。不声明引脚兼容或支持原始图像回放。"
      ],
      [
        "luna3",
        "Published: Journey 3; use the released vehicle configuration as the comparison baseline.",
        "官方平台：征程 3；以已发布整车配置作为对照基线。"
      ],
      [
        "luna6",
        "Published: Journey 6B. Migration requires separate validation of camera, radar, calibration and feature configuration.",
        "官方平台：征程 6B。迁移须分别验证摄像头、雷达、标定及功能配置。"
      ]
    ],
    "j2": [
      [
        "faults",
        "Exercise frozen frames, sensor loss, timestamp skew, invalid calibration and restart. Record injected fault onset separately from device-reported timing.",
        "测试冻结帧、传感器丢失、时间戳偏差、无效标定及重启。独立记录注入故障起点与设备报告时间。"
      ],
      [
        "observer",
        "Measure missed interventions, nuisance requests, request timing and available functions. A marketing rating is not evidence that this vehicle passes a regulatory test.",
        "测量漏干预、误请求、请求时序及可用功能。宣传评级不能证明本车通过法规测试。"
      ],
      [
        "gate",
        "Proposed: require all agreed per-scenario limits, variant coverage and fault-response checks. Average improvement cannot waive a critical regression.",
        "建议：满足全部约定场景限值、配置覆盖及故障响应检查。平均改进不能豁免关键回退。"
      ]
    ],
    "j3": [
      [
        "gate",
        "Proposed: require all agreed per-scenario limits, variant coverage and fault-response checks. Average improvement cannot waive a critical regression.",
        "建议：满足全部约定场景限值、配置覆盖及故障响应检查。平均改进不能豁免关键回退。"
      ],
      [
        "triage",
        "Failed cases block release. Attach replay seed, environment and both product outputs to the defect; retain the released baseline.",
        "失败用例阻止发布。缺陷记录包含回放种子、环境及两个产品输出，保留已发布基线。"
      ],
      [
        "fix",
        "After a fix, rerun the affected cases and the agreed regression suite. Passing a single replay does not close the release gate.",
        "修复后重跑受影响用例及约定回归测试集。单个回放通过不能关闭发布门控。"
      ],
      [
        "faults",
        "Exercise frozen frames, sensor loss, timestamp skew, invalid calibration and restart. Record injected fault onset separately from device-reported timing.",
        "测试冻结帧、传感器丢失、时间戳偏差、无效标定及重启。独立记录注入故障起点与设备报告时间。"
      ]
    ],
    "j4": [
      [
        "gate",
        "Proposed: require all agreed per-scenario limits, variant coverage and fault-response checks. Average improvement cannot waive a critical regression.",
        "建议：满足全部约定场景限值、配置覆盖及故障响应检查。平均改进不能豁免关键回退。"
      ],
      [
        "approve",
        "Record reviewed vehicle variant, software and calibration digests, scenario manifest and reviewer. Approval applies only to the tested scope.",
        "记录已审查车型配置、软件及标定摘要、场景清单与审查人。批准仅适用于已测试范围。"
      ],
      [
        "evidence",
        "Archive raw observations, failed cases, acceptance limits and sign-off together. Keep test provenance so release decisions remain reproducible.",
        "将原始观察、失败用例、验收限值及签署一起归档。保留测试来源，使发布决策可复现。"
      ]
    ]
  }
};
