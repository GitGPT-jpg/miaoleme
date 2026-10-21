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
| 番茄钟 | 保留 endTs；重复 start 重置单一计时器；运行态持久化并在重启时按策略恢复；退出清理计时器与生成子进程 | `test/pomodoro.test.js` PASS + 两次真实重启集成验证 PASS（见下方证据） |

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
| 番茄钟恢复（未到期续跑、只计一次） | 预置 endTs=now+15s 写入 store → 重启 → 读取 store | PASS（pomodoroDone 0→1，phase 自动转 break 并持久化） |
| 番茄钟过期不虚增 | 预置 endTs=now-60s → 重启 → 读取 store | PASS（pomo=null，pomodoroDone 保持 1） |
| 关闭喝水提醒清理待喂请求 | 代码路径复核（set-water 关闭时清 waterRequest 并广播） | PASS（代码级） |
| 退出时杀生成子进程 | 代码路径复核（genChildren 集合 + will-quit SIGKILL） | PASS（代码级） |
| 单实例 | 启动后再次启动，统计非 helper 主进程数 | PASS（1 → 1，第二次立即退出） |
| IPC 发送方校验 | 代码复核 + 启动后面板/桌宠 IPC 正常渲染 | PASS（仅 petWin/panelWin 可信；异常调用抛 untrusted） |
| 上传体积/魔数校验 | 代码复核（≤20MB、PNG/JPEG/GIF/WebP 魔数） | PASS（代码级；非法文件返回可读错误并提示） |
| 通知点击唤起面板 | 代码复核（Notification click → openPanel） | PASS（代码级，点击手测 NOT_RUN） |
| 帧 dataURL 缓存 | 代码复核（path+mtime+size 键，40 条上限） | PASS（代码级） |
| 生成按钮语义 | 代码复核（生成中仅取消；失败/部分/取消仅重试） | PASS（代码级，UI 手测 NOT_RUN） |
| 自定义吃饭菜单持久化 | `npm test` + 重启后读取 store | PASS（2–12 项、20 字上限；菜单写入并恢复） |
| 石头剪刀布战绩持久化 | `npm test` + 重启读取 | PASS（非法值归零） |
| 会议/DDL 列表去抖重绘 | 代码复核（JSON 签名相同则跳过） | PASS（代码级） |
| 残留 running 任务标记 | 预置 `genJob.status=running` → 重启 → 读取 store | PASS（status=failed，errorCode=interrupted，activePose=null） |
| 拖拽中停止走路动画类 | 代码复核（beginDrag 移除 walking 类） | PASS（代码级，交互手测 NOT_RUN） |
| 开发版启动 | `npm start`，进程存活，日志仅登录项权限报错（沙箱限制） | PASS |
| 打包产物含新增模块 | `electron-builder --dir` + `asar list`（lib/* 均在包内） | PASS |
| 打包产物启动 | 直接执行包内二进制，进程存活 | PASS |
| 原生 UI 渲染（桌宠窗口/控制台） | 解锁后按窗口 ID 截图（`screencapture -l`） | **PASS**：桌宠窗口渲染出用户形象 + 「喂水」徽标；控制台渲染出统计/形态/上传区（证据：/tmp/zb-shots/pet2.png、panelwin.png） |
| 原生 UI 交互（点击穿透/拖拽/通知/托盘） | 需要真实鼠标操作 | **NOT_RUN**（窗口位于另一桌面 Space；为避免合成点击干扰用户正在使用的 IDE，未做自动化点击） |
| 真实图像服务联调 | 需真实凭据与网络 | **NOT_RUN**（不新增付费调用；逻辑用 mock/fixture 单测覆盖） |
| 千帆图生图协议 | 未取得可用契约与密钥 | **NOT_RUN**（不宣称兼容） |
| Windows 安装包 | 本机 wine/NSIS 为 x86_64，Apple Silicon 未装 Rosetta | **BLOCKED**（保留 zip 与 CI 工作流） |
| 30–60 分钟稳定性观察 | 安装版（含单实例/番茄恢复/生成修复）连续 30 分钟，每 3 分钟采样 | **PASS**（0–0.7% CPU，RSS 128.6MB → 60.6MB，无持续增长；见第四节） |
| 自动游走 IPC 优化前后 CPU | 5s 间隔采样主进程 CPU/RSS | PASS（见下） |

## 三、事故与修复记录

**2026-10-21 番茄钟报时崩溃（用户反馈）**
- 现象：点击托盘「开始番茄钟」弹出 `A JavaScript error occurred in the main process: Attempted to register a second handler for 'record-rps'`
- 根因：一次脚本化补丁把两个 IPC 注册块误插进 `petSay()` 与 `notify()` 函数体（锚点注释在函数内也存在），导致每次说话都重复注册 IPC；第二次调用即抛错
- 修复：还原两个函数体；把 `record-rps` / `set-meal-menu` 恢复到顶层 IPC 区且仅注册一次；为 `handle()/on()` 增加重复注册守卫（同类错误不再致命）
- 回归：新增 `test/main-structure.test.js`（函数体内禁止 IPC 注册、channel 唯一性、关键通道存在）；运行验证：预置喝水到期，启动即触发 `petSay`，进程存活、无异常日志，`waterRequest=true`
- 分发：Mac dmg/zip 与 Windows 包均以修复版重建，下载页更新为第 3 版（新 SHA-256）

## 四点四、2D 骨骼动画（v0.4）

- 部件：内置猫 rig-body/head/tail、用户形象 pet-rig-body/head/tail（AI 生成，透明底）
- 渲染：Canvas 2D 层级变换（尾→身→头），持续运行 requestAnimationFrame；参数：呼吸 1.15Hz、摆尾 1.05Hz、头点 1.4Hz；走路时提高频率与幅度
- 动作联动：进入动作时暂停骨骼切序列帧，结束自动恢复骨骼；切换形态/换图会释放 RAF，避免竞态
- 验证：console 记录 `[rig] enabled/disabled` 与动作切换一致；窗口截图确认组合渲染自然、连续捕获画面不同
- 限制：非网格变形，是「部件层级 + 变换」的轻量骨骼；真正的网格蒙皮需 Live2D/Spine

## 四点五、动作帧与序列动画（本轮）

- 关键帧总量：**29 张**（内置猫），覆盖 站立/坐姿/迈步×4/开心/打滚×5/舔毛×4/吃饭×4/喝水×4/睡觉×2/伸懒腰×3
- 版本：v0.4.0（下载页第 7 版，SHA-256 `605f214c…`）：2D 骨骼动画（头/身/尾拆分 + Canvas 层级变换，持续呼吸/点头/摆尾/走路律动）；用户上传形象有专属骨骼部件（userData/pet-rig-*.png），缺失时回退序列帧
- 序列播放：每动作 2–5 帧循环，帧时长 620–2200ms、过渡 120–900ms；叠加动作专属次级运动（打滚摆动/干饭挤压/喝水点头/舔毛摇摆/伸懒腰拉伸）；新增「伸懒腰」动作（托盘/面板可触发）
- 说明：未生成 100+ 张——AI 逐张生成的角色一致性不足，堆叠单帧会产生闪烁而非流畅动画；当前采用「关键帧 + 交叉淡化 + 次级运动」路线，实测 8 次连续截图得到 8 个不同画面（吃饭→站立等），序列生效
- 新增 `lib/sequences.js` 与 3 项单测（元数据合法性、缺帧降级、帧索引循环），测试总数 **47**

## 四、分发

- 临时下载页（内部可见）：https://miaoleme-download.popo.baidu-int.com
  - Windows x64 免安装包 `miaoleme-win-x64-0.2.0.tar.xz`（80.9MB，当前代码构建，含 SHA-256）
  - 非 NSIS 安装向导：本机 wine/makensis 为 x86_64、无 Rosetta，无法在 Apple Silicon 构建 exe 安装器
- macOS 安装包：`dist/喵了么-0.2.0-arm64.dmg`（104MB，超过 popo 单页上限，未托管）

## 五、已知限制与未完成项
1. 原生 UI **交互**未自动化验证（窗口在另一 Space；未用合成点击以免干扰用户）。已通过窗口 ID 截图确认渲染正常、徽标状态与持久化一致。建议人工按：启动 → 悬停菜单 → 拖拽 → 喂水/喂粮 → 动作切换 → 关闭重开面板 → 托盘退出 逐项验收。
2. 面板文案残留「约需十几秒」已在本轮修复（见提交），并在重启后确认不再出现。
2. ~~番茄钟运行态不持久化~~ → 已实现持久化恢复：未到期继续计时；已到期只提示不计数（两次重启集成验证 PASS）。
3. 上传生成的真实链路未在无授权下批量调用；使用单测 + 既有历史成功产物验证编排。
4. Windows NSIS 需 CI（`windows-build-workflow.yml` 移入 `.github/workflows/`）。
5. P2 性能：短时采样（约 45 秒，屏幕锁定，无法做交互场景）

## 四、P2 性能采样（短时，非长稳）

采样方式：`ps -o %cpu,rss` 每 5 秒采样主进程，样本窗口约 40–50 秒；期间包含一次自动游走。

| 版本 | 空闲 CPU | 游走峰值 CPU | RSS |
|---|---|---|---|
| 优化前（逐帧 setWinPos，约 60Hz） | ~0% | **5.1–6.7%** | 148–191MB |
| 优化后（位置 IPC 限流 ~30Hz） | ~0% | **2.7%** | 128–154MB |

说明：短时采样（40–50s）仅用于优化前后对比，RSS 波动含缓存预热/回收。

### 30 分钟稳定性观察（安装版，代码冻结）

- 版本：`/Applications/喵了么.app`（单实例锁 + 番茄钟恢复 + 生成任务修复后的构建）
- 场景：正常桌面使用，桌宠自动游走/动作，期间无人工交互
- 口径：每 180 秒采样一次主进程 `%cpu / rss / thread`（macOS `ps` 不提供 thcount，线程列为空）
- 原始数据：/tmp/stability.csv（10 个样本，22:29–22:56）

| 时间 | 已运行 | CPU | RSS |
|---|---|---|---|
| 22:29 | 180s | 0.0% | 128.6MB |
| 22:32 | 360s | 0.7% | 128.3MB |
| 22:35 | 540s | 0.0% | 112.7MB |
| 22:38 | 720s | 0.0% | 112.1MB |
| 22:41 | 900s | 0.0% | 112.8MB |
| 22:44 | 1080s | 0.0% | 112.2MB |
| 22:47 | 1260s | 0.0% | 112.3MB |
| 22:50 | 1440s | 0.0% | 86.4MB |
| 22:53 | 1620s | 0.0% | 61.4MB |
| 22:56 | 1800s | 0.0% | 60.6MB |

结论：30 分钟内 CPU 基本为 0（峰值 0.7%），RSS 单调下降（macOS 回收），**未观察到持续无界增长**。该观察为单进程主进程口径，不覆盖 GPU/Utility 子进程；不做"12 小时稳定运行"的结论。
