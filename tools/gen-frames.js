// 补帧工具：为某张照片生成全套 3D 帧（站立/行走/打滚/舔毛/吃饭/睡觉/喝水），
// 写入 userData 并更新 zerobreak-store.json。用法：node tools/gen-frames.js <照片路径>
// 注意：本工具只做基础姿势，不生成 8 帧奔跑序列（那组需要整组归一化，走应用内
// `GEN_RUN=1 npm start` / 面板「重试失败项」），也不做质量闸门与帧归一化。
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const PROMPTS = require('../lib/prompts');

const ROOT = path.join(__dirname, '..');
const USER_DATA = path.join(os.homedir(), 'Library/Application Support/zerobreak-desktop-pet');
const STORE = path.join(USER_DATA, 'zerobreak-store.json');

function loadConfig() {
  for (const p of [path.join(USER_DATA, 'generation.config.json'), path.join(ROOT, 'generation.config.json')]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { /* next */ }
  }
  return null;
}

function httpsJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers) }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300) ? resolve(d) : reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 200))));
    });
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function extractB64(resp) {
  try {
    const j = JSON.parse(resp);
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    for (const p of parts) {
      const d = (p.inlineData || p.inline_data || {}).data;
      if (d) return d;
    }
    for (const it of (j.data || [])) if (it.b64_image) return it.b64_image;
  } catch (e) { /* fallthrough */ }
  return null;
}

// 提示词与应用共用一份（lib/prompts.js），避免工具里的描述与主进程漂移
const PROMPT_OF = Object.assign({ idle: PROMPTS.IDLE, walk: PROMPTS.WALK }, PROMPTS.ACTIONS);

async function genFrame(cfg, srcPath, key) {
  const b64 = fs.readFileSync(srcPath).toString('base64');
  const ext = path.extname(srcPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const payload = {
    contents: [{ role: 'USER', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT_OF[key] }] }],
    resolution: '2K',
    aspectRatio: '1:1'
  };
  const resp = await httpsJson(cfg.inhouse.apiUrl, { 'login-name': cfg.inhouse.loginName || '' }, payload);
  const img = extractB64(resp);
  if (!img) return null;
  const out = path.join(USER_DATA, `pet-gen-${key}-${Date.now()}.png`);
  fs.writeFileSync(out, Buffer.from(img, 'base64'));
  return out;
}

async function main() {
  const srcArg = process.argv[2];
  const cfg = loadConfig();
  if (!cfg || !cfg.inhouse || !cfg.inhouse.apiUrl) { console.error('no generation config'); process.exit(1); }
  let store = {};
  try { store = JSON.parse(fs.readFileSync(STORE, 'utf-8')); } catch (e) { /* new */ }
  const src = srcArg || (store.customImage && fs.existsSync(store.customImage) ? store.customImage : null);
  if (!src || !fs.existsSync(src)) { console.error('no source photo; usage: node tools/gen-frames.js <photo>'); process.exit(1); }
  console.log('source:', src);

  const keys = ['idle', 'walk', 'roll', 'groom', 'eat', 'sleep', 'drink'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    console.log(`[${i + 1}/${keys.length}] generating ${k} ...`);
    try {
      const out = await genFrame(cfg, src, k);
      if (!out) { console.log(`  ${k}: FAILED, skip`); continue; }
      console.log(`  ${k}: ${out}`);
      if (k === 'idle') store.customGenIdle = out;
      else if (k === 'walk') store.customGenWalk = out;
      else store.customGenActions = Object.assign({}, store.customGenActions || {}, { [k]: out });
      fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
    } catch (e) {
      console.log(`  ${k}: ERROR ${e.message}`);
    }
  }
  console.log('done');
}

main();
