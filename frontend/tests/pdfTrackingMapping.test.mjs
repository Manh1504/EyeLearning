import test from "node:test";
import assert from "node:assert/strict";

import { mapViewportPointToPdfPage } from "../src/lib/pdfTrackingMapping.js";
import { buildDensityGrid } from "../src/lib/heatmapCanvas.js";
import {
  shouldAutoStartTracking,
  shouldIgnoreRenderCompletion,
  stablePageKey,
  trackingToolbarLabel,
} from "../src/lib/lessonPlayerLifecycle.js";

test("gaze maps to correct visible page", () => {
  const result = mapViewportPointToPdfPage(50, 50, [
    { pageNumber: 1, left: 0, top: 0, width: 100, height: 100 },
    { pageNumber: 2, left: 0, top: 120, width: 100, height: 100 },
  ]);
  assert.equal(result.pageNumber, 1);
  assert.equal(result.ignored, false);
});

test("gaze between pages is ignored", () => {
  const result = mapViewportPointToPdfPage(50, 110, [
    { pageNumber: 1, left: 0, top: 0, width: 100, height: 100 },
    { pageNumber: 2, left: 0, top: 120, width: 100, height: 100 },
  ]);
  assert.equal(result.ignored, true);
});

test("resize or rendering state excludes sample", () => {
  const result = mapViewportPointToPdfPage(50, 50, [{ pageNumber: 1, left: 0, top: 0, width: 100, height: 100 }], { isResizing: true });
  assert.equal(result.reason, "layout_unstable");
});

test("density grid preserves relative placement", () => {
  const grid = buildDensityGrid([{ x_normalized: 0.5, y_normalized: 0.5, confidence: 1, weight: 1 }], 10, 10);
  assert.ok(grid[5][5] > 0);
});

test("stablePageKey includes document version", () => {
  assert.equal(stablePageKey("v3", 15), "v3:15");
  assert.equal(stablePageKey("", 2), "unknown:2");
});

test("auto start tracking only runs when lesson player is fully ready", () => {
  assert.equal(
    shouldAutoStartTracking({
      sessionId: "S1",
      calibrationReady: true,
      calibrationProfileId: "CP1",
      pdfLoaded: true,
      firstVisiblePageRendered: true,
      aiReady: true,
      isResizing: false,
      trackingState: "PAUSED",
      attemptKey: "S1:v1:CP1",
      attemptedKeys: new Set(),
    }),
    true
  );

  assert.equal(
    shouldAutoStartTracking({
      sessionId: "S1",
      calibrationReady: true,
      calibrationProfileId: "CP1",
      pdfLoaded: true,
      firstVisiblePageRendered: false,
      aiReady: true,
      isResizing: false,
      trackingState: "PAUSED",
      attemptKey: "S1:v1:CP1",
      attemptedKeys: new Set(),
    }),
    false
  );
});

test("stale render completion is ignored", () => {
  assert.equal(shouldIgnoreRenderCompletion(1, 2), true);
  assert.equal(shouldIgnoreRenderCompletion(4, 4), false);
});

test("tracking toolbar labels stay human readable", () => {
  assert.equal(trackingToolbarLabel("CONNECTING"), "Đang kết nối eye-tracking");
  assert.equal(trackingToolbarLabel("ACTIVE"), "Đang theo dõi");
  assert.equal(trackingToolbarLabel("SAVE_FAILED"), "Dữ liệu chưa được lưu");
});
