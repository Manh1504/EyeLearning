const SNAPSHOT_API_BASE = window.EYELEARN_API_BASE || "";

function snapshotStatus(message, kind = "") {
  const statusEl = document.getElementById("snapshotStatus") || document.getElementById("trackingStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status-line ${kind}`.trim();
}

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
  return document.querySelector("#lesson-root")
    || document.querySelector(".lesson-shell")
    || document.querySelector("main")
    || document.body;
}

export async function capturePageSnapshot() {
  const sessionId = localStorage.getItem("session_id");
  if (!sessionId) throw new Error("No session_id found.");
  if (!window.html2canvas) throw new Error("html2canvas is not loaded.");

  const target = snapshotTarget();
  const canvas = await window.html2canvas(target, {
    backgroundColor: "#f5f7fb",
    scale: window.devicePixelRatio || 1,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
  });

  const metadata = {
    session_id: sessionId,
    document_width_css: document.documentElement.scrollWidth,
    document_height_css: document.documentElement.scrollHeight,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    canvas_width: canvas.width,
    canvas_height: canvas.height,
    device_pixel_ratio: window.devicePixelRatio || 1,
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

  const response = await fetch(`${SNAPSHOT_API_BASE}/page-snapshot/${encodeURIComponent(sessionId)}`, {
    method: "POST",
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

window.capturePageSnapshot = capturePageSnapshot;

document.getElementById("captureSnapshotBtn")?.addEventListener("click", async () => {
  const button = document.getElementById("captureSnapshotBtn");
  button.disabled = true;
  snapshotStatus("Capturing page snapshot...");
  try {
    const result = await capturePageSnapshot();
    snapshotStatus(`Snapshot captured: ${result.snapshot_url}`, "ok");
  } catch (error) {
    snapshotStatus(`Snapshot capture failed: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});
