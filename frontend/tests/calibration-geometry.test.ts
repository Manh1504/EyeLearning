import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildCalibrationPoints,
  calibrationMargins,
  CALIBRATION_EDGE_INSET_PX,
  DEFAULT_CALIBRATION_MARGIN,
  getContainedImageRect,
  screenGazeToSlide,
} from "@/lib/api/calibration";

describe("buildCalibrationPoints", () => {
  it("tạo đúng 16 điểm cho lưới 4×4", () => {
    const points = buildCalibrationPoints();
    expect(points).toHaveLength(16);
  });

  it("id duy nhất và theo thứ tự p0..p15", () => {
    const points = buildCalibrationPoints();
    expect(points.map((p) => p.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `p${i}`),
    );
  });

  it("mọi toạ độ nằm trong [0,1] và sát rìa theo margin mặc định", () => {
    for (const { x, y } of buildCalibrationPoints()) {
      expect(x).toBeGreaterThanOrEqual(DEFAULT_CALIBRATION_MARGIN - 1e-9);
      expect(x).toBeLessThanOrEqual(1 - DEFAULT_CALIBRATION_MARGIN + 1e-9);
      expect(y).toBeGreaterThanOrEqual(DEFAULT_CALIBRATION_MARGIN - 1e-9);
      expect(y).toBeLessThanOrEqual(1 - DEFAULT_CALIBRATION_MARGIN + 1e-9);
    }
  });

  it("sát rìa hơn hẳn mức cũ (margin 0.1)", () => {
    expect(DEFAULT_CALIBRATION_MARGIN).toBeLessThan(0.1);
  });

  it("nhận margin tuỳ chỉnh và đặt 4 góc sát rìa", () => {
    const points = buildCalibrationPoints({ x: 0.02, y: 0.05 });
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0.02, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.98, 6);
    expect(Math.min(...ys)).toBeCloseTo(0.05, 6);
    expect(Math.max(...ys)).toBeCloseTo(0.95, 6);
  });
});

describe("calibrationMargins", () => {
  it("giữ khoảng cách tới rìa ~cố định theo pixel trên nhiều cỡ màn hình", () => {
    for (const [w, h] of [
      [1366, 768],
      [1920, 1080],
      [2560, 1440],
    ]) {
      const m = calibrationMargins(w, h);
      expect(m.x * w).toBeCloseTo(CALIBRATION_EDGE_INSET_PX, 4);
      expect(m.y * h).toBeCloseTo(CALIBRATION_EDGE_INSET_PX, 4);
    }
  });

  it("chặn margin khi màn hình rất nhỏ để chấm không bị cắt", () => {
    const m = calibrationMargins(320, 240);
    expect(m.x).toBeCloseTo(0.06, 6);
    expect(m.y).toBeCloseTo(0.06, 6);
  });

  it("chặn margin khi màn hình siêu rộng", () => {
    const m = calibrationMargins(8000, 8000);
    expect(m.x).toBeCloseTo(0.015, 6);
    expect(m.y).toBeCloseTo(0.015, 6);
  });

  it("trả margin mặc định khi thiếu kích thước viewport", () => {
    expect(calibrationMargins(0, 0)).toEqual({
      x: DEFAULT_CALIBRATION_MARGIN,
      y: DEFAULT_CALIBRATION_MARGIN,
    });
  });
});

describe("screenGazeToSlide", () => {
  const originalInnerWidth = globalThis.innerWidth;
  const originalInnerHeight = globalThis.innerHeight;

  beforeEach(() => {
    Object.defineProperty(globalThis, "innerWidth", { value: 1000, configurable: true });
    Object.defineProperty(globalThis, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(globalThis, "visualViewport", { value: undefined, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "innerWidth", { value: originalInnerWidth, configurable: true });
    Object.defineProperty(globalThis, "innerHeight", { value: originalInnerHeight, configurable: true });
  });

  const rect = { left: 100, top: 100, width: 400, height: 300 };

  it("chiếu tâm viewport vào tâm slide khi slide ở giữa", () => {
    // viewport tâm = (500,400); slide rect tâm = (300,250) → điểm (500,400)
    // sx = (500-100)/400 = 1 → ngoài; chọn điểm nằm trong slide
    const mapped = screenGazeToSlide(0.3, 0.5, rect);
    expect(mapped).not.toBeNull();
    expect(mapped!.x).toBeCloseTo((300 - 100) / 400, 5);
    expect(mapped!.y).toBeCloseTo((400 - 100) / 300, 5);
  });

  it("trả null khi điểm ngoài vùng slide", () => {
    expect(screenGazeToSlide(0, 0, rect)).toBeNull();
    expect(screenGazeToSlide(1, 1, rect)).toBeNull();
  });

  it("trả null khi rect rỗng", () => {
    expect(screenGazeToSlide(0.3, 0.5, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });

  it("trả null khi toạ độ gaze ngoài [0,1]", () => {
    expect(screenGazeToSlide(-0.1, 0.5, rect)).toBeNull();
    expect(screenGazeToSlide(0.5, 1.1, rect)).toBeNull();
  });
});

describe("getContainedImageRect", () => {
  const container = { left: 100, top: 50, width: 1600, height: 900 };

  it("giữ nguyên bounds khi ảnh cùng tỷ lệ với container", () => {
    expect(getContainedImageRect(container, 1920, 1080)).toEqual(container);
  });

  it("loại trừ letterbox hai bên của ảnh dọc", () => {
    expect(getContainedImageRect(container, 600, 1200)).toEqual({
      left: 675,
      top: 50,
      width: 450,
      height: 900,
    });
  });

  it("loại trừ letterbox trên dưới của ảnh siêu rộng", () => {
    expect(getContainedImageRect(container, 2400, 600)).toEqual({
      left: 100,
      top: 300,
      width: 1600,
      height: 400,
    });
  });

  it("trả null khi thiếu kích thước ảnh nguồn", () => {
    expect(getContainedImageRect(container, 0, 1080)).toBeNull();
  });
});
