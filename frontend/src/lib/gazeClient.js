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

function cameraErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Trình duyệt chưa được cấp quyền camera.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Không tìm thấy camera trên thiết bị.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera đang được ứng dụng khác sử dụng.";
  }
  return error?.message || "Không thể mở camera.";
}

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
      setAiStatus(response.ok ? "Sẵn sàng" : "Chưa kết nối", response.ok);
      return response.ok;
    } catch {
      setAiStatus("Chưa kết nối", false);
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

  function lessonPointMetadata(viewportX, viewportY, zoneEl) {
    const lessonContext = window.__ELA_LESSON_CONTEXT__ || {};
    const slideCanvas = document.querySelector(".slide-canvas");
    const rect = slideCanvas?.getBoundingClientRect();
    const hasSlideRect = rect && rect.width > 0 && rect.height > 0;
    const slideXNorm = hasSlideRect ? (viewportX - rect.left) / rect.width : null;
    const slideYNorm = hasSlideRect ? (viewportY - rect.top) / rect.height : null;
    const inSlideCanvas = Boolean(
      hasSlideRect &&
      slideXNorm >= 0 &&
      slideXNorm <= 1 &&
      slideYNorm >= 0 &&
      slideYNorm <= 1
    );
    const inReliableRegion =
      viewportX >= window.innerWidth * 0.1 &&
      viewportX <= window.innerWidth * 0.9 &&
      viewportY >= window.innerHeight * 0.12 &&
      viewportY <= window.innerHeight * 0.88;

    return {
      slide_id: lessonContext.slideId || null,
      course_id: lessonContext.courseId || null,
      module_id: lessonContext.moduleId || null,
      activity_id: lessonContext.activityId || null,
      content_version_id: lessonContext.contentVersionId || null,
      stimulus_id: lessonContext.stimulusId || null,
      slide_index: lessonContext.slideIndex ?? null,
      slide_title: lessonContext.slideTitle || null,
      slide_type: lessonContext.slideType || null,
      slide_x_norm: inSlideCanvas ? clamp(slideXNorm, 0, 1) : null,
      slide_y_norm: inSlideCanvas ? clamp(slideYNorm, 0, 1) : null,
      stimulus_bounds: hasSlideRect
        ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }
        : null,
      in_slide_canvas: inSlideCanvas,
      in_reliable_region: inReliableRegion,
      is_transitioning: Boolean(lessonContext.isTransitioning),
      ui_interaction: Boolean(zoneEl && !["transcript_panel", "video_area", "quiz_area"].includes(zoneEl.dataset.zone)),
      target_zone: zoneEl?.dataset.zone || null,
    };
  }

  function gazeEventFromPrediction(prediction) {
    const ctx = getContext();
    const xNorm = Number(prediction.x);
    const yNorm = Number(prediction.y);
    if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

    const viewportX = clamp(xNorm * window.innerWidth, 0, window.innerWidth - 1);
    const viewportY = clamp(yNorm * window.innerHeight, 0, window.innerHeight - 1);
    const zoneEl = document.elementFromPoint(viewportX, viewportY)?.closest("[data-zone]");
    const metadata = lessonPointMetadata(viewportX, viewportY, zoneEl);
    const now = Date.now();
    return {
      event_id: `gaze_${ctx.session_id}_${now}`,
      session_id: ctx.session_id,
      lesson_id: ctx.lesson_id,
      course_id: ctx.course_id || metadata.course_id || null,
      module_id: ctx.module_id || metadata.module_id || null,
      activity_id: ctx.activity_id || metadata.activity_id || null,
      content_version_id: ctx.content_version_id || metadata.content_version_id || null,
      stimulus_id: metadata.stimulus_id || null,
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
      stimulus_x_norm: metadata.slide_x_norm,
      stimulus_y_norm: metadata.slide_y_norm,
      stimulus_left: metadata.stimulus_bounds?.left ?? null,
      stimulus_top: metadata.stimulus_bounds?.top ?? null,
      stimulus_width: metadata.stimulus_bounds?.width ?? null,
      stimulus_height: metadata.stimulus_bounds?.height ?? null,
      tracking_quality: metadata.in_reliable_region ? "reliable" : "outside_reliable_region",
      screen_x: typeof window.screenX === "number" ? window.screenX + viewportX : null,
      screen_y: typeof window.screenY === "number" ? window.screenY + viewportY : null,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      zoom: window.visualViewport?.scale || 1,
      fullscreen: Boolean(document.fullscreenElement),
      target_zone: zoneEl?.dataset.zone || null,
      confidence: 1,
      gaze_status: "valid",
      metadata_json: metadata,
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

  function resetSequenceForRun() {
    // Tránh đụng unique(session_id, seq) khi user refresh/resume cùng session.
    // Không ảnh hưởng AI inference, chỉ là idempotency cho raw chunk backup.
    seq = Math.floor(Date.now() / 1000);
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
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let responseText = response.ok ? "" : await response.text();
    let saveTarget = "/gaze/chunks";

    if (!response.ok) {
      response = await fetch(apiUrl("/tracking/points"), {
        method: "POST",
        credentials: "include",
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
      setStatus("Chưa có phiên học để ghi nhận camera.", "error");
      return;
    }
    if (!calibrationReady()) {
      setStatus(calibrationMessage(), "error");
      return;
    }

    const aiOk = await checkAi();
    if (!aiOk) {
      setStatus("Chưa kết nối được dịch vụ eye-tracking.", "error");
      return;
    }

    try {
      const cfg = await loadClientConfig();
      setStatus("Đang mở camera...");
      await startCamera();
      setStatus("Đang kết nối eye-tracking...");
      const separator = cfg.ai_ws_url.includes("?") ? "&" : "?";
      ws = new WebSocket(`${cfg.ai_ws_url}${separator}session_id=${encodeURIComponent(ctx.session_id)}`);

	    ws.addEventListener("open", () => {
	        running = true;
	        resetSequenceForRun();
	        setStatus("Đang ghi nhận ánh nhìn.", "ok");
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
	        if (running) setStatus("Kết nối eye-tracking đã dừng.", "error");
	        stopGaze();
	      });

	      ws.addEventListener("error", () => {
	        setStatus("Không thể kết nối eye-tracking.", "error");
	        stopGaze();
	      });
	    } catch (error) {
	      setStatus(cameraErrorMessage(error), "error");
	      stopGaze();
	    }
  }

  async function stopGaze() {
    running = false;
    waitingForInference = false;
    if (frameTimer) window.clearInterval(frameTimer);
    if (chunkTimer) window.clearInterval(chunkTimer);
    frameTimer = null;
    chunkTimer = null;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
    stopCamera();
    updateDebugDot(null);
    await sendChunk().catch(() => {});
  }

  function setDebugDotVisible(visible) {
    debugDotVisible = visible;
    if (!visible) updateDebugDot(null);
  }

  function destroy() {
    stopGaze().catch(() => {});
  }

  return { checkAi, startGaze, stopGaze, setDebugDotVisible, destroy };
}
