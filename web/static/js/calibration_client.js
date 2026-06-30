const setupEl = document.getElementById("calibrationSetup");
const overlayEl = document.getElementById("calibrationOverlay");
const startBtn = document.getElementById("startCalibrationBtn");
const cancelBtn = document.getElementById("cancelCalibrationBtn");
const captureBtn = document.getElementById("captureCalibrationBtn");
const statusEl = document.getElementById("calibrationStatus");
const aiStatusEl = document.getElementById("calibrationAiStatus");
const sessionLabel = document.getElementById("calibrationSessionLabel");
const progressEl = document.getElementById("calibrationProgress");
const cameraStatusEl = document.getElementById("cameraStatus");
const dotEl = document.getElementById("calibrationDot");
const videoEl = document.getElementById("calibrationVideo");
const canvasEl = document.getElementById("calibrationFrameCanvas");
const backToLessonLink = document.getElementById("backToLessonLink");

const GRID_VALUES = [0.1, 0.3, 0.5, 0.7, 0.9];
const CALIBRATION_POINTS = GRID_VALUES.flatMap((y) => GRID_VALUES.map((x) => ({ x, y })));
const AI_HEALTH_TIMEOUT_MS = 2500;
const CALIBRATION_UPLOAD_TIMEOUT_MS = 120000;

let clientConfig = null;
let mediaStream = null;
let active = false;
let currentIndex = 0;
let capturedPoints = [];
let capturedFrames = [];
let lockedWidth = 0;
let lockedHeight = 0;
let submittingCalibration = false;

function sessionId() {
  return localStorage.getItem("session_id");
}

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

function setAiStatus(message, ok = false) {
  aiStatusEl.textContent = message;
  aiStatusEl.className = ok ? "ok-text" : "";
}

async function loadClientConfig() {
  const response = await fetch("/client-config");
  if (!response.ok) throw new Error("Cannot load client config.");
  clientConfig = await response.json();
  return clientConfig;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI service timeout. Check that the AI container is running.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function checkAi() {
  try {
    const config = clientConfig || await loadClientConfig();
    const response = await fetchWithTimeout(`${config.ai_http_url}/health_check`, {}, AI_HEALTH_TIMEOUT_MS);
    setAiStatus(response.ok ? "connected" : "not connected", response.ok);
    return response.ok;
  } catch (error) {
    setAiStatus("not connected");
    setStatus(`${error.message || "AI service not connected."} URL: ${(clientConfig || {}).ai_http_url || "unknown"}`, "error");
    return false;
  }
}

function positionDot() {
  const point = CALIBRATION_POINTS[currentIndex];
  dotEl.style.left = `${point.x * window.innerWidth}px`;
  dotEl.style.top = `${point.y * window.innerHeight}px`;
  progressEl.textContent = `Point ${currentIndex + 1} / ${CALIBRATION_POINTS.length}`;
}

async function startCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = mediaStream;
  await videoEl.play();
  cameraStatusEl.textContent = "Camera ready";
}

function stopCamera() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  videoEl.srcObject = null;
}

function resetCollection() {
  currentIndex = 0;
  capturedPoints = [];
  capturedFrames = [];
}

function cancelCalibration(message = "Calibration canceled.") {
  active = false;
  resetCollection();
  stopCamera();
  overlayEl.hidden = true;
  setupEl.hidden = false;
  setStatus(message, message.includes("changed") ? "error" : "");
}

function guardViewport() {
  if (!active) return;
  if (window.innerWidth !== lockedWidth || window.innerHeight !== lockedHeight) {
    cancelCalibration("Viewport changed. Please restart calibration.");
  }
}

async function captureFrameBlob() {
  const width = videoEl.videoWidth || 640;
  const height = videoEl.videoHeight || 480;
  canvasEl.width = width;
  canvasEl.height = height;
  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, width, height);
  return new Promise((resolve) => canvasEl.toBlob(resolve, "image/jpeg", 0.9));
}

async function captureCurrentPoint() {
  if (!active) return;
  captureBtn.disabled = true;
  try {
    const target = CALIBRATION_POINTS[currentIndex];
    const blob = await captureFrameBlob();
    if (!blob) throw new Error("Could not capture webcam frame.");
    capturedPoints.push({ x: target.x, y: target.y });
    capturedFrames.push(blob);
    currentIndex += 1;

    if (currentIndex >= CALIBRATION_POINTS.length) {
      await submitCalibration();
      return;
    }
    positionDot();
  } catch (error) {
    if (submittingCalibration || !active) {
      submittingCalibration = false;
      stopCamera();
      overlayEl.hidden = true;
      setupEl.hidden = false;
      progressEl.textContent = `Point ${CALIBRATION_POINTS.length} / ${CALIBRATION_POINTS.length}`;
    }
    setStatus(error.message, "error");
  } finally {
    captureBtn.disabled = false;
  }
}

async function submitCalibration() {
  active = false;
  submittingCalibration = true;
  progressEl.textContent = "Uploading calibration...";
  setStatus("Uploading calibration to AI service...");
  const formData = new FormData();
  formData.append("session_id", sessionId());
  formData.append("points", JSON.stringify(capturedPoints));
  capturedFrames.forEach((blob, index) => {
    formData.append("frames", blob, `calibration_${index + 1}.jpg`);
  });

  const response = await fetchWithTimeout(
    `${clientConfig.ai_http_url}/calibrate`,
    {
      method: "POST",
      body: formData,
    },
    CALIBRATION_UPLOAD_TIMEOUT_MS,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    localStorage.removeItem("calibration_ready");
    throw new Error(result.error || `Calibration failed with HTTP ${response.status}.`);
  }

  localStorage.setItem("calibration_ready", "true");
  localStorage.setItem("calibration_viewport_w", String(window.innerWidth));
  localStorage.setItem("calibration_viewport_h", String(window.innerHeight));
  localStorage.setItem("calibration_is_fullscreen", String(Boolean(document.fullscreenElement)));
  localStorage.setItem("calibration_completed_at", String(Date.now()));
  stopCamera();
  submittingCalibration = false;
  overlayEl.hidden = true;
  setupEl.hidden = false;
  backToLessonLink.textContent = "Go to lesson";
  setStatus(`Calibration ready (${result.n_points} valid points).`, "ok");
}

async function startCalibration() {
  if (!sessionId()) {
    setStatus("Create a session before calibration.", "error");
    return;
  }

  try {
    await loadClientConfig();
    const aiOk = await checkAi();
    if (!aiOk) return;
    backToLessonLink.textContent = "Back to lesson";
    setStatus("Calibration started. Keep the window size unchanged.", "ok");
    lockedWidth = window.innerWidth;
    lockedHeight = window.innerHeight;
    resetCollection();
    setupEl.hidden = true;
    overlayEl.hidden = false;
    active = true;
    await startCamera();
    positionDot();
  } catch (error) {
    active = false;
    stopCamera();
    setupEl.hidden = false;
    overlayEl.hidden = true;
    setStatus(error.message, "error");
  }
}

startBtn.addEventListener("click", startCalibration);
cancelBtn.addEventListener("click", () => cancelCalibration());
captureBtn.addEventListener("click", captureCurrentPoint);
window.addEventListener("resize", guardViewport);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && active) {
    event.preventDefault();
    captureCurrentPoint();
  }
});

const currentSession = sessionId();
sessionLabel.textContent = currentSession || "none";
backToLessonLink.href = currentSession ? "/lesson" : "/";
loadClientConfig().then(checkAi).catch(() => setAiStatus("not connected"));
