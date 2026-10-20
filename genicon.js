// 生成托盘与应用图标（无需第三方依赖，用 zlib 手写 PNG）。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 一只简约小猫头像（圆脸 + 两只耳朵），渐变蓝紫底色
function draw(size) {
  const cx = size / 2, cy = size * 0.56, r = size * 0.34;
  return (x, y) => {
    // 耳朵（两个三角）
    const earY = size * 0.30;
    const inEarL = y < earY && Math.abs(x - size * 0.33) < (earY - y) * 0.9;
    const inEarR = y < earY && Math.abs(x - size * 0.67) < (earY - y) * 0.9;
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r || inEarL || inEarR) {
      // 渐变
      const t = y / size;
      const rr = Math.round(106 + t * 40);
      const gg = Math.round(141 - t * 20);
      const bb = Math.round(255 - t * 10);
      // 眼睛
      const eye = (Math.hypot(x - size * 0.40, y - cy) < size * 0.045) ||
                  (Math.hypot(x - size * 0.60, y - cy) < size * 0.045);
      if (eye) return [255, 255, 255, 255];
      return [rr, gg, bb, 255];
    }
    return [0, 0, 0, 0];
  };
}

const outDir = path.join(__dirname, 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'tray.png'), png(16, draw(16)));
fs.writeFileSync(path.join(outDir, 'tray@2x.png'), png(32, draw(32)));
fs.writeFileSync(path.join(outDir, 'icon.png'), png(256, draw(256)));
console.log('icons generated');
