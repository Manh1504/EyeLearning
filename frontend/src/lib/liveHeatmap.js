// Live heatmap cho PDF: mỗi trang có một canvas overlay riêng.
// Tọa độ dùng page_number + page_x/page_y_normalized,
// không còn phụ thuộc document.body hoặc vị trí cuộn.
const MAX_POINTS = 5000;
const MOUSE_INTERVAL_MS = 100;
const DEFAULT_OPACITY = 0.35;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createLiveHeatmap() {
  let running = false;
  let mouseTestEnabled = false;
  let opacity = DEFAULT_OPACITY;
  let points = [];
  let rafId = null;
  let lastMouseAt = 0;
  let resizeObserver = null;

  const pageCanvases = new Map();

  function pageCardFor(pageNumber) {
    return document.querySelector(
      `.pdf-page-card[data-page-number="${pageNumber}"]`
    );
  }

  function removePageCanvas(pageNumber) {
    const entry = pageCanvases.get(pageNumber);
    if (!entry) return;

    resizeObserver?.unobserve(entry.card);
    entry.canvas.remove();
    pageCanvases.delete(pageNumber);
  }

  function ensurePageCanvas(pageNumber) {
    const card = pageCardFor(pageNumber);
    if (!card) return null;

    const current = pageCanvases.get(pageNumber);

    if (
      current?.card === card &&
      current.canvas.isConnected
    ) {
      return current;
    }

    if (current) {
      removePageCanvas(pageNumber);
    }

    const canvas = document.createElement("canvas");

    canvas.className =
      "live-heatmap-canvas pdf-live-heatmap-canvas";

    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-html2canvas-ignore", "true");

    canvas.dataset.heatmapPageNumber =
      String(pageNumber);

    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      zIndex: "50",
      width: "100%",
      height: "100%",
      display: "block",
      margin: "0",
      borderRadius: "inherit",
      background: "transparent",
      pointerEvents: "none",
      mixBlendMode: "multiply",
      opacity: String(opacity),
    });

    canvas.hidden = !running;
    card.append(canvas);

    const entry = {
      card,
      canvas,
      ctx: canvas.getContext("2d"),
      width: 0,
      height: 0,
    };

    pageCanvases.set(pageNumber, entry);
    resizeObserver?.observe(card);

    return entry;
  }

  function resizePageCanvas(entry) {
    if (!entry?.ctx) return false;

    const width = entry.card.clientWidth;
    const height = entry.card.clientHeight;

    if (width <= 0 || height <= 0) {
      return false;
    }

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.ceil(width * dpr);
    const pixelHeight = Math.ceil(height * dpr);

    if (
      entry.canvas.width !== pixelWidth ||
      entry.canvas.height !== pixelHeight
    ) {
      entry.canvas.width = pixelWidth;
      entry.canvas.height = pixelHeight;
    }

    entry.ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    entry.width = width;
    entry.height = height;

    return true;
  }

  function normalizedPdfPoint(point) {
    const metadata = point?.metadata_json || {};

    const pageNumber = Number(
      point?.page_number ??
      metadata.page_number
    );

    const pageX = Number(
      point?.page_x_normalized ??
      metadata.page_x_normalized
    );

    const pageY = Number(
      point?.page_y_normalized ??
      metadata.page_y_normalized
    );

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1
    ) {
      return null;
    }

    if (
      !Number.isFinite(pageX) ||
      !Number.isFinite(pageY)
    ) {
      return null;
    }

    if (
      pageX < 0 ||
      pageX > 1 ||
      pageY < 0 ||
      pageY > 1
    ) {
      return null;
    }

    if (
      metadata.in_pdf_page === false ||
      metadata.is_transitioning === true
    ) {
      return null;
    }

    return {
      page_number: pageNumber,
      page_x_normalized: pageX,
      page_y_normalized: pageY,
      confidence:
        point?.confidence ??
        point?.conf ??
        0.75,
      timestamp_ms:
        point?.timestamp_ms ??
        Date.now(),
      gaze_status:
        point?.gaze_status ??
        "unknown",
    };
  }

  function drawPoint(entry, point) {
    const x =
      point.page_x_normalized *
      entry.width;

    const y =
      point.page_y_normalized *
      entry.height;

    const confidence = clamp(
      Number(point.confidence ?? 0.75),
      0.2,
      1
    );

    const radius =
      36 +
      confidence * 22;

    const gradient =
      entry.ctx.createRadialGradient(
        x,
        y,
        0,
        x,
        y,
        radius
      );

    gradient.addColorStop(
      0,
      "rgba(239, 68, 68, 0.80)"
    );

    gradient.addColorStop(
      0.28,
      "rgba(250, 204, 21, 0.60)"
    );

    gradient.addColorStop(
      0.62,
      "rgba(34, 197, 94, 0.34)"
    );

    gradient.addColorStop(
      1,
      "rgba(34, 197, 94, 0)"
    );

    entry.ctx.fillStyle = gradient;
    entry.ctx.beginPath();

    entry.ctx.arc(
      x,
      y,
      radius,
      0,
      Math.PI * 2
    );

    entry.ctx.fill();
  }

  function redraw() {
    rafId = null;

    for (
      const [pageNumber, entry]
      of pageCanvases
    ) {
      if (!entry.card.isConnected) {
        removePageCanvas(pageNumber);
        continue;
      }

      resizePageCanvas(entry);

      entry.ctx?.clearRect(
        0,
        0,
        entry.width,
        entry.height
      );

      entry.canvas.hidden = !running;
    }

    if (!running) return;

    const pointsByPage = new Map();

    for (const point of points) {
      const pagePoints =
        pointsByPage.get(point.page_number) ||
        [];

      pagePoints.push(point);

      pointsByPage.set(
        point.page_number,
        pagePoints
      );
    }

    for (
      const [pageNumber, pagePoints]
      of pointsByPage
    ) {
      const entry =
        ensurePageCanvas(pageNumber);

      if (!resizePageCanvas(entry)) {
        continue;
      }

      for (const point of pagePoints) {
        drawPoint(entry, point);
      }
    }
  }

  function scheduleDraw() {
    if (rafId !== null) return;

    rafId =
      window.requestAnimationFrame(redraw);
  }

  function addPoint(point, options = {}) {
    const normalized =
      normalizedPdfPoint(point);

    if (!normalized) {
      return false;
    }

    points.push(normalized);

    if (points.length > MAX_POINTS) {
      points.splice(
        0,
        points.length - MAX_POINTS
      );
    }

    if (running) {
      scheduleDraw();
    }

    window.dispatchEvent(
      new CustomEvent(
        "eyelearn:live-heatmap-updated",
        {
          detail: {
            point_count: points.length,
          },
        }
      )
    );

    if (!options.fromEvent) {
      Object.defineProperty(
        point,
        "__liveHeatmapHandled",
        {
          value: true,
          configurable: true,
          enumerable: false,
        }
      );

      window.dispatchEvent(
        new CustomEvent(
          "eyelearn:tracking-point",
          {
            detail: point,
          }
        )
      );
    }

    return true;
  }

  function handleTrackingPoint(event) {
    if (
      event.detail?.__liveHeatmapHandled
    ) {
      return;
    }

    addPoint(
      event.detail || {},
      {
        fromEvent: true,
      }
    );
  }

  function handleGazeChunk(event) {
    const chunk = event.detail || {};

    const chunkPoints =
      chunk.points ||
      chunk.data ||
      [];

    for (const point of chunkPoints) {
      addPoint(
        point,
        {
          fromEvent: true,
        }
      );
    }
  }

  function mousePointFromEvent(event) {
    const card =
      event.target?.closest?.(
        ".pdf-page-card[data-page-number]"
      );

    if (!card) return null;

    const rect =
      card.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    return {
      viewport_x: event.clientX,
      viewport_y: event.clientY,
      timestamp_ms: Date.now(),
      target_zone: "pdf_page",
      page_number:
        Number(card.dataset.pageNumber),

      page_x_normalized: clamp(
        (event.clientX - rect.left) /
          rect.width,
        0,
        1
      ),

      page_y_normalized: clamp(
        (event.clientY - rect.top) /
          rect.height,
        0,
        1
      ),

      confidence: 1,
      gaze_status: "mouse_test",

      metadata_json: {
        in_pdf_page: true,
        is_transitioning: false,
      },
    };
  }

  function handleMouseMove(event) {
    if (!mouseTestEnabled) return;

    const now = Date.now();

    if (
      now - lastMouseAt <
      MOUSE_INTERVAL_MS
    ) {
      return;
    }

    lastMouseAt = now;

    const point =
      mousePointFromEvent(event);

    if (!point) return;

    window.tracking_events =
      window.tracking_events || [];

    window.tracking_events.push(point);
    addPoint(point);
  }

  function init() {
    window.addEventListener(
      "resize",
      scheduleDraw
    );

    window.addEventListener(
      "orientationchange",
      scheduleDraw
    );

    window.addEventListener(
      "eyelearn:tracking-point",
      handleTrackingPoint
    );

    window.addEventListener(
      "eyelearn:gaze-chunk",
      handleGazeChunk
    );

    if (window.ResizeObserver) {
      resizeObserver =
        new ResizeObserver(scheduleDraw);
    }

    return controller;
  }

  function destroy() {
    window.removeEventListener(
      "resize",
      scheduleDraw
    );

    window.removeEventListener(
      "orientationchange",
      scheduleDraw
    );

    window.removeEventListener(
      "eyelearn:tracking-point",
      handleTrackingPoint
    );

    window.removeEventListener(
      "eyelearn:gaze-chunk",
      handleGazeChunk
    );

    disableMouseTest();

    resizeObserver?.disconnect();
    resizeObserver = null;

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }

    rafId = null;

    for (
      const entry
      of pageCanvases.values()
    ) {
      entry.canvas.remove();
    }

    pageCanvases.clear();
    points = [];
    running = false;
  }

  function start() {
    running = true;

    for (
      const entry
      of pageCanvases.values()
    ) {
      entry.canvas.hidden = false;
    }

    scheduleDraw();
  }

  function stop() {
    running = false;

    for (
      const entry
      of pageCanvases.values()
    ) {
      entry.canvas.hidden = true;
    }
  }

  function clear() {
    points = [];

    for (
      const [pageNumber]
      of pageCanvases
    ) {
      removePageCanvas(pageNumber);
    }

    window.dispatchEvent(
      new CustomEvent(
        "eyelearn:live-heatmap-updated",
        {
          detail: {
            point_count: 0,
          },
        }
      )
    );
  }

  function setOpacity(value) {
    opacity = clamp(
      Number(value),
      0,
      1
    );

    for (
      const entry
      of pageCanvases.values()
    ) {
      entry.canvas.style.opacity =
        String(opacity);
    }
  }

  function enableMouseTest() {
    if (mouseTestEnabled) return;

    mouseTestEnabled = true;

    document.addEventListener(
      "mousemove",
      handleMouseMove,
      {
        passive: true,
      }
    );
  }

  function disableMouseTest() {
    mouseTestEnabled = false;

    document.removeEventListener(
      "mousemove",
      handleMouseMove
    );
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