// 生成帧质量闸门（纯函数）：空图/过稀疏/碎裂/比例失衡 → 拒绝
function analyzeFrame(bitmap, width, height, opts = {}) {
  const threshold = opts.threshold == null ? 8 : opts.threshold;
  let minX = width, minY = height, maxX = -1, maxY = -1, alphaCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[(y * width + x) * 4 + 3] > threshold) {
        alphaCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!alphaCount) return { ok: false, reason: 'empty' };

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < width * 0.05 || bh < height * 0.05) return { ok: false, reason: 'too_small' };
  const coverage = alphaCount / (bw * bh);
  if (coverage < (opts.minCoverage == null ? 0.12 : opts.minCoverage)) {
    return { ok: false, reason: 'sparse', coverage };
  }

  // 连通块：降采样后 4 邻域洪泛，统计“大块”数量（漂浮肢体/碎块会显著增多）
  const step = Math.max(1, Math.floor(Math.max(width, height) / 200));
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const grid = new Uint8Array(cols * rows);
  let filled = 0;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x = Math.min(width - 1, gx * step);
      const y = Math.min(height - 1, gy * step);
      if (bitmap[(y * width + x) * 4 + 3] > threshold) {
        grid[gy * cols + gx] = 1;
        filled++;
      }
    }
  }
  let bigBlobs = 0;
  const seen = new Uint8Array(cols * rows);
  const minArea = Math.max(4, Math.floor(filled * 0.04));
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    let area = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      area++;
      const cy = Math.floor(cur / cols);
      const cx = cur % cols;
      const neigh = [cur - 1, cur + 1, cur - cols, cur + cols];
      for (let k = 0; k < neigh.length; k++) {
        const n = neigh[k];
        if (n < 0 || n >= grid.length || seen[n] || !grid[n]) continue;
        if (k === 0 && cx === 0) continue;
        if (k === 1 && cx === cols - 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (area >= minArea) bigBlobs++;
  }
  const maxBlobs = opts.maxBlobs == null ? 2 : opts.maxBlobs;
  if (bigBlobs > maxBlobs) return { ok: false, reason: 'fragmented', blobs: bigBlobs };

  // 与参考帧（站立）比例对比：明显变形/漂浮的帧拒绝
  if (opts.ref && opts.ref.w > 0 && opts.ref.h > 0) {
    const ratioH = bh / opts.ref.h;
    const ratioW = bw / opts.ref.w;
    if (ratioH < 0.6 || ratioH > 1.5) return { ok: false, reason: 'height_out_of_range', ratioH };
    if (ratioW < 0.5 || ratioW > 1.7) return { ok: false, reason: 'width_out_of_range', ratioW };
  }

  return { ok: true, bbox: { x: minX, y: minY, w: bw, h: bh }, coverage, blobs: bigBlobs };
}

module.exports = { analyzeFrame };
