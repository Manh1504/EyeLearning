// Port gần như nguyên bản từ static/js/live_heatmap.js.
// Giữ nguyên cơ chế canvas overlay + window CustomEvent bus để tương thích
// với gazeClient/trackingClient vốn giao tiếp qua "eyelearn:tracking-point".
const MAX_POINTS = 5000;
const MOUSE_INTERVAL_MS = 100;
const DEFAULT_OPACITY = 0.35;

export function createLiveHeatmap() {
  let canvas = null;
  let ctx = null;
  let running = false;
  let mouseTestEnabled = false;
  let opacity = DEFAULT_OPACITY;
  let points = [];
  let rafId = null;
  let lastMouseAt = 0;
  let documentWidth = 0;
  let documentHeight = 0;
  let resizeObserver = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "liveHeatmapCanvas";
    canvas.className = "live-heatmap-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-html2canvas-ignore", "true");
    canvas.style.opacity = String(opacity);
    canvas.hidden = !running;
    document.body.append(canvas);
    ctx = canvas.getContext("2d");
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const previous = points.slice();
    const dpr = window.devicePixelRatio || 1;
    documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      window.innerWidth
    );
    documentHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
    canvas.style.width = `${documentWidth}px`;
    canvas.style.height = `${documentHeight}px`;
    canvas.width = Math.ceil(documentWidth * dpr);
    canvas.height = Math.ceil(documentHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    points = previous;
    scheduleDraw();
  }

  function normalizePoint(point) {
    let viewportX = point.viewport_x;
    let viewportY = point.viewport_y;

    if (viewportX === undefined || viewportY === undefined) {
      if (point.x_norm !== undefined && point.y_norm !== undefined) {
        viewportX = Number(point.x_norm) * window.innerWidth;
        viewportY = Number(point.y_norm) * window.innerHeight;
      } else if (point.x !== undefined && point.y !== undefined) {
        const x = Number(point.x);
        const y = Number(point.y);
        viewportX = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? x * window.innerWidth : x;
        viewportY = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? y * window.innerHeight : y;
      }
    }

    if (!Number.isFinite(Number(viewportX)) || !Number.isFinite(Number(viewportY))) return null;

    const scrollX = Number(point.scroll_x ?? window.scrollX ?? 0);
    const scrollY = Number(point.scroll_y ?? window.scrollY ?? 0);
    return {
      document_x: Number(viewportX) + scrollX,
      document_y: Number(viewportY) + scrollY,
      confidence: point.confidence ?? point.conf ?? 0.75,
      timestamp_ms: point.timestamp_ms ?? Date.now(),
      target_zone: point.target_zone ?? null,
      gaze_status: point.gaze_status ?? "unknown",
    };
  }

  function drawPoint(point) {
    const confidence = Math.max(0.2, Math.min(1, Number(point.confidence ?? 0.75)));
    const radius = 36 + confidence * 22;
    const gradient = ctx.createRadialGradient(
      point.document_x,
      point.document_y,
      0,
      point.document_x,
      point.document_y,
      radius
    );
    gradient.addColorStop(0, "rgba(239, 68, 68, 0.80)");
    gradient.addColorStop(0.28, "rgba(250, 204, 21, 0.60)");
    gradient.addColorStop(0.62, "rgba(34, 197, 94, 0.34)");
    gradient.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.document_x, point.document_y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function redraw() {
    rafId = null;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, documentWidth, documentHeight);
    if (!running) return;
    for (const point of points) drawPoint(point);
  }

  function scheduleDraw() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(redraw);
  }

  function addPoint(point, options = {}) {
    ensureCanvas();
    const normalized = normalizePoint(point);
    if (!normalized) return false;

    points.push(normalized);
    if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
    if (running) scheduleDraw();
    window.dispatchEvent(
      new CustomEvent("eyelearn:live-heatmap-updated", { detail: { point_count: points.length } })
    );

    if (!options.fromEvent) {
      Object.defineProperty(point, "__liveHeatmapHandled", {
        value: true,
        configurable: true,
        enumerable: false,
      });
      window.dispatchEvent(new CustomEvent("eyelearn:tracking-point", { detail: point }));
    }
    return true;
  }

  function handleTrackingPoint(event) {
    if (event.detail?.__liveHeatmapHandled) return;
    addPoint(event.detail || {}, { fromEvent: true });
  }

  function handleGazeChunk(event) {
    const chunk = event.detail || {};
    const chunkPoints = chunk.points || chunk.data || [];
    for (const point of chunkPoints) {
      addPoint(point, { fromEvent: true });
    }
  }

  function mousePointFromEvent(event) {
    return {
      viewport_x: event.clientX,
      viewport_y: event.clientY,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY,
      timestamp_ms: Date.now(),
      target_zone: event.target.closest("[data-zone]")?.dataset.zone || null,
      confidence: 1,
      gaze_status: "mouse_test",
    };
  }

  function handleMouseMove(event) {
    if (!mouseTestEnabled) return;
    const now = Date.now();
    if (now - lastMouseAt < MOUSE_INTERVAL_MS) return;
    lastMouseAt = now;

    const point = mousePointFromEvent(event);
    window.tracking_events = window.tracking_events || [];
    window.tracking_events.push(point);
    addPoint(point);
  }

  function init() {
    ensureCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    window.addEventListener("eyelearn:tracking-point", handleTrackingPoint);
    window.addEventListener("eyelearn:gaze-chunk", handleGazeChunk);
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }
    return controller;
  }

  function destroy() {
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("orientationchange", resizeCanvas);
    window.removeEventListener("eyelearn:tracking-point", handleTrackingPoint);
    window.removeEventListener("eyelearn:gaze-chunk", handleGazeChunk);
    resizeObserver?.disconnect();
    canvas?.remove();
    canvas = null;
    ctx = null;
    points = [];
    running = false;
  }

  function start() {
    ensureCanvas();
    running = true;
    canvas.hidden = false;
    scheduleDraw();
  }

  function stop() {
    running = false;
    if (canvas) canvas.hidden = true;
  }

  function clear() {
    points = [];
    scheduleDraw();
  }

  function setOpacity(value) {
    opacity = Math.max(0, Math.min(1, Number(value)));
    if (canvas) canvas.style.opacity = String(opacity);
  }

  function enableMouseTest() {
    if (mouseTestEnabled) return;
    mouseTestEnabled = true;
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
  }

  function disableMouseTest() {
    mouseTestEnabled = false;
    document.removeEventListener("mousemove", handleMouseMove);
  }

  function getPointCount() {
    return points.length;
  }

  const controller = {
    init,
    destroy,
    start,
    stop,
    clear,
    setOpacity,
    addPoint,
    enableMouseTest,
    disableMouseTest,
    getPointCount,
  };

  return controller;
}
