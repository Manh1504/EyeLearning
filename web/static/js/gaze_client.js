const GAZE_INTERVAL_MS = 200;
const CHUNK_INTERVAL_MS = 2000;
const MAX_CHUNK_POINTS = 30;

let config = null;
let stream = null;
let ws = null;
let running = false;
let waitingForInference = false;
let frameTimer = null;
let chunkTimer = null;
let seq = 0;
let chunkBuffer = [];
let chunkStartMs = null;
let debugDotVisible = false;

const gazeStatus = document.getElementById("gazeStatus");
const startGazeBtn = document.getElementById("startGazeBtn");
const stopGazeBtn = document.getElementById("stopGazeBtn");
const goCalibrationBtn = document.getElementById("goCalibrationBtn");
const gazeDebugDotToggle = document.getElementById("gazeDebugDotToggle");
const gazeAiStatus = document.getElementById("gazeAiStatus");
const gazeVideo = document.getElementById("gazeVideo");
const gazeCanvas = document.getElementById("gazeFrameCanvas");
const gazeDot = document.getElementById("gazeDebugDot");

function context() {
  return {
    session_id: localStorage.getItem("session_id"),
    lesson_id: localStorage.getItem("lesson_id") || "L001",
    student_code: localStorage.getItem("student_code"),
    full_name: localStorage.getItem("full_name"),
  };
}

function setStatus(message, kind = "") {
  if (!gazeStatus) return;
  gazeStatus.textContent = message;
  gazeStatus.className = `status-line ${kind}`.trim();
}

function setAiStatus(message, ok = false) {
  if (!gazeAiStatus) return;
  gazeAiStatus.textContent = message;
  gazeAiStatus.className = ok ? "ok-text" : "";
}

async function loadConfig() {
  if (config) return config;
  const response = await fetch("/client-config");
  if (!response.ok) throw new Error("Cannot load client config.");
  config = await response.json();
  return config;
}

async function checkAi() {
  try {
    const cfg = await loadConfig();
    const response = await fetch(`${cfg.ai_http_url}/health_check`);
    const payload = await response.json().catch(() => ({}));
    const ready = response.ok && payload.pipeline_loaded === true;
    setAiStatus(ready ? "AI connected" : "AI not connected", ready);
    return ready;
  } catch {
    setAiStatus("AI service not connected. Start AI service on port 9000.");
    return false;
  }
}

function calibrationReady() {
  if (localStorage.getItem("calibration_ready") !== "true") return false;
  const width = Number(localStorage.getItem("calibration_viewport_w"));
  const height = Number(localStorage.getItem("calibration_viewport_h"));
  return width === window.innerWidth && height === window.innerHeight;
}

function calibrationMessage() {
  if (localStorage.getItem("calibration_ready") !== "true") {
    return "Calibration required before gaze tracking.";
  }
  return "Viewport changed after calibration. Please recalibrate.";
}

async function startCamera() {
  if (stream) return;
  if (!gazeVideo) throw new Error("Gaze video element is missing.");
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  gazeVideo.srcObject = stream;
  await gazeVideo.play();
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (gazeVideo) gazeVideo.srcObject = null;
}

function frameBlob() {
  if (!gazeVideo || !gazeCanvas) throw new Error("Gaze capture elements are missing.");
  const width = gazeVideo.videoWidth || 640;
  const height = gazeVideo.videoHeight || 480;
  gazeCanvas.width = width;
  gazeCanvas.height = height;
  gazeCanvas.getContext("2d").drawImage(gazeVideo, 0, 0, width, height);
  return new Promise((resolve) => gazeCanvas.toBlob(resolve, "image/jpeg", 0.85));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gazeEventFromPrediction(prediction) {
  const ctx = context();
  const xNorm = Number(prediction.x);
  const yNorm = Number(prediction.y);
  if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

  const rawViewportX = xNorm * window.innerWidth;
  const rawViewportY = yNorm * window.innerHeight;
  const insideViewport =
    rawViewportX >= 0 &&
    rawViewportX < window.innerWidth &&
    rawViewportY >= 0 &&
    rawViewportY < window.innerHeight;
  const zoneEl = insideViewport
    ? document.elementFromPoint(rawViewportX, rawViewportY)?.closest("[data-zone]")
    : null;
  const confidence = Number.isFinite(Number(prediction.confidence)) ? Number(prediction.confidence) : null;
  const now = Date.now();
  return {
    event_id: `gaze_${ctx.session_id}_${now}`,
    session_id: ctx.session_id,
    lesson_id: ctx.lesson_id,
    user_id: ctx.student_code ? `U_${ctx.student_code}` : null,
    student_code: ctx.student_code,
    full_name: ctx.full_name,
    timestamp_ms: now,
    viewport_x: rawViewportX,
    viewport_y: rawViewportY,
    x: rawViewportX,
    y: rawViewportY,
    scroll_x: window.scrollX,
    scroll_y: window.scrollY,
    target_zone: zoneEl?.dataset.zone || null,
    confidence,
    gaze_status: "predicted",
    metadata_json: {
      inside_viewport: insideViewport,
      prediction_available: true,
    },
  };
}

function updateDebugDot(point) {
  if (!gazeDot) return;
  gazeDot.hidden = !debugDotVisible || !point;
  if (!debugDotVisible || !point) return;
  const displayX = clamp(point.viewport_x, 0, window.innerWidth - 1);
  const displayY = clamp(point.viewport_y, 0, window.innerHeight - 1);
  gazeDot.style.left = `${displayX}px`;
  gazeDot.style.top = `${displayY}px`;
}

function publishPoint(point) {
  window.tracking_events = window.tracking_events || [];
  window.tracking_events.push(point);
  chunkBuffer.push(point);
  if (!chunkStartMs) chunkStartMs = point.timestamp_ms;
  const added = window.liveHeatmap?.addPoint(point);
  if (!added) {
    window.dispatchEvent(new CustomEvent("eyelearn:tracking-point", { detail: point }));
  }
  updateDebugDot(point);
}

async function sendChunk() {
  if (!chunkBuffer.length) return;
  const ctx = context();
  const points = chunkBuffer.slice();
  const payload = {
    session_id: ctx.session_id,
    lesson_id: ctx.lesson_id,
    seq,
    start_ms: chunkStartMs || points[0].timestamp_ms,
    points,
    data: points,
  };

  let response = await fetch("/gaze/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let responseText = response.ok ? "" : await response.text();
  let saveTarget = "/gaze/chunks";

  if (!response.ok) {
    response = await fetch("/tracking/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(points),
    });
    responseText = response.ok ? "" : await response.text();
    saveTarget = "/tracking/points";
  }

  if (!response.ok) {
    setStatus(`Gaze save failed ${saveTarget} ${response.status}: ${responseText || response.statusText}`, "error");
    return;
  }

  chunkBuffer = [];
  chunkStartMs = null;
  seq += 1;

  window.dispatchEvent(new CustomEvent("eyelearn:gaze-chunk-saved", {
    detail: { session_id: ctx.session_id, seq: payload.seq, n_points: points.length },
  }));
}

async function sendFrame() {
  if (!running || waitingForInference || !ws || ws.readyState !== WebSocket.OPEN) return;
  waitingForInference = true;
  try {
    const blob = await frameBlob();
    if (blob) ws.send(await blob.arrayBuffer());
  } catch (error) {
    waitingForInference = false;
    setStatus(`Frame capture failed: ${error.message}`, "error");
  }
}

async function startGaze() {
  if (running) return;
  const ctx = context();
  if (!ctx.session_id) {
    setStatus("Create a session before gaze tracking.", "error");
    return;
  }
  if (!calibrationReady()) {
    setStatus(calibrationMessage(), "error");
    return;
  }

  const aiOk = await checkAi();
  if (!aiOk) return;

  try {
    const cfg = await loadConfig();
    await startCamera();
    const tokenPayload = await fetch(`/sessions/${encodeURIComponent(ctx.session_id)}/tracking-token`, {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    });
    const separator = cfg.ai_ws_url.includes("?") ? "&" : "?";
    ws = new WebSocket(`${cfg.ai_ws_url}${separator}session_id=${encodeURIComponent(ctx.session_id)}&token=${encodeURIComponent(tokenPayload.token)}`);

    ws.addEventListener("open", () => {
      running = true;
      setStatus("Real gaze tracking started.", "ok");
      frameTimer = window.setInterval(sendFrame, GAZE_INTERVAL_MS);
      chunkTimer = window.setInterval(sendChunk, CHUNK_INTERVAL_MS);
    });

    ws.addEventListener("message", (event) => {
      waitingForInference = false;
      const data = JSON.parse(event.data);
      if (data.error) {
        setStatus(data.error, "error");
        return;
      }
      const point = gazeEventFromPrediction(data);
      if (point) publishPoint(point);
      if (chunkBuffer.length >= MAX_CHUNK_POINTS) sendChunk().catch(() => {});
    });

    ws.addEventListener("close", () => {
      if (running) setStatus("Gaze connection closed.", "error");
      stopGaze();
    });

    ws.addEventListener("error", () => {
      setStatus("Gaze WebSocket error.", "error");
      stopGaze();
    });
  } catch (error) {
    setStatus(error.message, "error");
    stopGaze();
  }
}

function stopGaze() {
  running = false;
  waitingForInference = false;
  if (frameTimer) window.clearInterval(frameTimer);
  if (chunkTimer) window.clearInterval(chunkTimer);
  frameTimer = null;
  chunkTimer = null;
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  ws = null;
  sendChunk().catch(() => {});
  stopCamera();
  updateDebugDot(null);
}

startGazeBtn?.addEventListener("click", startGaze);
stopGazeBtn?.addEventListener("click", () => {
  stopGaze();
  setStatus("Gaze tracking stopped.");
});
goCalibrationBtn?.addEventListener("click", () => {
  window.location.href = "/calibration";
});
gazeDebugDotToggle?.addEventListener("change", () => {
  debugDotVisible = gazeDebugDotToggle.checked;
  if (!debugDotVisible) updateDebugDot(null);
});

checkAi();
