# 检查点

- **分支/HEAD**：main @ 00943fb（工作区干净，仅未跟踪的 12h 提示词文件）
- **当前任务**：BASE-01 启动基线
- **开始/截止**：2026-10-20 21:55 CST / 2026-10-21 09:55 CST
- **正在运行**：已安装版 喵了么.app（pid 95878）在跑；开发验证需先 pkill 避免干扰
- **最近有效验证**：无（本轮刚开工）
- **下一条命令**：`cd 零度突破 && npm ci && npm start`（读取日志后立即可进入 DATA-01）

## 已确认问题（静态复核，待逐条修复）
1. `publicState().feed` 形状 `{waterRequest, mealRequest}`，`broadcastFeedState` 发 `{water, meal}` → pet 初始化读 `s.feed` 时徽标不出现。
2. `loadState` 浅合并，未校验 null/类型。
3. 托盘与 IPC 各写一份喂水/喂饭/snooze 逻辑。
4. pet 拖拽在 await 前设 dragging，起点竞态；`overInteractive` 缺 `#feed-badge`。
5. `crossfadeTo` fadeBusy 丢请求、onload 无失效。
6. 动作类清理漏 `act-drink`。
7. 饭点按天去重 → 午餐吞晚餐。
8. 会议文案固定“约 5 分钟”。
9. 番茄钟重复 start 不清旧 timer；count 语义未验证。
10. 上传生成无 job 隔离、`okCount>0` 即 done、无重试/取消/超时。
