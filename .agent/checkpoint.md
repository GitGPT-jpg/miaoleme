# 检查点

- **分支/HEAD**：main @ da8c54a（功能收口修复：头部 warp + 眨眼/压耳进入渲染路径；d887b43 上传导出修复）
- **本轮任务**：功能收口——主线真实验证（首次启动→上传→生成→喂水喂饭→切换动作→重启恢复）+ 渲染路径三项检查 + 构建 v0.6.4
- **最近有效验证**：`npm test` 100 项 PASS；真实生成 11/11 完成；重启恢复 PASS；rig/photo 渲染路径像素级验证 PASS（证据 /tmp/miaoshots/）；喂水/番茄钟真实链路 PASS
- **构建产物（v0.6.4）**：mac dmg/zip（Electron 45）+ win zip/tar.xz（Electron 33，popo 100MB 上限）
- **正在运行**：开发版 photo 模式实例（验证用，可随时关）

## 明确未验证项
1. Windows 实机运行（无 Windows 环境；NSIS 需 CI）
2. 真实鼠标点击交互（点击会干扰正在使用的桌面，NOT_RUN）
3. 12 小时级长稳（仅做过 30 分钟观察）

## 关键文件
- `renderer/pet.js`（drawRig 头部 warp 调用点；loadRig 加载 blink/ears）
- `lib/upload.js`（sniffImageTypeOfFile 导出）、`lib/genjob.js`（截止/取消/隔离）
- `test/main-structure.test.js`（渲染路径结构回归）、`test/upload.test.js`（导出契约）
- `docs/verification.md` 第七节（收口验收矩阵）
