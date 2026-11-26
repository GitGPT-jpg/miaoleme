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
| 单元测试（86 项） | `npm test`（node:test） | PASS |
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

### 2026-11-16 奔跑序列（8 帧真跑步）专项验收

| 项 | 实际验证方式 | 结果 |
| --- | --- | --- |
| 真帧生成（8 帧侧视跑步） | `GEN_RUN=1` 走真实生成链路（用户照片 + 已生成站立帧作参考） | **PASS**（8/8 成功，job status=completed） |
| 整组归一化 | 生成后读 PNG 尺寸：8 帧同为 341×202；共享缩放 + 质心对齐 + 脚底同基线 | **PASS**（帧间不忽大忽小，身体水平，透明底） |
| 播放顺序 | 渲染层 canvas 量 alpha 包围盒宽度：`[253,287,316,303,280,307,311,311]` | **PASS**（最收拢→过渡→最伸展→过渡 两轮交替） |
| 渲染层轮播 | CDP `Runtime.evaluate` 读运行时：frames=8、frameMs=81、idx 逐帧硬切、imgW=200px、animationName=none、class 含 `running run-seq` | **PASS** |
| 兜底路径（无真帧） | 同上探针，raw-photo 状态：frames=0、animationName=runGallop、frameMs=120 | **PASS**（走路帧加速 + CSS 起伏） |
| 位移速度 | 探针读 `RunMath.runStep(1/120, WALK_SPEED)=0.80`、`(1/60)=1.60` | **PASS**（dt 推进，高刷屏不再两倍速） |
| 冲刺落点夹紧 | 探针：`runTargetX(屏幕最右)=1197 ≤ 上限 1232`；`runTargetX(屏外左)=20`（左界） | **PASS**（不会贴边原地踏步） |
| 隐藏时收尾 | 伪装 `document.hidden=true` 后派发 `visibilitychange`：mode run→idle，`running/run-seq` 类移除，runTimer 清空 | **PASS** |
| 跑完自动收尾 | 可见状态等待冲刺结束 | **PASS**（mode 回 idle） |
| 无缺帧时重做归一化 | `RETRY_GEN=1`（全部帧齐备）→ `{ok:true,nothingToDo:true,renormalized:8}`，帧尺寸保持 341×202 未被放大 | **PASS**（纯本地计算，不调用生成服务） |
| 未知 store 字段保留 | 跑一轮生成+保存后检查外来顶层字段仍在 | **PASS**（最多 24 个、单字段 ≤64KB） |
| 单元测试 | `npm test` | **PASS**（140 项） |
| 姿势标号服从度 | 逐帧肉眼检查 3 批生成结果 | **已知限制**：生成模型对 CONTACT/DOWN/PASSING/FLIGHT 的服从度不稳（每批约 2–3 帧姿势跑偏、左右腿相位不总是互换）。代码侧已用「按实测体长重排播放顺序」消化这类偏差；不满意可点「重试失败项」整组重摇 |
| 骨骼模式奔跑步频 | 代码路径复核（`mode==='run'` 进迈步分支，gait×1.8） | PASS（代码级；rig 模式真机手测 NOT_RUN） |
| 内置猫跑步序列 | `assets/cat-3d-run-1..8.png` 以内置站立帧为源走真实链路生成；`RUN_FILES` 顺序即播放顺序 | **PASS**（8 帧同为 372×242，合计 688KB；实测体长 263/300/336/308/289/326/330/329，最收拢在第 1 帧、最伸展在第 3 帧） |
| 内置猫奔跑渲染 | 无自定义图的 profile，CDP 探针：`runFrames=8`、`frameMs=81`、`frameMs` 硬切、展示框 200px、`object-fit: contain`、无边框无圆角 | **PASS**（同时修掉内置 3D 素材被当成用户原图、套 raw-photo 白边卡片 + `cover` 裁切的问题） |
| 停跑→立刻起跑的淡化竞态 | CDP 走 `hardCut→crossfade→hardCut`（关掉游走排除干扰） | **修前 FAIL**：1200ms 时 `fading=true`、可见层已不是跑步帧，1800ms 图层再翻一次；**修后 PASS**：2.4s 内 `fading` 恒为 false、图层不翻转、可见层始终是跑步帧 |
| 帧体积优化 | 站立 601×632/555KB → 323×340/171KB；16 个文件 4.61MB → 2.28MB；渲染层 dataURL 6.3MB → 3.03MB；屏上尺寸 120.1×126.3 不变 | **PASS**（`heightScale` 下限 0.5 曾把归一化废掉） |
| 维护路径幂等 | 同一份素材连跑两次 `RETRY_GEN=1` | **PASS**（`{renormalized:8, reshrunk:8}` → `{0, 0}`） |
| 并行工作副本互不抹状态 | 两个工作副本各自跑一轮，检查对方字段 | **PASS**（`customGenRunSeq` / 动作帧 / `health` / `hunt` 双向都保留） |
| 无真帧兜底（未配置生成服务） | 探针，raw-photo 状态：`frames=0`、`animationName=runGallop`、`frameMs=120` | **PASS**（走路帧加速 + CSS 起伏） |

## 三、事故与修复记录

**2026-10-21 番茄钟报时崩溃（用户反馈）**
- 现象：点击托盘「开始番茄钟」弹出 `A JavaScript error occurred in the main process: Attempted to register a second handler for 'record-rps'`
- 根因：一次脚本化补丁把两个 IPC 注册块误插进 `petSay()` 与 `notify()` 函数体（锚点注释在函数内也存在），导致每次说话都重复注册 IPC；第二次调用即抛错
- 修复：还原两个函数体；把 `record-rps` / `set-meal-menu` 恢复到顶层 IPC 区且仅注册一次；为 `handle()/on()` 增加重复注册守卫（同类错误不再致命）
- 回归：新增 `test/main-structure.test.js`（函数体内禁止 IPC 注册、channel 唯一性、关键通道存在）；运行验证：预置喝水到期，启动即触发 `petSay`，进程存活、无异常日志，`waterRequest=true`
- 分发：Mac dmg/zip 与 Windows 包均以修复版重建，下载页更新为第 3 版（新 SHA-256）

## 四点四、2D 骨骼动画（v0.4）

- 部件：内置猫 rig-body/head/tail；用户形象上传后**自动生成** pet-rig-body/head/tail + 闭眼帧 + 压耳帧（5 个，AI 生成，透明底，权限 600）
- 渲染：Canvas 2D 层级变换（尾→身→头），持续运行 requestAnimationFrame，30fps 限流；参数：呼吸 1.15Hz、摆尾 1.05Hz、头点 1.4Hz；走路时提高频率与幅度
- 眨眼：每 3–6 秒切闭眼帧 140ms；耳朵抖动：每 8–15 秒切压耳帧 800ms（均需可选部件，缺失自动跳过）
- v0.6.0：头部分带 warp（3 带，顶部跟随视线最强）、瞳孔 saccade（1.6–4.4s 随机微跳）、尾巴临界阻尼弹簧（刚度 90/180、阻尼 14）
- 活物感（v0.5.6）：光标注视（10Hz 光标广播 + 指数平滑）、头部随视线平移/倾斜、身体倾靠、尾巴视线偏置、叠加双频呼吸
- 帧归一化：姿势帧按 alpha 包围盒裁剪并统一高度 340px，减少序列播放忽大忽小（骨骼部件保持相对比例）
- **美观闸门（v0.5.9）**：空/过小(<5%)/稀疏(coverage<0.12)/碎裂(>2 大块)/与站立帧比例失衡(高 0.6–1.5×、宽 0.5–1.7×) 的帧直接丢弃，计为失败可重试；提示词增加「四腿一尾、自然猫体态」约束
- Live2D 评估：见 [docs/live2d-assessment.md](live2d-assessment.md)
- 动作联动：进入动作时暂停骨骼切序列帧，结束自动恢复骨骼；切换形态/换图会释放 RAF，避免竞态
- 验证：console 记录 `[rig] enabled/disabled` 与动作切换一致；窗口截图确认组合渲染自然、连续捕获画面不同
- 限制：非网格变形，是「部件层级 + 变换」的轻量骨骼；真正的网格蒙皮需 Live2D/Spine

## 四点五、动作帧与序列动画（本轮）

- 关键帧总量：**29 张**（内置猫），覆盖 站立/坐姿/迈步×4/开心/打滚×5/舔毛×4/吃饭×4/喝水×4/睡觉×2/伸懒腰×3
- 版本：v0.5.3（下载页第 12 版）：2D 骨骼动画（头/身/尾拆分 + Canvas 层级变换，持续呼吸/点头/摆尾/走路律动，30fps 限流）；用户上传形象可生成专属骨骼部件（userData/pet-rig-*.png），缺失时回退序列帧
- 序列播放：每动作 2–5 帧循环，帧时长 620–2200ms、过渡 120–900ms；叠加动作专属次级运动（打滚摆动/干饭挤压/喝水点头/舔毛摇摆/伸懒腰拉伸）；新增「伸懒腰」动作（托盘/面板可触发）
- 说明：未生成 100+ 张——AI 逐张生成的角色一致性不足，堆叠单帧会产生闪烁而非流畅动画；当前采用「关键帧 + 交叉淡化 + 次级运动」路线，实测 8 次连续截图得到 8 个不同画面（吃饭→站立等），序列生效
- 新增 `lib/sequences.js` 与 3 项单测（元数据合法性、缺帧降级、帧索引循环），测试总数 **47**

## 四、分发

- 临时下载页（内部可见，第 12 版）：https://miaoleme-download.example.com
  - Windows x64 免安装包 `miaoleme-win-x64-0.5.3.tar.xz`（77.3MB，SHA-256 见页面；基于 Electron 33，受 IM 100MB 上限约束）
  - 非 NSIS 安装向导：本机 wine/makensis 为 x86_64、无 Rosetta，无法在 Apple Silicon 构建 exe 安装器
- macOS 安装包：`dist/喵了么-0.5.3-arm64.dmg`（Electron 45；约 122MB，超过 IM 单页上限，未托管）

## 五点五、专家评审与迭代（软件团队 + 内容创作团队）

评分规则：product 30% + design 20% + reliability 35% + copy 15%，>95 才允许结束迭代。

| 轮次 | 产品官 | 质量门神 | 创意总监 | 安全卫士 | 加权综合 | 结论 |
|---|---|---|---|---|---|---|
| R1 | 72 | 66 | 77 | 84 | ~74.7 | iterate |
| R2 | 86 | 85 | 78 | 86 | ~83.8 | iterate |
| R3 | 88 | 83 | 85 | 86 | ~85.5 | iterate |
| R4 | 79* | 86.5 | 87 | 86.7 | ~85 | iterate（*产品官按 10 分制打分，换算后） |

- v0.5.0：Electron 33.4.11（EOL）在 macOS 升级到 45.0.0 + electron-builder 26（Windows 内测包因 100MB 托管上限仍为 33，页面已标注），开发版与打包版均启动验证通过；转盘新增“标签位置与落点一致”交叉测试（57 项）。

R1 → R2 修复：喂饭只标记当前餐次、稍后提醒可恢复、喝水打卡清理待喂、跨天清理饭点请求、提醒不被安静模式吞、退出保留番茄快照、响应 20MB 上限、pet-say 校验、强制 https、文案对齐（6 姿势/需配置/去绝对化）、删除根目录重复 panel.js、重建两端产物并更新下载页（asar 已含 wheel.js）。

R2 → R3 修复：喂饭无待喂请求时不标记任何餐次且不加亲密度（防止 9 点喂饭吞掉午餐、反复点击刷分）、稍后提醒只影响当前待处理请求、面板显示午餐/晚餐已喂状态、生成未配置/失败给出下一步、README/landing 事实与版本对齐、错误信息不再回显上游响应体。

## 五点六、功能收口（本轮）

- 修复：上传入口 `refs` 未定义（真实上传即崩溃）→ 抽取 `processUploadFiles()`（对话框与自测钩子共用同一实现），多选 6 张、逐张体积/类型校验、独立快照
- 修复：内置骨骼入口 `RIG_PARTS_BODY/HEAD/TAIL` 未定义 → 改回 `RIG_PARTS.body/head/tail`
- 回归测试：`test/upload.test.js`（类型嗅探/快照规划）+ `test/main-structure.test.js` 结构性断言（禁止再出现上述未定义引用）
- 验证主线（本机真实 API）：全新 store → AUTO_UPLOAD_PATH 4 张真实照片 → processUploadFiles → startGenJob（11 素材）→ 重启 → 演示序列（喂水/喂粮/动作）→ 恢复（进行中，结果见下）

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

## 七、功能收口验收（2026-10-21 晚，主线：首次启动→上传照片→生成→喂水喂饭→切换动作→重启恢复）

**提交**：d887b43、da8c54a（基于 a2444b6 收口修复之上）。**测试**：100 项全部 PASS。
**主线全程以真实应用执行**（fresh store → `AUTO_UPLOAD_PATH` 4 张参考图 → 真实生成服务 → DEMO_AUTOSTART 演示序列 → 两轮重启），证据为进程日志 + store 快照 + 窗口区域像素分析（/tmp/miaoshots/）。

### 主线验证

| 步骤 | 方式 | 结果 |
|---|---|---|
| 首次启动（fresh store） | 清空 store 后 `npm start` | PASS（状态归一化重建，窗口/面板正常） |
| 上传 4 张照片 | `AUTO_UPLOAD_PATH` 走真实 `processUploadFiles`（与对话框同一入口） | PASS（`[auto-upload] result ok`，4 份 `pet-ref-*` 快照落盘） |
| 后台生成 11 个素材 | 真实生成服务（6 动作帧 + 5 骨骼部件），并发 2 | PASS（genJob completed 11/11，failed=0，用时约 7 分钟） |
| 喂水 | 演示序列调用真实 `feedWater()` → 读 store | PASS（waterDone 2→3、lastCheckinTs 写入、waterRequest 清空、intimacy +1） |
| 喂饭 | 演示序列调用真实 `feedFood()` → 读 store | PASS（21:00 非饭点：不记账不假完成，符合餐次语义；饭点内行为由 test/feed.test.js 5 项覆盖） |
| 切换动作 | 演示序列 act(roll) 等 + 日志 `[rig] disabled→enabled` 周期 | PASS（动作帧显示期间骨骼暂停，结束恢复；stretch/drink 无自定义帧→仅文案不换图，无崩溃） |
| 重启恢复 | 杀进程 → 重启（无 AUTO_UPLOAD_PATH）→ 读 store | PASS（genJob=completed 11/11、customGenIdle/Walk/Actions、4 张参考图、rigSourceImage 全部保留；番茄钟运行态恢复续跑） |
| 番茄钟 | 演示序列 startPomodoro + 重启 | PASS（pomo.active/work/endTs 持久化；重启后恢复；pomo 清空后不再残留） |

### 渲染路径检查（用户点名三项，曾两处为死代码，已修复）

| 检查项 | 修复前 | 修复后 | 证据 |
|---|---|---|---|
| 头部 2×2 网格 warp | `drawHeadWarped` 已定义但从未被调用（头部一直走裸 drawImage） | `drawRig` 内调用 `drawHeadWarped(pickHead(t), …, WarpMath.bandOffsets(gaze.x, gaze.y))`，锚点补偿 0.18h 与原 drawImage(-h*0.82) 一致 | 回归测试锁定调用点；rig 模式窗口像素逐帧变化（2s 间隔 2/3 像素变化） |
| 眨眼/压耳部件 | `loadRig` 只加载身/头/尾，`parts.blink/ears` 被忽略，`rig.blink/ears` 恒为 null | 一并加载进 rig 对象，`pickHead` 按 3–6s 眨眼、8–15s 压耳切帧 | 回归测试锁定 `load(res.parts.blink/ears)`；无渲染异常 |
| 写实模式呼吸 | 已生效（realBreath CSS 4.2s 循环） | — | photo 模式两帧间全区域轻微像素变化（<20 灰度级），与设计一致 |

- rig 模式实测：`[rig] enabled` → 动作时 `[rig] disabled` → 结束 `[rig] enabled` 完整循环；窗口静止时每 2s 区域 2/3 像素变化（尾巴弹簧/呼吸/眨眼/warp 持续动画），无渲染异常（0 TypeError/ReferenceError）。
- photo 模式实测：写实原图渲染（区域 mean 219/std 68.6）+ realBreath 微动画。

### 缺失动作 / 生成超时 / 取消

| 行为 | 验证 | 结果 |
|---|---|---|
| 缺失动作帧（drink/stretch，自定义形象未生成） | 演示序列 act('stretch') | PASS：不换图、文案正常、无异常（不跨猫回退到内置形象） |
| 生成超时（单帧 5 分钟 / 整任务 10 分钟截止） | test/genjob.test.js「截止」用例 | PASS（未尝试项计失败，errorCode=deadline） |
| 取消生成 | 面板「取消」→ IPC cancel-gen → cancelGenJob；test/genjob.test.js「取消」用例 | PASS（status=cancelled，在途结果不写回） |

### 明确未验证项

- Windows 实机运行：本机无 Windows；保留 zip/tar.xz 产物与 CI 工作流（NSIS 安装器需 Windows 构建，BLOCKED）。
- 真实鼠标点击交互（通知点击/托盘点击）：NOT_RUN（自动化点击会干扰正在使用的桌面）。
- 12 小时级长稳：仅做过 30 分钟观察（见第四节）。

### 构建产物（v0.6.4）

- macOS（Electron 45）：`dist/喵了么-0.6.4-arm64.dmg`、`dist/喵了么-0.6.4-arm64-mac.zip`
- Windows x64（Electron 33，受 IM 100MB 上限）：`dist/喵了么-0.6.4-win.zip`、`download-page/miaoleme-win-x64-0.6.4.tar.xz`（免安装，SHA-256 见下载页）

## 八、写代码氛围模式（v0.8）

| 项 | 验证方式 | 结果 |
|---|---|---|
| 计量逻辑（KPM / 连击 / 档位 / 里程碑 / 粒子） | `test/vibe.test.js` | PASS |
| 状态持久化（默认关闭，仅接受布尔） | `test/store.test.js`「vibe 写代码氛围模式」 | PASS |
| IPC 单次注册、will-quit 清理顺序 | `test/main-structure.test.js` | PASS |
| 渲染冒烟：`VIBE_DEMO=1` 启动 9 秒后读取桌宠窗口 DOM | Electron 45 本机运行 | PASS：`#vibe` 可见，档位 `vibe-fire`，KPM 468，连击 x8，在屏粒子 8 个，`#pet` 带 `vibing`/`vibe-bounce` |
| 行为选择（权重、近期去重、打字/刚停/空闲三态阈值） | `test/behavior.test.js` | PASS |
| 点击穿透 | `#vibe` 及子元素 `pointer-events: none`，不在 `overInteractive()` 命中范围内 | 代码检查 |

明确未验证项：
- `uiohook-napi` 全局钩子路径：未安装该可选依赖，NOT_RUN。
- 打字时打盹、停手后自己玩：`VIBE_DEMO=1` 本机运行，肉眼观察切换；未做自动化截图比对。
- 系统按键计数器路径的真人打字表现：只验证子进程能启动并输出增量，未做录屏对比。
- `ioreg` 估算路径的真实手速表现：只验证了命令可用（单次约 23ms），未做真人打字录屏对比。
- 参考视频（抖音「程序员八阿哥：写代码，必须要有氛围」）无法在本机抓取，效果按 Bongo Cat 类「桌宠陪敲代码」实现，细节可能与原视频不同。

## 九、感知键盘、注意力、巡视回窝、逗猫（v0.9）

验证环境：macOS arm64 本机，双屏（一块 Retina），Node 24，Electron 本地运行和 /Applications 安装版各一份。首次安装路径用全新 profile（`--user-data-dir=<临时目录>`，form=custom、photo、vibe=false）模拟。

### 自动测试
- `npm test`：172/172 通过。新增 attention（首键、连打聚合、停手 2.6s + 回看 0.5s 后回落）、arrow（藏起、只归还一次、重启恢复）、main-structure（IPC、开关、DEMO 钩子、拖拽打断）。

### 行为回放（PET_PROBE 记录 #pet 的 class 变化）
| 剧本 | 触发 | 回放结果 |
| --- | --- | --- |
| KEY_DEMO | 2s 舔爪，4.5s 单敲，7–10s 连敲 8 次 | 1.9s act-groom → 4.4s att-on（只换耳朵帧，爪停住）→ 7.2s att-look + att-flick → 12.6s att-linger → 13.1s att-down → 13.5s 从停住的那一帧接着舔 |
| GROOM_DEMO | 2.5s 开始巡视 | walk-look → walk-lean → walking → walk-slow → sniff → turn-head → turn-body → turn-tail（翻面）→ walking → walk-slow → idle（回到窝）；之后自发 beh-yarn / beh-loaf，写实模式原地动作候选已恢复 |
| TEASE_DEMO | 3s 来回逗 | crouch → pounce → paw-hold → act-groom → att-peek → act-groom → idle |

三段静音实录由 PET_REC（每 100ms capturePage 桌宠窗口，按窗口坐标贴到浅底）生成，实际显示尺寸、无声音、无气泡：15s 敲键续舔、20s 散步回窝、30s 扑空洗脸偷看。

### 已知问题复核
1. 写实模式清空自主原地动作候选：已修，回放可见 beh-*。
2. 骨骼模式绕过走跑序列：已修，走跑统一走序列帧。
3. 切回序列后 Canvas 残影：disableRig 清画布。
4. act-walk-3.png、act-stretch-1.png 棋盘格：已去底重存。

### CPU（安装版，空闲不操作，所有 喵了么 进程合计）
| 版本 / 配置 | 平均 CPU |
| --- | --- |
| v0.8，真实 profile | 29.5% |
| v0.9，全新 profile（vibe 关） | 34.0%（60s） |
| v0.9，真实 profile（vibe 开） | 52–58%（60s、120s 各一次） |

v0.9 空闲时自己走动更多（150s 里 walk/run/patrol 约 31s），走路时每帧移动窗口，GPU 进程占大头。vibe 开时的增幅是回归，尚未定位修复；空闲唤醒次数比 v0.8 少，但两次 top 采样窗口不完全一致，只作参考。

### 待测（需要在 Mac 上由真人完成）
- 跨应用首键到首个可见微动的 P95（聊天、文档、浏览器、表格各 25 组，目标 ≤150ms）。
- 点击穿透和焦点不被抢走。
- 中文输入法、方向键、修饰键、长按、权限撤销与恢复、休眠唤醒。
- 半小时空闲和连续输入的 CPU、唤醒次数，与同机 v0.8 对比。
- 桌面实际手感。

最短复验步骤：
1. 安装 0.9.0，首次打开时在「系统设置 → 隐私与安全性」授予输入监控或辅助功能。
2. 面板打开「感知键盘」，确认状态显示为系统级（否则显示「只能感知应用内按键」）。
3. 在微信、文稿、浏览器、表格里各按一下 Tab 或方向键，看耳朵是否转；敲一串看是否抬眼；停手 3s 看是否低头接着舔。
4. 活动监视器看 喵了么 全部进程 30 分钟的 CPU 和唤醒次数。

## 十、v0.9.1：更爱跑来跑去

改动：散步不再只绕窝 ±90px，改为每段走 140–440px，一次散步 1–3 段，中间停下嗅一嗅或张望；离窝超过 420px 时往回走。walk/run/zoomies 权重提高，巡视概率从 35% 提到 50%，冲刺距离 220–520px，疯跑连冲 2–3 趟，空闲等待缩短到 1.8–5s。用户打字时仍保持安静。

回放（macOS arm64，fresh profile，vibe 关，约 123s 探针）：walk 20.2s、run 20.7s、patrol 4.8s、act 35.1s、idle 42.1s。移动类占比约 37%，v0.9.0 同口径约 21%。走动越多 CPU 越高，待在同机复测空闲 CPU。

## 十一、v0.9.2：四条腿跑起来

问题：自定义照片猫跑动时只是一张静态图在平移。原因是重做跑步序列时 `startGenJob` 先清空 `customGenRunSeq`，生成中途失败或被打断后，已经写到磁盘的 8 帧步态没有记回 store；走路也一直用单张图加 CSS 晃动。

改动：
- `lib/recover.js`：启动时扫描用户目录里的 `pet-gen-*` 孤儿帧，只认当前形象（不早于 idle 帧时间戳）的最新一组，补回 8 帧奔跑序列和缺失的动作帧（本机找回了 run×8 和 stretch）。
- `startGenJob`：重做跑步前留底，新序列不满 8 帧时还原旧序列。
- 走路复用 8 帧四腿步态，每帧 125 ms、硬切（`walk-seq`），比奔跑慢一半；朝左时镜像。
- `lib/frameNorm.js`：无透明底的动作帧（四角都是浅中性色）从四边泛洪抠掉背景，保留猫身内部的白毛；新生成帧和存量帧都处理。

验证（macOS arm64，用户 profile 副本，`--user-data-dir` 隔离）：
- 启动后 store 副本 `customGenRunSeq` 为 8 帧，动作新增 stretch；groom 帧由 RGB 变为 RGBA。
- `PET_PROBE` + `RUN_DEMO=1`：奔跑期间渲染层依次切过 8 张不同帧；走路状态带 `walk-seq` 类，帧同样轮换。
- `npm test`：179 项全部通过（新增 `test/recover.test.js` 及启动顺序结构测试）。

待补：其余动作（转身、起身、落爪等）的多帧序列仍需配置可用的图像生成服务后重新生成。

## 十二、v0.10.0：真帧动作

以 assets/cat-3d-idle.png 为母版补画 21 张动作帧（360×280 画布，脚底对齐同一基线），替换原来用 CSS 形变和表情符号拼出的动作。

- 小生活：loaf、yawn、knead、scratch、look、tail、butterfly、yarn、pounce、stretch 由 `BEHAVIOR_FILES` 描述，播放时只保留轻微呼吸，不再叠加缩放旋转。任意一帧缺失时整条行为回落到旧的单帧表现。
- 巡视：alert（起身竖耳）→ 四腿走 → sniff（屏幕边嗅）→ turnBack（头先回）→ turnFront（肩胯跟上）→ 镜像 → 走回 → sitDown（坐回窝）。
- 逗猫：crouch → pounce → 扑空 pawUp 后洗脸；扑中 land 后叼走纸箭头。
- 用户上传的猫没有这些帧，`behaviorSeq`、`poses` 为空，行为保持原样。

### 本机回放（CDP 采样可见帧，开发版）

- knead：knead0 ↔ knead1 循环，结束回 idle。
- loaf：loaf0 → loaf1 → loaf2 停住，结束前回 loaf0 再回 idle。
- 巡视：alert → walk 0–3 循环 → sniff → turnBack → turnFront → 镜像 turnBack → 反向走 → sitDown → idle。
- 逗猫：crouch → pounce → pawUp → 洗脸。

待测：真人在实际显示尺寸下目视确认 land 帧朝向和 turn-2 正面帧的衔接是否自然。

## 十三、v0.11.0：更像真猫的小习惯

新增 16 张真帧（同一母版、360×280 画布、脚底同一基线）：blink、blink-half、shake ×2、earscratch ×2、belly ×2、curl、side-sleep、startle、content、chatter、rub、sit-lick、tail-wrap。

- 眨眼：只在站立待机帧上眨；普通眨眼 120 ms，15% 连眨两下，20% 慢眨（半闭 → 闭 → 半闭 → 睁，约 1.2 s）。窗口隐藏时不眨。
- 抚摸：鼠标在猫身上不按键来回移动累计超过 340 px 进入 `pet` 模式，content 帧加 purring 微震；约 2.4 s 后蹭手（rub）；停摸后回 idle。抚摸期间不响应键盘注意力。
- 受惊：拖拽松手时速度 > 2.2 px/ms，或短时间连点，播放 startle 帧加上跳，再抖毛。普通拖放 30% 概率抖毛。
- 小生活新增 shake、earscratch、belly、chatter、sitlick、tailwrap；`circadianWeights` 按钟点调整权重（深夜偏睡、傍晚偏玩）。
- 打盹随机选 curl、sideSleep 或 sleep，睡眠期间每轮 8% 概率换姿势。
- 拖拽、菜单、喂养、切换形象都经 `interruptOwnLife` 清掉眨眼、抚摸和 life 类。

### 本机回放（macOS，开发版 Electron，CDP 每 25 ms 采样可见帧）

- 慢眨：idle0 → blinkHalf → blink → blinkHalf → idle0。
- shake、earscratch、belly、chatter（与 alert 交替）、sitlick（sitDown 过渡）、tailwrap 均逐帧播放并回到 idle。
- 抚摸：合成 13 次 mousemove 后进入 pet + purring；content → rub → content → idle。
- 受惊：startle + 跳 → shake 循环 → idle。
- 打盹三次：分别出现 curl、sleep、sideSleep 之一。
- npm test：183 项全部通过。控制台无脚本错误。

注意：窗口在后台被 Chromium 节流时计时器会延迟，CDP 回放需加 `--disable-renderer-backgrounding --disable-background-timer-throttling`。待测：真人在实际尺寸下目视确认 rub、belly 帧与待机帧的衔接。

## 十四、v0.12.0：动作有来由，过渡更顺

新增 12 张过渡帧，使用同一母版、同一画布和脚底基线：settle ×3、wake-1、rise ×2、yawn-0、stretch-0、walk-5（起步）、walk-6（收步）、groom-0（抬爪）、look-0。

- 内在状态：`drives` 包含 energy 和 sleepiness，按活动类型（active / calm / rest / sleep）随时间涨落。
- 意向性选择：`pickIntentional` 综合上一行为的转移表、驱动值和钟点权重。醒来 4 分钟内 catnap 权重为 0；困意超过 0.85 且已过冷却期时直接去睡。停留时长 `dwellMs` 随活动类型和困意变化。
- 入睡：sit-down → settle-1/2/3，每帧 900 ms，再淡入睡姿。自己困了去睡（long）时按 `napDurationMs` 睡够才醒，用户停手不会把它叫醒。
- 醒来：wake-1 → rise-1 → rise-2，每帧 800 ms，接着打哈欠或伸懒腰，然后才去做别的。
- 起步先显示 stepOut 160 ms 再进入走路循环；停步先显示 stepIn 再站稳。原地动作不再随机翻转朝向。
- 所有过渡帧定时器都受 session 和 mode 保护，拖拽可以打断，不会留下残帧。

### 本机回放（macOS，开发版 Electron，CDP 采样可见帧）

- 入睡：前 4 s 处于 settle（beh-seq），之后才加 vibe-sleeping 进入睡姿。
- 醒来：rise 三帧约 2.4 s → yawn → idle → walk。
- settle 中途拖拽：mode=drag，过渡定时器清零，只剩 1 张可见帧。
- 冷却：sleepiness 0.95、醒来 1 分钟时，500 次抽样中 catnap 出现 0 次；醒来 10 分钟时出现 500 次。
- 散步：idle → stepOut → walk 循环；停步时 stepIn → idle。
- npm test：190 项全部通过。

待测：需要真人在实际尺寸下目视确认 settle、rise 与待机帧的衔接，以及半小时空闲时入睡和醒来的节奏。
