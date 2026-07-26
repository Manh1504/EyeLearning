import { useEffect, useRef, useState } from "react";
import { apiUrl, loadClientConfig } from "../lib/api.js";

const GRID_VALUES = [0.1, 0.5, 0.9];
const CHECKPOINT_NAME_ROWS = [
  ["top-left", "top-center", "top-right"],
  ["middle-left", "center", "middle-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];
const CALIBRATION_POINTS = GRID_VALUES.flatMap((y, rowIndex) =>
  GRID_VALUES.map((x, colIndex) => ({ x, y, name: CHECKPOINT_NAME_ROWS[rowIndex][colIndex] }))
);
const AI_HEALTH_TIMEOUT_MS = 2500;
const CALIBRATION_UPLOAD_TIMEOUT_MS = 120000;

function sessionId() {
  return localStorage.getItem("session_id");
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

export default function CalibrationPage() {
  const currentSession = sessionId();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const clientConfigRef = useRef(null);
  const activeRef = useRef(false);
  const currentIndexRef = useRef(0);
  const capturedPointsRef = useRef([]);
  const capturedFramesRef = useRef([]);
  const lockedSizeRef = useRef({ width: 0, height: 0 });
  const submittingRef = useRef(false);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [status, setStatusState] = useState({ message: "", kind: "" });
  const [aiStatus, setAiStatusState] = useState({ message: "checking", ok: false });
  const [progress, setProgress] = useState(`Point 1 / ${CALIBRATION_POINTS.length}`);
  const [cameraStatus, setCameraStatus] = useState("Camera pending");
  const [captureDisabled, setCaptureDisabled] = useState(false);
  const [backToLessonLabel, setBackToLessonLabel] = useState(currentSession ? "Back to lesson" : "Back to lesson");
  const [dotPos, setDotPos] = useState({ left: 0, top: 0 });

  const setStatus = (message, kind = "") => setStatusState({ message, kind });
  const setAiStatus = (message, ok = false) => setAiStatusState({ message, ok });

  async function loadConfig() {
    const config = await loadClientConfig(true);
    clientConfigRef.current = config;
    return config;
  }

  async function checkAi() {
    try {
      const config = clientConfigRef.current || (await loadConfig());
      const response = await fetchWithTimeout(`${config.ai_http_url}/health_check`, {}, AI_HEALTH_TIMEOUT_MS);
      setAiStatus(response.ok ? "connected" : "not connected", response.ok);
      return response.ok;
    } catch (error) {
      setAiStatus("not connected", false);
      setStatus(
        `${error.message || "AI service not connected."} URL: ${clientConfigRef.current?.ai_http_url || "unknown"}`,
        "error"
      );
      return false;
    }
  }

  function positionDot() {
    const point = CALIBRATION_POINTS[currentIndexRef.current];
    setDotPos({ left: point.x * window.innerWidth, top: point.y * window.innerHeight });
    setProgress(`Point ${currentIndexRef.current + 1} / ${CALIBRATION_POINTS.length}`);
  }

  async function startCamera() {
    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoRef.current.srcObject = mediaStreamRef.current;
    await videoRef.current.play();
    setCameraStatus("Camera ready");
  }

  function stopCamera() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function resetCollection() {
    currentIndexRef.current = 0;
    capturedPointsRef.current = [];
    capturedFramesRef.current = [];
  }

  function cancelCalibration(message = "Calibration canceled.") {
    activeRef.current = false;
    resetCollection();
    stopCamera();
    setOverlayVisible(false);
    setStatus(message, message.includes("changed") ? "error" : "");
  }

  useEffect(() => {
    function guardViewport() {
      if (!activeRef.current) return;
      if (window.innerWidth !== lockedSizeRef.current.width || window.innerHeight !== lockedSizeRef.current.height) {
        cancelCalibration("Viewport changed. Please restart calibration.");
      }
    }
    window.addEventListener("resize", guardViewport);
    return () => window.removeEventListener("resize", guardViewport);
  }, []);

  async function captureFrameBlob() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  }

  async function submitCalibration() {
    activeRef.current = false;
    submittingRef.current = true;
    setProgress("Uploading calibration...");
    setStatus("Uploading calibration to AI service...");

    const formData = new FormData();
    formData.append("session_id", sessionId());
    formData.append("points", JSON.stringify(capturedPointsRef.current));
    formData.append("viewport_w", String(window.innerWidth));
    formData.append("viewport_h", String(window.innerHeight));
    capturedFramesRef.current.forEach((blob, index) => {
      formData.append("frames", blob, `calibration_${index + 1}.jpg`);
    });

    const response = await fetchWithTimeout(
      `${clientConfigRef.current.ai_http_url}/calibrate`,
      { method: "POST", body: formData },
      CALIBRATION_UPLOAD_TIMEOUT_MS
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      localStorage.removeItem("calibration_ready");
      throw new Error(result.error || `Calibration failed with HTTP ${response.status}.`);
    }

    // Persist calibration xuống Web Service DB — trước đây bước này hoàn
    // toàn thiếu, model chỉ sống trong RAM AI Service (mất khi restart).
    try {
      const persistResponse = await fetch(apiUrl("/calibration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId(),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
          is_fullscreen: Boolean(document.fullscreenElement),
          avg_error_px: result.avg_error_px ?? null,
          model_x_b64: result.model_x_b64,
          model_y_b64: result.model_y_b64,
          model_format: result.model_format || "joblib",
          checkpoints: result.per_point || [],
        }),
      });
      if (!persistResponse.ok) {
        const errText = await persistResponse.text().catch(() => "");
        // Không chặn luồng học nếu persist DB lỗi — AI Service vẫn có model
        // trong RAM để predict, chỉ là mất bản backup DB lần này.
        console.error(`Persist calibration to DB failed: ${persistResponse.status} ${errText}`);
      }
    } catch (persistError) {
      console.error("Persist calibration to DB failed:", persistError);
    }

    localStorage.setItem("calibration_ready", "true");
    localStorage.setItem("calibration_viewport_w", String(window.innerWidth));
    localStorage.setItem("calibration_viewport_h", String(window.innerHeight));
    localStorage.setItem("calibration_is_fullscreen", String(Boolean(document.fullscreenElement)));
    localStorage.setItem("calibration_completed_at", String(Date.now()));
    stopCamera();
    submittingRef.current = false;
    setOverlayVisible(false);
    setBackToLessonLabel("Go to lesson");
    setStatus(`Calibration ready (${result.n_points} valid points).`, "ok");
  }

  async function captureCurrentPoint() {
    if (!activeRef.current) return;
    setCaptureDisabled(true);
    try {
      const target = CALIBRATION_POINTS[currentIndexRef.current];
      const blob = await captureFrameBlob();
      if (!blob) throw new Error("Could not capture webcam frame.");
      capturedPointsRef.current.push({ x: target.x, y: target.y, name: target.name });
      capturedFramesRef.current.push(blob);
      currentIndexRef.current += 1;

      if (currentIndexRef.current >= CALIBRATION_POINTS.length) {
        await submitCalibration();
        return;
      }
      positionDot();
    } catch (error) {
      if (submittingRef.current || !activeRef.current) {
        submittingRef.current = false;
        stopCamera();
        setOverlayVisible(false);
        setProgress(`Point ${CALIBRATION_POINTS.length} / ${CALIBRATION_POINTS.length}`);
      }
      setStatus(error.message, "error");
    } finally {
      setCaptureDisabled(false);
    }
  }

  async function startCalibration() {
    if (!sessionId()) {
      setStatus("Create a session before calibration.", "error");
      return;
    }

    try {
      await loadConfig();
      const aiOk = await checkAi();
      if (!aiOk) return;
      setBackToLessonLabel("Back to lesson");
      setStatus("Calibration started. Keep the window size unchanged.", "ok");
      lockedSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      resetCollection();
      setOverlayVisible(true);
      activeRef.current = true;
      await startCamera();
      positionDot();
    } catch (error) {
      activeRef.current = false;
      stopCamera();
      setOverlayVisible(false);
      setStatus(error.message, "error");
    }
  }

  useEffect(() => {
    function onKeydown(event) {
      if (event.code === "Space" && activeRef.current) {
        event.preventDefault();
        captureCurrentPoint();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConfig()
      .then(checkAi)
      .catch(() => setAiStatus("not connected", false));
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="calibration-page">
      <section className="panel calibration-card" hidden={overlayVisible}>
        <div>
          <h1>Gaze Calibration</h1>
          <p className="muted">Keep this browser window size stable, and look at each dot before capturing.</p>
          <p className="muted calibration-warning">
            Local demo: calibration is stored in AI service memory per session. Production needs persistent
            session-scoped model storage.
          </p>
        </div>
        <div className="qa-strip">
          <span>Session <strong>{currentSession || "none"}</strong></span>
          <span>AI <strong className={aiStatus.ok ? "ok-text" : ""}>{aiStatus.message}</strong></span>
          <span>Points <strong>{CALIBRATION_POINTS.length}</strong></span>
        </div>
        <div className="calibration-actions">
          <button className="btn primary" type="button" onClick={startCalibration}>Start calibration</button>
          <a className="btn" href={currentSession ? "/lesson" : "/"}>{backToLessonLabel}</a>
        </div>
        <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
      </section>

      {overlayVisible && (
        <section className="calibration-overlay">
          <video ref={videoRef} autoPlay playsInline muted hidden></video>
          <canvas ref={canvasRef} hidden></canvas>
          <div className="calibration-topbar">
            <span>{progress}</span>
            <span>{cameraStatus}</span>
            <button className="btn danger" type="button" onClick={() => cancelCalibration()}>Cancel</button>
          </div>
          <div className="calibration-instruction">Look at the dot, then press Space</div>
          <button
            className="calibration-capture-btn"
            type="button"
            disabled={captureDisabled}
            onClick={captureCurrentPoint}
          >
            Capture
          </button>
          <div
            ref={dotRef}
            className="calibration-dot"
            style={{ left: `${dotPos.left}px`, top: `${dotPos.top}px` }}
          ></div>
        </section>
      )}
    </main>
  );
}
