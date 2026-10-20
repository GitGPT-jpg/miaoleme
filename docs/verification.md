# 验收报告（12 小时预算执行）

- **开始 / 截止**：2026-10-20 21:55 CST / 2026-10-21 09:55 CST
- **基线**：main @ 00943fb（工作区无未提交修改；`mac-desktop-pet_12h_agent_prompt.md` 为未跟踪文件，保留不动）
- **环境**：macOS arm64，Node v24.21.0，npm 11.19.0；Electron 33.4.11（本机缓存）
- **结论口径**：只记录实际执行过的验证；未执行标注 NOT_RUN，环境受限标注 BLOCKED。

## 一、本轮修复（按优先级）

### P0 — 数据与基础链路
| 项 | 变更 | 证据 |
|---|---|---|
| 状态校验/损坏恢复 | 新增 `lib/store.js`：任意输入（null/数组/错误类型/缺字段）归一化；损坏 JSON 先备份 `*.corrupt-<ts>` 再重建；保留原子写入 | `test/store.test.js`（9 项）PASS；`npm test` PASS |
| 喂食状态契约 | `publicState().feed` 与 `feed-state` 事件统一为 `{water, meal}`；初始化/事件同形状 | 代码复核；启动日志无异常 |
| 重复喂食/贪睡逻辑 | 统一为 `feedWater()/feedFood()/snoozeAll()`，托盘与 IPC 同入口 | 代码复核 |
| IPC 输入校验 | set-form 枚举、坐标/亲密度/贪睡范围、动作名枚举、DND 时间 0–23/0–59 | 代码复核 |
| 安全基线 | 保留 contextIsolation/sandbox/CSP；未暴露通用 IPC | `main.js` webPreferences 复核 |

### P0 — 桌宠交互与动画
| 项 | 变更 | 证据 |
|---|---|---|
| 拖拽竞态 | 受控拖拽会话：`ready` 前忽略移动，异步锚点回填前校验 session；blur/visibilitychange 取消 | 代码复核（UI 手测 BLOCKED，见下） |
| 交互区域 | `#feed-badge` 纳入命中检测 | 代码复核 |
| 行为单一所有权 | `mode: idle/walk/act/drag` + `session` 失效机制；切换清理 timer/RAF | 代码复核 |
| 交叉淡化 | 最新目标必胜（fadeTarget 追赶），onload 过期丢弃 | 代码复核 |
| 动作类清理 | 统一 `ACT_CLASSES`，包含 `act-drink` | 代码复核 |
| 位置一致性 | 新增 `lib/geometry.js`：clamp 到工作区、多屏/负坐标判定；恢复位置校验 | `test/geometry.test.js`（3 项）PASS |

### P0 — 提醒与番茄钟
| 项 | 变更 | 证据 |
|---|---|---|
| 饭点去重 | 改为「日期 + 餐次」，午餐不再吞晚餐；旧数据自动迁移到两餐次 | `test/schedule.test.js` PASS；`test/store.test.js` 迁移用例 PASS |
| 会议漏窗补偿 | 10 分钟内补发"已开始 N 分钟"，超过只补标记；文案用真实剩余分钟 | `test/schedule.test.js` PASS |
| DDL 漏窗补偿 | 只补发最紧迫阶段，并合并更早阶段标记；过期超 1 天不打扰 | `test/schedule.test.js` PASS |
| 删除清理标记 | 删除会议/DDL 同步清理 `notified*` | 代码复核 |
| 番茄钟 | 保留 endTs；重复 start 重置单一计时器；休眠恢复不虚增（每次工作阶段只+1）；退出清理计时器 | 代码复核；单测未覆盖（NOT_RUN） |

### P0 — 图片上传与生成
| 项 | 变更 | 证据 |
|---|---|---|
| 任务隔离 | 每次上传独立输入快照 `pet-custom-<jobId>.<ext>` + 任务 ID；旧任务结果不写状态/不广播 | `test/genjob.test.js` 隔离用例 PASS |
| 结果状态 | completed / partial / failed / cancelled / unavailable + 成功/失败计数；不再"有成功就算全部完成" | `test/genjob.test.js` PASS |
| 并发/重试/截止 | 站立优先；其余并发 2；瞬时错误退避重试 2 次；单任务 5 分钟脚本超时；整任务 10 分钟截止 | `test/gen.test.js`、`test/genjob.test.js` PASS |
| 可查询状态 | 任务快照持久化到 `state.genJob`；面板关闭重开读真实状态；支持取消与重试失败项 | 代码复核 |
| 图片校验 | PNG/JPEG 魔数、20MB 上限、空/坏数据拒绝；URL 形态明确标记不支持 | `test/gen.test.js` PASS |
| 文件清理 | 只清理应用自有且未引用的 `pet-gen-*`、旧 `pet-custom-*`；不删用户原图 | 代码复核 |

### P1
- 生成入口文案：去掉"约十几秒"；明确"仅在启用生成时发送所选图片到配置的服务"
- `generation.config.example.json`（占位符，无真实凭据）
- 安静模式：抑制自动气泡与闲聊，用户主动操作仍反馈（设置页开关）
- 开机静默启动：`wasOpenedAsHidden` 时不弹面板
- 面板刷新不再覆盖聚焦中的输入；过期会议/DDL 在列表标注"已过"
- README：真实命令、数据位置、配置、测试说明、平台限制

## 二、验证矩阵

| 验证项 | 方式 | 结果 |
|---|---|---|
| 依赖安装 | `npm ci` | PASS |
| 单元测试（34 项） | `npm test`（node:test） | PASS |
| 数据损坏/空/错误类型/旧数据迁移 | `test/store.test.js` | PASS |
| 餐次去重、DND 跨午夜、会议/DDL 漏窗与文案 | `test/schedule.test.js` | PASS |
| 生成错误分类、图片校验、并发池、状态推导 | `test/gen.test.js` | PASS |
| 生成任务隔离/取消/截止/部分成功 | `test/genjob.test.js` | PASS |
| 坐标 clamp / 多屏判定 | `test/geometry.test.js` | PASS |
| 开发版启动 | `npm start`，进程存活，日志仅登录项权限报错（沙箱限制） | PASS |
| 打包产物含新增模块 | `electron-builder --dir` + `asar list`（lib/* 均在包内） | PASS |
| 打包产物启动 | 直接执行包内二进制，进程存活 | PASS |
| 原生 UI 交互（点击穿透/拖拽/通知/托盘） | 需解锁图形界面 | **BLOCKED**（执行期间屏幕锁定，无法手动点击） |
| 真实图像服务联调 | 需真实凭据与网络 | **NOT_RUN**（不新增付费调用；逻辑用 mock/fixture 单测覆盖） |
| 千帆图生图协议 | 未取得可用契约与密钥 | **NOT_RUN**（不宣称兼容） |
| Windows 安装包 | 本机 wine/NSIS 为 x86_64，Apple Silicon 未装 Rosetta | **BLOCKED**（保留 zip 与 CI 工作流） |
| 30–60 分钟稳定性观察 | 短时采样（45–50s，屏幕锁定） | **PARTIAL**（见下，非 30–60min 长稳） |
| 自动游走 IPC 优化前后 CPU | 5s 间隔采样主进程 CPU/RSS | PASS（见下） |

## 三、已知限制与未完成项
1. 原生 UI 交互未在本轮人工验证（屏幕锁定）；建议解锁后按：启动 → 悬停菜单 → 拖拽 → 喂水/喂粮 → 动作切换 → 关闭重开面板 → 托盘退出 逐项验收。
2. 番茄钟运行态不持久化；应用重启后计时器消失（不伪造完成数，文档已说明）。
3. 上传生成的真实链路未在无授权下批量调用；使用单测 + 既有历史成功产物验证编排。
4. Windows NSIS 需 CI（`windows-build-workflow.yml` 移入 `.github/workflows/`）。
5. P2 性能：短时采样（约 45 秒，屏幕锁定，无法做交互场景）

## 四、P2 性能采样（短时，非长稳）

采样方式：`ps -o %cpu,rss` 每 5 秒采样主进程，样本窗口约 40–50 秒；期间包含一次自动游走。

| 版本 | 空闲 CPU | 游走峰值 CPU | RSS |
|---|---|---|---|
| 优化前（逐帧 setWinPos，约 60Hz） | ~0% | **5.1–6.7%** | 148–191MB |
| 优化后（位置 IPC 限流 ~30Hz） | ~0% | **2.7%** | 128–154MB |

说明：单次短时采样，RSS 波动含缓存预热/回收，不据此宣称"无泄漏"；未做 30–60 分钟稳定性观察，该项为 NOT_RUN/PARTIAL。
