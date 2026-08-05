function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function mapViewportPointToPdfPage(viewportX, viewportY, pageRects, options = {}) {
  const { isTransitioning = false, isResizing = false, isRendering = false } = options;
  if (isTransitioning || isResizing || isRendering) {
    return { pageNumber: null, pageXNormalized: null, pageYNormalized: null, ignored: true, reason: "layout_unstable" };
  }

  const hit = (pageRects || []).find((page) => (
    page &&
    page.width > 0 &&
    page.height > 0 &&
    viewportX >= page.left &&
    viewportX <= page.left + page.width &&
    viewportY >= page.top &&
    viewportY <= page.top + page.height
  ));

  if (!hit) {
    return { pageNumber: null, pageXNormalized: null, pageYNormalized: null, ignored: true, reason: "outside_pages" };
  }

  const pageXNormalized = clamp((viewportX - hit.left) / hit.width, 0, 1);
  const pageYNormalized = clamp((viewportY - hit.top) / hit.height, 0, 1);
  return {
    pageNumber: Number(hit.pageNumber),
    pageXNormalized,
    pageYNormalized,
    pageDisplayWidth: hit.width,
    pageDisplayHeight: hit.height,
    ignored: false,
    reason: null,
  };
}

export function overlayPointStyle(point, width, height) {
  return {
    left: `${point.xNormalized * width}px`,
    top: `${point.yNormalized * height}px`,
  };
}
