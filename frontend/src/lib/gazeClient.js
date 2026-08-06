// Port từ static/js/gaze_client.js. Nhận refs {video, canvas, dot} + callbacks
// setStatus/setAiStatus/getSessionContext để tách khỏi DOM toàn cục.
import { apiUrl, loadClientConfig } from "./api.js";
import { mapViewportPointToPdfPage } from "./pdfTrackingMapping.js";

const GAZE_INTERVAL_MS = 100;   // 10Hz — tăng từ 200ms (5Hz) cho mượt hơn.
                                 // An toàn vì waitingForInference tự throttle theo
                                 // tốc độ AI Service thật — nếu AI xử lý chậm hơn
                                 // 100ms/frame, tick bị bỏ qua chứ không dồn hàng đợi.
const CHUNK_INTERVAL_MS = 2000;
const MAX_CHUNK_POINTS = 30;    // ở 10Hz, 2s window ~20 điểm — vẫn dưới ngưỡng này,
                                 // không cần đổi (chunk vẫn flush theo timer, không bị
                                 // flush sớm do đầy buffer).
const MAX_PENDING_CHUNKS = 100;
const RELIABLE_REGION_INSET_X = 0.12;
const RELIABLE_REGION_INSET_TOP = 0.12;
const RELIABLE_REGION_INSET_BOTTOM = 0.12;

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

export function createGazeClient({ refs, getContext, setStatus, setAiStatus, calibrationReady, calibrationMessage, setTrackingState }) {
  let stream = null;
  let ws = null;
  let running = false;
  let waitingForInference = false;
  let frameTimer = null;
  let chunkTimer = null;
  let seq = 0;
  let chunkBuffer = [];
  let chunkStartMs = null;
  let pendingChunks = [];
  let flushPromise = null;
  let debugDotVisible = false;

  async function checkAi() {
    try {
      const cfg = await loadClientConfig();
      const response = await fetch(`${cfg.ai_http_url}/health_check`);
      const payload = await response.json().catch(() => ({}));
      const ready = response.ok && payload.pipeline_loaded === true;
      setAiStatus(ready ? "Sẵn sàng" : "Chưa kết nối", ready);
      return ready;
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
    const pdfContext = window.__ELA_PDF_CONTEXT__ || null;
    const lessonContext = window.__ELA_LESSON_CONTEXT__ || {};
    const pageRects = [...document.querySelectorAll("[data-page-number][data-zone='pdf_page']")].map((page) => {
      const rect = page.getBoundingClientRect();
      return { pageNumber: page.dataset.pageNumber, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const pageMatch = mapViewportPointToPdfPage(viewportX, viewportY, pageRects, {
      isTransitioning: Boolean(pdfContext?.isTransitioning || lessonContext.isTransitioning),
      isResizing: Boolean(pdfContext?.isResizing),
      isRendering: Boolean(pdfContext?.isRendering),
    });
    const inPdfPage = !pageMatch.ignored;

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
      viewportX >= window.innerWidth * RELIABLE_REGION_INSET_X &&
      viewportX <= window.innerWidth * (1 - RELIABLE_REGION_INSET_X) &&
      viewportY >= window.innerHeight * RELIABLE_REGION_INSET_TOP &&
      viewportY <= window.innerHeight * (1 - RELIABLE_REGION_INSET_BOTTOM);

    return {
      slide_id: lessonContext.slideId || null,
      course_id: pdfContext?.courseId || lessonContext.courseId || null,
      course_item_id: pdfContext?.courseItemId || null,
      pdf_lesson_id: pdfContext?.pdfLessonId || null,
      page_number: inPdfPage ? pageMatch.pageNumber : null,
      page_x_normalized: inPdfPage ? pageMatch.pageXNormalized : null,
      page_y_normalized: inPdfPage ? pageMatch.pageYNormalized : null,
      page_display_width: inPdfPage ? pageMatch.pageDisplayWidth : null,
      page_display_height: inPdfPage ? pageMatch.pageDisplayHeight : null,
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
      in_pdf_page: inPdfPage,
      in_reliable_region: inReliableRegion,
      is_transitioning: Boolean(pdfContext?.isTransitioning || lessonContext.isTransitioning || pageMatch.ignored),
      ui_interaction: Boolean(zoneEl && zoneEl.dataset.zone !== "pdf_page"),
      target_zone: inPdfPage ? "pdf_page" : zoneEl?.dataset.zone || null,
    };
  }

  function gazeEventFromPrediction(prediction) {
    const ctx = getContext();
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
    const metadata = lessonPointMetadata(rawViewportX, rawViewportY, zoneEl);
    const confidence = Number.isFinite(Number(prediction.confidence)) ? Number(prediction.confidence) : null;
    const now = Date.now();
    return {
      event_id: `gaze_${ctx.session_id}_${now}`,
      session_id: ctx.session_id,
      lesson_id: ctx.lesson_id,
      course_id: ctx.course_id || metadata.course_id || null,
      course_item_id: ctx.course_item_id || metadata.course_item_id || null,
      pdf_lesson_id: ctx.pdf_lesson_id || metadata.pdf_lesson_id || null,
      pdf_document_version: ctx.pdf_document_version || null,
      test_id: ctx.test_id || null,
      module_id: ctx.module_id || metadata.module_id || null,
      activity_id: ctx.activity_id || metadata.activity_id || null,
      content_version_id: ctx.content_version_id || metadata.content_version_id || null,
      stimulus_id: metadata.stimulus_id || null,
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
      stimulus_x_norm: metadata.slide_x_norm,
      stimulus_y_norm: metadata.slide_y_norm,
      stimulus_left: metadata.stimulus_bounds?.left ?? null,
      stimulus_top: metadata.stimulus_bounds?.top ?? null,
      stimulus_width: metadata.stimulus_bounds?.width ?? null,
      stimulus_height: metadata.stimulus_bounds?.height ?? null,
      page_number: metadata.page_number,
      page_x_normalized: metadata.page_x_normalized,
      page_y_normalized: metadata.page_y_normalized,
      page_display_width: metadata.page_display_width,
      page_display_height: metadata.page_display_height,
      tracking_quality: metadata.in_reliable_region ? "reliable" : "outside_reliable_region",
      screen_x: typeof window.screenX === "number" ? window.screenX + rawViewportX : null,
      screen_y: typeof window.screenY === "number" ? window.screenY + rawViewportY : null,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      zoom: window.visualViewport?.scale || 1,
      fullscreen: Boolean(document.fullscreenElement),
      target_zone: zoneEl?.dataset.zone || null,
      confidence,
      gaze_status: "predicted",
      metadata_json: {
        ...metadata,
        inside_viewport: insideViewport,
        prediction_available: true,
      },
    };
  }

  function updateDebugDot(point) {
    const dot = refs.dot.current;
    if (!dot) return;
    dot.hidden = !debugDotVisible || !point;
    if (!debugDotVisible || !point) return;
    const displayX = clamp(point.viewport_x, 0, window.innerWidth - 1);
    const displayY = clamp(point.viewport_y, 0, window.innerHeight - 1);
    dot.style.left = `${displayX}px`;
    dot.style.top = `${displayY}px`;
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

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function sealCurrentChunk() {
    if (!chunkBuffer.length) return;
    const ctx = getContext();
    const points = chunkBuffer;
    pendingChunks.push({
      session_id: ctx.session_id,
      lesson_id: ctx.lesson_id,
      seq,
      start_ms: chunkStartMs || points[0].timestamp_ms,
      points,
      data: points,
    });

    seq += 1;
    chunkBuffer = [];
    chunkStartMs = null;

    if (pendingChunks.length > MAX_PENDING_CHUNKS) {
      running = false;
      setTrackingState?.("SAVE_FAILED");
      setStatus("Bộ nhớ chờ lưu đã đầy. Phiên ghi nhận được tạm dừng để tránh mất dữ liệu.", "error");
      if (frameTimer) window.clearInterval(frameTimer);
      if (chunkTimer) window.clearInterval(chunkTimer);
      frameTimer = null;
      chunkTimer = null;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    }
  }

  async function postChunkWithRetry(chunk, maxAttempts = 4) {
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetch(apiUrl("/gaze/chunks"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });

        if (response.ok) {
          return await response.json();
        }

        const text = await response.text();
        if (response.status >= 400 && response.status < 500 && response.status !== 409) {
          throw new Error(text || `HTTP ${response.status}`);
        }

        lastError = new Error(text || `HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await delay(500 * (2 ** attempt));
    }

    throw lastError || new Error("Không thể gửi gaze chunk.");
  }

  async function pumpChunkQueue() {
    if (flushPromise) return flushPromise;
    if (!pendingChunks.length) return undefined;

    flushPromise = (async () => {
      while (pendingChunks.length) {
        const chunk = pendingChunks[0];
        await postChunkWithRetry(chunk);
        pendingChunks.shift();

        window.dispatchEvent(
          new CustomEvent("eyelearn:gaze-chunk-saved", {
            detail: { session_id: chunk.session_id, seq: chunk.seq, n_points: chunk.points.length },
          })
        );
      }
    })();

    try {
      return await flushPromise;
    } finally {
      flushPromise = null;
    }
  }

  async function sendChunk() {
    sealCurrentChunk();
    if (!pendingChunks.length) return;

    try {
      await pumpChunkQueue();
    } catch {
      setTrackingState?.("SAVE_FAILED");
      setStatus("Dữ liệu chưa gửi được và đang được giữ trong hàng đợi.", "error");
    }
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
      const error = new Error("Chưa có phiên học để ghi nhận camera.");
      setStatus(error.message, "error");
      throw error;
    }
    if (!calibrationReady()) {
      const error = new Error(calibrationMessage());
      setStatus(error.message, "error");
      throw error;
    }

    const aiOk = await checkAi();
    if (!aiOk) {
      const error = new Error("Chưa kết nối được dịch vụ eye-tracking.");
      setStatus(error.message, "error");
      throw error;
    }

    try {
      const cfg = await loadClientConfig();
      setTrackingState?.("PREPARING");
      setStatus("Đang mở camera...");
      await startCamera();
      setTrackingState?.("CONNECTING");
      setStatus("Đang kết nối eye-tracking...");
      const tokenPayload = await fetch(apiUrl(`/sessions/${encodeURIComponent(ctx.session_id)}/tracking-token`), {
        method: "POST",
        credentials: "include",
      }).then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Không thể tạo tracking token.");
        }
        return response.json();
      });
      const separator = cfg.ai_ws_url.includes("?") ? "&" : "?";
      ws = new WebSocket(
        `${cfg.ai_ws_url}${separator}session_id=${encodeURIComponent(ctx.session_id)}&token=${encodeURIComponent(tokenPayload.token)}`
      );

      await new Promise((resolve, reject) => {
        ws.addEventListener("open", () => {
	        running = true;
	        resetSequenceForRun();
          setTrackingState?.("ACTIVE");
	        setStatus("Đang ghi nhận ánh nhìn.", "ok");
	        frameTimer = window.setInterval(sendFrame, GAZE_INTERVAL_MS);
	        chunkTimer = window.setInterval(sendChunk, CHUNK_INTERVAL_MS);
          resolve();
	      }, { once: true });

	      ws.addEventListener("error", () => {
	        setTrackingState?.("FAILED");
	        setStatus("Không thể kết nối eye-tracking.", "error");
          reject(new Error("Không thể kết nối eye-tracking."));
	      }, { once: true });

        ws.addEventListener("close", () => {
          if (!running) reject(new Error("Không thể kết nối eye-tracking."));
        }, { once: true });
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
	        if (running) {
            setTrackingState?.("FAILED");
            setStatus("Kết nối eye-tracking đã dừng.", "error");
          }
	        stopGaze("FAILED");
	      });
	    } catch (error) {
      setTrackingState?.("FAILED");
      const message = error?.message === "Không thể kết nối eye-tracking." ? error.message : cameraErrorMessage(error);
	      setStatus(message, "error");
	      await stopGaze("FAILED");
      throw error;
	    }
  }

  async function stopGaze(nextState = "PAUSED") {
    running = false;
    waitingForInference = false;
    if (frameTimer) window.clearInterval(frameTimer);
    if (chunkTimer) window.clearInterval(chunkTimer);
    frameTimer = null;
    chunkTimer = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    ws = null;
    stopCamera();
    updateDebugDot(null);
    await sendChunk().catch(() => {});
    setTrackingState?.(nextState);
  }

  function setDebugDotVisible(visible) {
    debugDotVisible = visible;
    if (!visible) updateDebugDot(null);
  }

  function destroy() {
    stopGaze().catch(() => {});
  }

  function isRunning() {
    return running;
  }

  return { checkAi, startGaze, stopGaze, setDebugDotVisible, destroy, isRunning };
}
