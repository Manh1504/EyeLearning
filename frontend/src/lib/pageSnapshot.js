// Port từ static/js/page_snapshot.js
import { apiUrl } from "./api.js";

function collectAoiBoxes() {
  return [...document.querySelectorAll("[data-zone]")].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      aoi_key: element.dataset.zone,
      document_x_min: rect.left + window.scrollX,
      document_y_min: rect.top + window.scrollY,
      document_x_max: rect.right + window.scrollX,
      document_y_max: rect.bottom + window.scrollY,
      viewport_x_min: rect.left,
      viewport_y_min: rect.top,
      viewport_x_max: rect.right,
      viewport_y_max: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}

function snapshotTarget() {
  return (
    document.querySelector("#lesson-root") ||
    document.querySelector(".lesson-shell") ||
    document.querySelector("main") ||
    document.body
  );
}

const MAX_CANVAS_DIM = 4096; // giới hạn khắt khe nhất (Safari macOS), dùng chung cho mọi browser

function computeActualScale(documentWidth, documentHeight) {
  const requestedScale = window.devicePixelRatio || 1;
  const maxDoc = Math.max(documentWidth, documentHeight);
  const clampedScale = Math.min(requestedScale, MAX_CANVAS_DIM / maxDoc);
  return { requestedScale, actualScale: Math.max(0.1, clampedScale) };
}

export async function capturePageSnapshot(sessionId) {
  if (!sessionId) throw new Error("No session_id found.");
  if (!window.html2canvas) throw new Error("html2canvas is not loaded.");

  const target = snapshotTarget();
  const documentWidth = document.documentElement.scrollWidth;
  const documentHeight = document.documentElement.scrollHeight;
  const { requestedScale, actualScale } = computeActualScale(documentWidth, documentHeight);

  const canvas = await window.html2canvas(target, {
    backgroundColor: "#f5f7fb",
    scale: actualScale,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    windowWidth: documentWidth,
    windowHeight: documentHeight,
  });

  const metadata = {
    session_id: sessionId,
    document_width_css: documentWidth,
    document_height_css: documentHeight,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    canvas_width: canvas.width,
    canvas_height: canvas.height,
    requested_scale: requestedScale,
    actual_scale: actualScale,
    visual_viewport_scale: window.visualViewport?.scale || 1,
    user_agent: navigator.userAgent,
    captured_at_ms: Date.now(),
    aoi_boxes: collectAoiBoxes(),
  };

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create PNG snapshot.");

  const formData = new FormData();
  formData.append("snapshot", blob, `page_snapshot_${sessionId}.png`);
  formData.append("metadata", JSON.stringify(metadata));

  const response = await fetch(apiUrl(`/page-snapshot/${encodeURIComponent(sessionId)}`), {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const result = await response.json();
  localStorage.setItem(`page_snapshot_captured_${sessionId}`, "true");
  window.dispatchEvent(new CustomEvent("page-snapshot-captured", { detail: result }));
  return result;
}
