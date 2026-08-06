export function buildDensityGrid(points, rows = 24, cols = 18) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const point of points || []) {
    const x = Math.max(0, Math.min(cols - 1, Math.floor(point.x_normalized * cols)));
    const y = Math.max(0, Math.min(rows - 1, Math.floor(point.y_normalized * rows)));
    const confidenceWeight = point.confidence == null ? 0.75 : Number(point.confidence);
    grid[y][x] += confidenceWeight * Number(point.weight || 1);
  }
  return grid;
}

export function drawHeatmap(ctx, width, height, points, { rows = 24, cols = 18 } = {}) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const grid = buildDensityGrid(points, rows, cols);
  const max = Math.max(1, ...grid.flat());
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  grid.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const alpha = Math.min(0.75, value / max);
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    });
  });
}
