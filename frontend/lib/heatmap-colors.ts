// lib/heatmap-colors.ts — Bảng màu thermal (xanh → lục → vàng → đỏ) dùng chung
// cho canvas heatmap và thanh legend, đảm bảo hiển thị khớp chính xác.

export type Rgb = [number, number, number];

// Các điểm neo (stop) của ramp thermal. `t` trong [0,1].
const HEAT_STOPS: Array<[number, Rgb]> = [
  [0.0, [30, 60, 200]],
  [0.25, [60, 180, 250]],
  [0.5, [80, 215, 120]],
  [0.75, [250, 210, 60]],
  [1.0, [235, 70, 50]],
];

/** Nội suy màu tại `t` trong [0,1] theo HEAT_STOPS. */
export function heatColor(t: number): Rgb {
  if (t <= 0) return HEAT_STOPS[0][1];
  if (t >= 1) return HEAT_STOPS[HEAT_STOPS.length - 1][1];
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (t <= HEAT_STOPS[i][0]) {
      const [t0, c0] = HEAT_STOPS[i - 1];
      const [t1, c1] = HEAT_STOPS[i];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * u),
        Math.round(c0[1] + (c1[1] - c0[1]) * u),
        Math.round(c0[2] + (c1[2] - c0[2]) * u),
      ];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

/**
 * Tạo data-URI ảnh gradient ngang dùng cho thanh legend, lấy màu từ cùng
 * `heatColor` với canvas. `width`/`height` tính bằng điểm ảnh.
 */
export function buildHeatLegendGradient(
  width = 260,
  height = 8,
): string {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return '';
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(width, height);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const [r, g, b] = heatColor(t);
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}