// 跨平台启动器：确保以 Electron 应用（而非纯 Node）模式运行。
// 某些环境会设置 ELECTRON_RUN_AS_NODE=1，导致 `electron .` 退化为 node，
// 从而 require('electron') 只返回可执行文件路径、app 为 undefined。
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code));
