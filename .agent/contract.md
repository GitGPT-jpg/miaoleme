# 工程合同（12 小时开发预算）

- **目标**：把「喵了么」（原零度突破）Electron 桌宠打磨为 macOS 可日常使用的应用：桌宠可见可拖拽、动作自然切换；提醒/番茄钟可靠；设置与形象可恢复；照片生成有真实进度、失败回退、并发隔离；启动/测试/打包可复现。
- **范围**：完善现有桌宠，复用已有能力。保留 Electron + JS 技术栈、现有素材与中文风格。不做全仓重写、不迁移框架、不新增多 Agent/语音/读屏等需求。
- **优先级**：P0 启动/交互/数据/异步串扰/提醒/凭据 → P1 动作体验/配置/恢复/测试/打包/说明 → P2 视觉整理与已测性能优化。
- **起始状态**：分支 `main`，HEAD `00943fb`，remote `GitGPT-jpg/miaoleme`（原 mac-desktop-pet）。工作区唯一未跟踪文件：`mac-desktop-pet_12h_agent_prompt.md`（保留不动）。
- **时间预算**：`started_at = 2026-10-20 21:55:32 CST`，`deadline_at = 2026-10-21 09:55:32 CST`。恢复会话沿用，不重置。最后预留 60 分钟收尾。
- **平台能力**：macOS 14/15 arm64，Node v24.21.0，npm 11.19.0，图形会话可用（可做真实 Electron UI 检查与截图）；Electron 33.4.11 已缓存。
- **已知环境约束**：
  - 本 shell 带 `ELECTRON_RUN_AS_NODE=1`，必须用 `npm start`（launch.js 会清理该变量）；不得删除该兼容逻辑。
  - macOS NSIS/wine 工具链为 x86_64，Apple Silicon 未装 Rosetta → Windows 安装包无法本机构建（保留 zip 与 CI 工作流）。
  - 图像生成凭证在 `generation.config.json`（gitignore），禁止打印/提交/写入日志与公共状态。
- **一工作区单写者**：同时只允许一个 Agent 修改本工作区。中断后先读 `.agent/` 与 git 状态再继续。
- **验收口径**：测试状态单独标记 PASS/FAIL/BLOCKED/NOT_RUN；未实际执行的验证不得标记通过。
