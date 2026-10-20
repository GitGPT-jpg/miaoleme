const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 查询 / 设置
  getState: () => ipcRenderer.invoke('get-state'),
  setForm: (form) => ipcRenderer.invoke('set-form', form),
  getCustomImage: () => ipcRenderer.invoke('get-custom-image'),
  getCustomFrames: () => ipcRenderer.invoke('get-custom-frames'),
  uploadCustomImage: () => ipcRenderer.invoke('upload-custom-image'),
  getGenJob: () => ipcRenderer.invoke('get-gen-job'),
  cancelGen: () => ipcRenderer.invoke('cancel-gen'),
  retryGen: () => ipcRenderer.invoke('retry-gen'),
  setWater: (cfg) => ipcRenderer.invoke('set-water', cfg),
  setSit: (cfg) => ipcRenderer.invoke('set-sit', cfg),
  setDnd: (cfg) => ipcRenderer.invoke('set-dnd', cfg),
  setPomodoro: (cfg) => ipcRenderer.invoke('set-pomodoro', cfg),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  setAutoLaunch: (v) => ipcRenderer.invoke('set-autolaunch', v),
  setQuiet: (v) => ipcRenderer.invoke('set-quiet', v),
  addMeeting: (payload) => ipcRenderer.invoke('add-meeting', payload),
  removeMeeting: (id) => ipcRenderer.invoke('remove-meeting', id),
  addDdl: (payload) => ipcRenderer.invoke('add-ddl', payload),
  removeDdl: (id) => ipcRenderer.invoke('remove-ddl', id),
  addIntimacy: (n) => ipcRenderer.invoke('add-intimacy', n),
  drinkWater: () => ipcRenderer.invoke('drink-water'),
  feedWater: () => ipcRenderer.invoke('feed-water'),
  feedFood: () => ipcRenderer.invoke('feed-food'),

  // 番茄钟 / 贪睡控制
  pomodoroStart: () => ipcRenderer.send('pomodoro-start'),
  pomodoroStop: () => ipcRenderer.send('pomodoro-stop'),
  snooze: (min) => ipcRenderer.send('snooze', min),

  // 桌宠窗口专用
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getWinPos: () => ipcRenderer.invoke('get-win-pos'),
  setWinPos: (x, y) => ipcRenderer.send('set-win-pos', x, y),
  saveWinPos: (x, y) => ipcRenderer.send('save-win-pos', x, y),
  petSay: (msg) => ipcRenderer.send('pet-say', msg),
  triggerAction: (name) => ipcRenderer.send('trigger-action', name),
  openPanel: () => ipcRenderer.send('open-panel'),

  // 事件订阅
  onFormChanged: (cb) => ipcRenderer.on('form-changed', (e, form) => cb(form)),
  onPetSay: (cb) => ipcRenderer.on('pet-say', (e, msg) => cb(msg)),
  onCustomImageChanged: (cb) => ipcRenderer.on('custom-image-changed', (e, url) => cb(url)),
  onFeedState: (cb) => ipcRenderer.on('feed-state', (e, s) => cb(s)),
  onStateUpdated: (cb) => ipcRenderer.on('state-updated', (e, s) => cb(s)),
  onPomodoroTick: (cb) => ipcRenderer.on('pomodoro-tick', (e, p) => cb(p)),
  onGenStatus: (cb) => ipcRenderer.on('gen-status', (e, s) => cb(s))
});
