import { describe, it, expect } from "vitest";
import { heatColor, buildHeatLegendGradient } from "@/lib/heatmap-colors";

describe("heatColor", () => {
  it("trả màu xanh ở đầu thang", () => {
    const [r, g, b] = heatColor(0);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("trả màu đỏ ở cuối thang", () => {
    const [r, g, b] = heatColor(1);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("mọi giá trị trả về đều trong [0,255]", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      for (const channel of heatColor(t)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
        expect(Number.isInteger(channel)).toBe(true);
      }
    }
  });

  it("clamp ngoài khoảng [0,1]", () => {
    expect(heatColor(-1)).toEqual(heatColor(0));
    expect(heatColor(2)).toEqual(heatColor(1));
  });
});

describe("buildHeatLegendGradient", () => {
  it("trả chuỗi rỗng khi không có document (môi trường node)", () => {
    expect(buildHeatLegendGradient()).toBe("");
  });
});
