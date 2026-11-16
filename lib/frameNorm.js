// 生成帧归一化（纯函数）：按 alpha 包围盒裁剪并缩放到统一高度，消除帧间忽大忽小
function alphaBBox(bitmap, width, height, threshold = 8) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = bitmap[(y * width + x) * 4 + 3]; // BGRA/RGBA 的第 4 字节都是 alpha
      if (a > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// 目标高度 → 缩放比例；限制极端值防止把异常帧放大过头
function heightScale(bboxH, targetH, min = 0.5, max = 3) {
  if (!bboxH || bboxH <= 0) return 1;
  return Math.min(max, Math.max(min, targetH / bboxH));
}

// alpha 统计：包围盒 + 质心横坐标。质心由躯干/头部的像素量主导，
// 比包围盒中心稳得多——跑步帧前后伸腿会把包围盒拉偏，按包围盒对齐会让身体左右抖。
function alphaStats(bitmap, width, height, threshold = 8) {
  const box = alphaBBox(bitmap, width, height, threshold);
  if (!box) return null;
  let sum = 0;
  let count = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (bitmap[(y * width + x) * 4 + 3] > threshold) { sum += x; count++; }
    }
  }
  return Object.assign({}, box, { cx: count ? sum / count : box.x + box.w / 2 });
}

// 序列帧的共用画布：按整组最高帧对齐 targetH 的缩放，裹住所有帧的质心对齐范围。
// 画布贴着猫的实际范围（不留多余空白），渲染层按固定宽度展示时猫才够大。
// 只缩不放：源帧已经比 targetH 小（例如上一版归一化过的序列再过一遍）时按原尺寸重排，避免糊。
function seqCanvas(stats, targetH, pad = 6, maxW = 600) {
  const list = Array.isArray(stats) ? stats.filter((s) => s && s.w > 0 && s.h > 0) : [];
  if (!list.length) return null;
  const maxH = Math.max(...list.map((s) => s.h));
  const spanW = Math.max(...list.map((s) => s.cx - s.x)) + Math.max(...list.map((s) => s.x + s.w - s.cx));
  const scale = Math.min(Math.min(targetH, maxH) / maxH, (maxW - pad * 2) / spanW);
  return { w: Math.ceil(spanW * scale) + pad * 2, h: Math.ceil(maxH * scale) + pad * 2 };
}

// 序列帧整组摆放：整组共享一个缩放系数（最高帧对齐 targetH，再保证最宽帧放得下），
// 每帧按「质心水平对齐 + 脚底基线对齐」落到同一张画布。
// 逐帧按高度归一化会把伸展帧（身体压扁）放大，所以序列必须整组算。
function seqPlacements(stats, canvasW, canvasH, targetH, pad = 6) {
  const list = Array.isArray(stats) ? stats.filter((s) => s && s.w > 0 && s.h > 0) : [];
  if (!list.length) return null;
  const maxH = Math.max(...list.map((s) => s.h));
  const maxLeft = Math.max(...list.map((s) => s.cx - s.x));
  const maxRight = Math.max(...list.map((s) => s.x + s.w - s.cx));
  const spanW = maxLeft + maxRight;
  const fitW = (canvasW - pad * 2) / spanW;
  const fitH = (canvasH - pad * 2) / maxH;
  const scale = Math.min(Math.min(targetH, maxH) / maxH, fitW, fitH);
  const anchorX = pad + maxLeft * scale;      // 所有帧的质心都落在这条竖线上
  const baseline = canvasH - pad;             // 所有帧的脚底都落在这条横线上
  const items = list.map((s) => {
    const w = Math.max(1, Math.round(s.w * scale));
    const h = Math.max(1, Math.round(s.h * scale));
    const dx = Math.max(0, Math.min(canvasW - w, Math.round(anchorX - (s.cx - s.x) * scale)));
    const dy = Math.max(0, Math.min(canvasH - h, Math.round(baseline - h)));
    return { w, h, dx, dy };
  });
  return { canvas: { w: canvasW, h: canvasH }, scale, pad, anchorX, baseline, items };
}

module.exports = { alphaBBox, alphaStats, heightScale, seqCanvas, seqPlacements };
