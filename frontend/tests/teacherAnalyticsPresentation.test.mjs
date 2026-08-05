import test from "node:test";
import assert from "node:assert/strict";

import { formatPercent, formatSeconds, summarizeLanding } from "../src/lib/teacherAnalyticsPresentation.js";

test("formatPercent returns dash for unavailable values", () => {
  assert.equal(formatPercent(null), "—");
});

test("formatSeconds formats minutes and seconds", () => {
  assert.equal(formatSeconds(125), "2 phút 5 giây");
});

test("summarizeLanding aggregates sessions and tracking", () => {
  const summary = summarizeLanding([
    { total_sessions: 3, lessons: [{ lesson_id: "L1", students_started: 1, valid_tracking_rate: 0.5 }] },
    { total_sessions: 1, lessons: [{ lesson_id: "L2", students_started: 2, valid_tracking_rate: 1 }] },
  ]);
  assert.equal(summary.totalSessions, 4);
  assert.equal(summary.validTrackingRate, 0.75);
});
