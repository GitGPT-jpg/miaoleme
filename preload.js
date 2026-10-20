const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 查询 / 设置
  getState: () => ipcRenderer.invoke('get-state'),
  setForm: (form) => ipcRenderer.invoke('set-form', form),
  setWater: (cfg) => ipcRenderer.invoke('set-water', cfg),
  addMeeting: (payload) => ipcRenderer.invoke('add-meeting', payload),
  removeMeeting: (id) => ipcRenderer.invoke('remove-meeting', id),
  addDdl: (payload) => ipcRenderer.invoke('add-ddl', payload),
  removeDdl: (id) => ipcRenderer.invoke('remove-ddl', id),

  // 桌宠窗口专用
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  petSay: (msg) => ipcRenderer.send('pet-say', msg),
  openPanel: () => ipcRenderer.send('open-panel'),

  // 事件订阅
  onFormChanged: (cb) => ipcRenderer.on('form-changed', (e, form) => cb(form)),
  onPetSay: (cb) => ipcRenderer.on('pet-say', (e, msg) => cb(msg)),
  onStateUpdated: (cb) => ipcRenderer.on('state-updated', (e, s) => cb(s))
});
