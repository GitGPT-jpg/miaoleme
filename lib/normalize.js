// 上传照片规整：HEIC 解码为 JPEG、EXIF 方向、统一尺寸（纯依赖注入，可单测）
// nativeImage 在 Node 单测环境不可用，decode() 通过注入的 thumbnail 函数解耦。

// 上传尺寸上限（长边像素）：3.5K 足够生成参考与预览，避免 4032/5712 大图的内存与流量
const UPLOAD_MAX_EDGE = 1536;

// 规整计划：对每张输入决定「原样直通 / 需要规整」
function planNormalize(files) {
  return (files || []).map((src) => ({ src, dest: null, need: !!path.extname(src).match(/\.hei[cf]$/i) }));
}
const path = require('path');

// 需要规整的：HEIC（nativeImage 解不了）与超长边大图
function shouldNormalize(src, size) {
  if (/\.hei[cf]$/i.test(src)) return true;
  return !!(size && Math.max(size.width, size.height) > UPLOAD_MAX_EDGE);
}

// 用注入的 probe(size) / decode(file) → { path } 完成实际规整
async function normalizeUploadFiles(files, deps) {
  const { probe, decode } = deps;
  const out = [];
  for (const src of files) {
    let size = null;
    try { size = await probe(src); } catch (e) { size = null; }
    if (!shouldNormalize(src, size)) { out.push({ src, converted: false }); continue; }
    try {
      const r = await decode(src);
      if (r && r.path) out.push({ src: r.path, converted: true });
      else out.push({ src, converted: false, error: 'decode_failed' });
    } catch (e) {
      out.push({ src, converted: false, error: 'decode_failed' });
    }
  }
  return out;
}

module.exports = { UPLOAD_MAX_EDGE, planNormalize, shouldNormalize, normalizeUploadFiles };
