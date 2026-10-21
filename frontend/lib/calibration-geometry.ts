// lib/calibration-geometry.ts — hình học thuần cho calibration/gaze mapping.
// Tách khỏi lib/api/calibration.ts để phần logic thuần (dễ test) không bị trộn
// với tầng HTTP/localStorage. Test: frontend/tests/calibration-geometry.test.ts

export interface CalPoint {
  id: string;
  x: number;
  y: number;
}

const GRID = 4;

/**
 * Khoảng cách tối thiểu (px) từ TÂM của chấm ngoài cùng tới rìa màn hình.
 * Chấm lớn nhất có đường kính 64px (size-16) → bán kính 32px, cộng ~8px
 * khoảng thở để chấm (và vòng focus) không bị cắt khi nằm sát rìa.
 */
export const CALIBRATION_EDGE_INSET_PX = 40;

/** Chặn dưới/trên để màn hình siêu rộng hoặc rất nhỏ vẫn cân đối. */
const MIN_MARGIN = 0.015;
const MAX_MARGIN = 0.06;

/** Dùng khi chưa biết kích thước viewport (SSR) — sát rìa nhưng an toàn. */
export const DEFAULT_CALIBRATION_MARGIN = 0.04;

export interface CalibrationMargins {
  x: number;
  y: number;
}

function clampMargin(value: number): number {
  return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, value));
}

/**
 * Lề (tỷ lệ 0..1) cho từng trục, suy ra từ kích thước viewport sao cho
 * khoảng cách pixel tới rìa luôn đồng đều trên mọi loại màn hình:
 * màn hình 13" hay 27" đều đặt 16 điểm sát rìa/góc như nhau.
 */
export function calibrationMargins(
  viewportWidth: number,
  viewportHeight: number,
): CalibrationMargins {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return { x: DEFAULT_CALIBRATION_MARGIN, y: DEFAULT_CALIBRATION_MARGIN };
  }
  return {
    x: clampMargin(CALIBRATION_EDGE_INSET_PX / viewportWidth),
    y: clampMargin(CALIBRATION_EDGE_INSET_PX / viewportHeight),
  };
}

function axisPositions(margin: number): number[] {
  return Array.from(
    { length: GRID },
    (_, i) => margin + (i * (1 - 2 * margin)) / (GRID - 1),
  );
}

/**
 * Lưới 4×4 (16 điểm). `margins` cho phép đẩy lưới sát rìa theo từng trục;
 * bỏ trống thì dùng margin mặc định.
 */
export function buildCalibrationPoints(margins?: CalibrationMargins): CalPoint[] {
  const marginX = margins?.x ?? DEFAULT_CALIBRATION_MARGIN;
  const marginY = margins?.y ?? DEFAULT_CALIBRATION_MARGIN;
  const xs = axisPositions(marginX);
  const ys = axisPositions(marginY);
  const points: CalPoint[] = [];
  let n = 0;
  for (const y of ys) {
    for (const x of xs) {
      points.push({ id: `p${n}`, x, y });
      n += 1;
    }
  }
  return points;
}

export interface SlideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getContainedImageRect(
  container: SlideRect,
  sourceWidth: number,
  sourceHeight: number,
): SlideRect | null {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return null;
  }

  const scale = Math.min(container.width / sourceWidth, container.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    left: container.left + (container.width - width) / 2,
    top: container.top + (container.height - height) / 2,
    width,
    height,
  };
}

export function screenGazeToSlide(
  x: number,
  y: number,
  rect: SlideRect,
): { x: number; y: number } | null {
  if (!(x >= 0 && x <= 1) || !(y >= 0 && y <= 1) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const viewport = globalThis.visualViewport;
  const viewportWidth = viewport?.width ?? globalThis.innerWidth;
  const viewportHeight = viewport?.height ?? globalThis.innerHeight;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;

  const gx = viewportLeft + x * viewportWidth;
  const gy = viewportTop + y * viewportHeight;

  const sx = (gx - rect.left) / rect.width;
  const sy = (gy - rect.top) / rect.height;
  if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;
  return { x: sx, y: sy };
}
