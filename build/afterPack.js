// electron-builder afterPack 钩子：macOS 27 (Tahoe) 对 adhoc 签名校验更严，
// electron-builder 默认产物会被判 "code has no resources..." → Gatekeeper 报「已损坏」。
// 这里打包后把 .app 从内到外重新 adhoc 签名，使其 valid on disk，
// 用户下载后至少能走「右键→打开」正常绕过（而非死在「已损坏」）。
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.log('[afterPack] app not found, skip:', appPath);
    return;
  }
  const sign = (target, deep) => {
    const args = ['--force'];
    if (deep) args.push('--deep');
    args.push('-s', '-', target);
    try { execFileSync('codesign', args, { stdio: 'ignore' }); } catch (e) { /* 单项失败不阻断 */ }
  };
  const fw = path.join(appPath, 'Contents', 'Frameworks');
  if (fs.existsSync(fw)) {
    // dylib
    for (const f of walk(fw)) if (f.endsWith('.dylib')) sign(f, false);
    // helper apps
    for (const e of fs.readdirSync(fw)) if (e.endsWith('.app')) sign(path.join(fw, e), true);
    // frameworks
    for (const e of fs.readdirSync(fw)) if (e.endsWith('.framework')) sign(path.join(fw, e), true);
  }
  // 主 bundle
  sign(appPath, true);
  // 校验
  try {
    execFileSync('codesign', ['-vvv', appPath], { stdio: 'ignore' });
    console.log('[afterPack] 重签完成且校验通过:', appName);
  } catch (e) {
    console.log('[afterPack] 重签后校验仍失败（不阻断构建）:', appName);
  }
};

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
