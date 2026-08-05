export function stablePageKey(documentVersion, pageNumber) {
  return `${documentVersion || "unknown"}:${pageNumber}`;
}

export function shouldAutoStartTracking({
  sessionId,
  calibrationReady,
  calibrationProfileId,
  pdfLoaded,
  firstVisiblePageRendered,
  aiReady,
  isResizing,
  trackingState,
  attemptKey,
  attemptedKeys,
}) {
  if (!sessionId || !calibrationReady || !calibrationProfileId) return false;
  if (!pdfLoaded || !firstVisiblePageRendered || !aiReady || isResizing) return false;
  if (trackingState === "ACTIVE" || trackingState === "CONNECTING" || trackingState === "PREPARING") return false;
  if (!attemptKey) return false;
  return !attemptedKeys.has(attemptKey);
}

export function shouldIgnoreRenderCompletion(renderToken, latestToken) {
  return renderToken !== latestToken;
}

export function trackingToolbarLabel(state) {
  if (state === "PREPARING") return "Đang chuẩn bị";
  if (state === "CONNECTING") return "Đang kết nối eye-tracking";
  if (state === "ACTIVE") return "Đang theo dõi";
  if (state === "FAILED") return "Không thể kết nối";
  if (state === "SAVE_FAILED") return "Dữ liệu chưa được lưu";
  return "Tạm dừng";
}
