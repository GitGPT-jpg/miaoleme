// 上传规划与图片嗅探（纯函数，可单测）
const path = require('path');

// 按文件头识别图片类型：png/jpg/gif/webp/heic，未知返回 null
function sniffImageType(head) {
  if (!head || head.length < 12) return null;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // HEIC：ftyp box（字节 4-8 = 'ftyp'，品牌含 heic/mif1/msf1 等）
  if (head.readUInt32BE(4) === 0x66747970) {
    const brand = head.slice(8, 12).toString('ascii');
    if (/hei[cf]|hei[sx]|mif1|msf1|hevc/.test(brand)) return 'heic';
  }
  return null;
}

const EXT_MAP = { png: '.png', jpg: '.jpg', gif: '.gif', webp: '.webp', heic: '.heic' };

// 每次上传独立快照：为每个文件规划目标路径（最多 6 张）
function planUploadCopies(files, dir, jobId) {
  return (files || []).slice(0, 6).map((src, i) => {
    const ext = EXT_MAP[sniffImageTypeOfFile(src)] || path.extname(src).toLowerCase() || '.png';
    return { src, dest: path.join(dir, `pet-ref-${i}-${jobId}${ext}`) };
  });
}

// 读取文件头用于嗅探（Node 环境）
function sniffImageTypeOfFile(file) {
  try {
    const fs = require('fs');
    const head = Buffer.alloc(12);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
    return sniffImageType(head);
  } catch (e) {
    return null;
  }
}

module.exports = { sniffImageType, sniffImageTypeOfFile, planUploadCopies, EXT_MAP };
