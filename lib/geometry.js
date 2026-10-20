// 纯几何工具：把窗口位置钳制到可见工作区（支持负坐标 / 多屏）
function clampToArea(x, y, width, height, area) {
  const cx = Math.max(area.x, Math.min(Math.round(x), area.x + area.width - width));
  const cy = Math.max(area.y, Math.min(Math.round(y), area.y + area.height - height));
  return { x: cx, y: cy };
}

// 保存的位置是否仍落在某个显示器内（拔掉外接屏后不把桌宠藏到屏幕外）
function isInsideAnyDisplay(pos, width, height, displays) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;
  return (displays || []).some((d) => {
    const b = d.bounds || d;
    return pos.x + width > b.x && pos.x < b.x + b.width && pos.y + height > b.y && pos.y < b.y + b.height;
  });
}

module.exports = { clampToArea, isInsideAnyDisplay };
