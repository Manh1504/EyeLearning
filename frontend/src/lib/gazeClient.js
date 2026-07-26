// Port từ static/js/gaze_client.js. Nhận refs {video, canvas, dot} + callbacks
// setStatus/setAiStatus/getSessionContext để tách khỏi DOM toàn cục.
import { apiUrl, loadClientConfig } from "./api.js";

const GAZE_INTERVAL_MS = 100;   // 10Hz — tăng từ 200ms (5Hz) cho mượt hơn.
                                 // An toàn vì waitingForInference tự throttle theo
                                 // tốc độ AI Service thật — nếu AI xử lý chậm hơn
                                 // 100ms/frame, tick bị bỏ qua chứ không dồn hàng đợi.
const CHUNK_INTERVAL_MS = 2000;
const MAX_CHUNK_POINTS = 30;    // ở 10Hz, 2s window ~20 điểm — vẫn dưới ngưỡng này,
                                 // không cần đổi (chunk vẫn flush theo timer, không bị
                                 // flush sớm do đầy buffer).

export function createGazeClient({ refs, getContext, setStatus, setAiStatus, calibrationReady, calibrationMessage }) {
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

  async function checkAi() {
    try {
      const cfg = await loadClientConfig();
      const response = await fetch(`${cfg.ai_http_url}/health_check`);
      setAiStatus(response.ok ? "AI connected" : "AI not connected", response.ok);
      return response.ok;
    } catch {
      setAiStatus("AI service not connected. Start AI service on port 9000.", false);
      return false;
    }
  }

  async function startCamera() {
    if (stream) return;
    const video = refs.video.current;
    if (!video) throw new Error("Gaze video element is missing.");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (refs.video.current) refs.video.current.srcObject = null;
  }

  function frameBlob() {
    const video = refs.video.current;
    const canvas = refs.canvas.current;
    if (!video || !canvas) throw new Error("Gaze capture elements are missing.");
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function gazeEventFromPrediction(prediction) {
    const ctx = getContext();
    const xNorm = Number(prediction.x);
    const yNorm = Number(prediction.y);
    if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

    const viewportX = clamp(xNorm * window.innerWidth, 0, window.innerWidth - 1);
    const viewportY = clamp(yNorm * window.innerHeight, 0, window.innerHeight - 1);
    const zoneEl = document.elementFromPoint(viewportX, viewportY)?.closest("[data-zone]");
    const now = Date.now();
    return {
      event_id: `gaze_${ctx.session_id}_${now}`,
      session_id: ctx.session_id,
      lesson_id: ctx.lesson_id,
      user_id: ctx.student_code ? `U_${ctx.student_code}` : null,
      student_code: ctx.student_code,
      full_name: ctx.full_name,
      timestamp_ms: now,
      viewport_x: viewportX,
      viewport_y: viewportY,
      x: viewportX,
      y: viewportY,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY,
      target_zone: zoneEl?.dataset.zone || null,
      confidence: 1,
      gaze_status: "valid",
    };
  }

  function updateDebugDot(point) {
    const dot = refs.dot.current;
    if (!dot) return;
    dot.hidden = !debugDotVisible || !point;
    if (!debugDotVisible || !point) return;
    dot.style.left = `${point.viewport_x}px`;
    dot.style.top = `${point.viewport_y}px`;
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
    const ctx = getContext();
    const points = chunkBuffer.slice();
    const payload = {
      session_id: ctx.session_id,
      lesson_id: ctx.lesson_id,
      seq,
      start_ms: chunkStartMs || points[0].timestamp_ms,
      points,
      data: points,
    };

    let response = await fetch(apiUrl("/gaze/chunks"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let responseText = response.ok ? "" : await response.text();
    let saveTarget = "/gaze/chunks";

    if (!response.ok) {
      response = await fetch(apiUrl("/tracking/points"), {
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

    window.dispatchEvent(
      new CustomEvent("eyelearn:gaze-chunk-saved", {
        detail: { session_id: ctx.session_id, seq: payload.seq, n_points: points.length },
      })
    );
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
    const ctx = getContext();
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
      const cfg = await loadClientConfig();
      await startCamera();
      const separator = cfg.ai_ws_url.includes("?") ? "&" : "?";
      ws = new WebSocket(`${cfg.ai_ws_url}${separator}session_id=${encodeURIComponent(ctx.session_id)}`);

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

  function setDebugDotVisible(visible) {
    debugDotVisible = visible;
    if (!visible) updateDebugDot(null);
  }

  function destroy() {
    stopGaze();
  }

  return { checkAi, startGaze, stopGaze, setDebugDotVisible, destroy };
}
