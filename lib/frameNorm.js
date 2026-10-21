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

module.exports = { alphaBBox, heightScale };
