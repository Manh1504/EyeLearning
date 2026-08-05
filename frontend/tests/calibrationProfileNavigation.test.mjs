import test from "node:test";
import assert from "node:assert/strict";

import {
  calibrationProfileReturnTo,
  currentInternalReturnTo,
  validateCalibrationProfileReturnTo,
} from "../src/lib/calibrationProfileNavigation.js";

test("return from preparation preserves camera-check route context", () => {
  const returnTo = currentInternalReturnTo({
    pathname: "/camera-check",
    search: "?course=C001&lesson=L001",
    hash: "#profile",
  });
  assert.equal(returnTo, "/camera-check?course=C001&lesson=L001#profile");
  assert.equal(calibrationProfileReturnTo({ locationState: { returnTo } }), returnTo);
});

test("return from account menu falls back to courses when no account page exists", () => {
  assert.equal(calibrationProfileReturnTo({ locationState: { returnTo: "/courses" } }), "/courses");
});

test("direct calibration profile route falls back to courses", () => {
  assert.equal(calibrationProfileReturnTo({}), "/courses");
});

test("invalid or external return URL is rejected", () => {
  assert.equal(validateCalibrationProfileReturnTo("https://example.com/courses"), "/courses");
  assert.equal(validateCalibrationProfileReturnTo("//example.com/courses"), "/courses");
  assert.equal(validateCalibrationProfileReturnTo("/admin"), "/courses");
});
