import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LearningLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "../lib/session.js";
import { createGazeClient } from "../lib/gazeClient.js";
import { createLiveHeatmap } from "../lib/liveHeatmap.js";
import { capturePageSnapshot } from "../lib/pageSnapshot.js";
import { shouldAutoStartTracking, shouldIgnoreRenderCompletion, stablePageKey, trackingToolbarLabel } from "../lib/lessonPlayerLifecycle.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const READER_MIN_WIDTH = 320;
const READER_MAX_WIDTH = 1020;
const READER_WIDTH_RATIO = 0.76;
const PAGE_CHROME_HEIGHT = 36;
const PAGE_VERTICAL_MARGIN = 16;
const PAGE_GAZE_LOOKAHEAD = 1;
const RESIZE_SETTLE_MS = 220;
const VIEWPORT_MARGIN_PX = 700;

function calibrationReady() {
  return localStorage.getItem("calibration_ready") === "true";
}

function calibrationMessage() {
  if (localStorage.getItem("calibration_ready") !== "true") {
    return "Chưa tải hồ sơ camera cho phiên học này.";
  }
  return "Camera chưa sẵn sàng.";
}

function progressForm(lastPage, maxPage, completed = false) {
  const form = new FormData();
  form.append("last_page_number", String(lastPage));
  form.append("max_page_number_seen", String(maxPage));
  form.append("completed", String(completed));
  return form;
}

function fittedPageSize(meta, viewerWidth, paneHeight) {
  const fitWidth = viewerWidth;
  const fitHeight = Math.max(240, paneHeight - PAGE_CHROME_HEIGHT - PAGE_VERTICAL_MARGIN);
  const scale = Math.min(fitWidth / meta.width, fitHeight / meta.height);
  return {
    scale,
    width: meta.width * scale,
    height: meta.height * scale,
  };
}

export default function LessonPage() {
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);
  const [course, setCourse] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageMeta, setPageMeta] = useState([]);
  const [renderedPages, setRenderedPages] = useState({});
  const [renderErrors, setRenderErrors] = useState({});
  const [visiblePages, setVisiblePages] = useState(new Set([1, 2]));
  const [viewerWidth, setViewerWidth] = useState(900);
  const [paneHeight, setPaneHeight] = useState(720);
  const [viewerResizing, setViewerResizing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [maxSeenPage, setMaxSeenPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [aiStatus, setAiStatus] = useState({ message: "Đang kiểm tra AI...", ok: null });
  const [isTracking, setIsTracking] = useState(false);
  const [trackingState, setTrackingState] = useState("PAUSED");
  const [finishing, setFinishing] = useState(false);
  const [manualRetryVisible, setManualRetryVisible] = useState(false);
  const [showGazePoint, setShowGazePoint] = useState(false);
  const [showLiveHeatmap, setShowLiveHeatmap] = useState(false);
  const [diagnostics, setDiagnostics] = useState({ samples: 0, heatmapPoints: 0, lastSavedAt: "" });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const viewerRef = useRef(null);
  const scrollPaneRef = useRef(null);
  const pageRefs = useRef(new Map());
  const canvasRefs = useRef(new Map());
  const renderTasks = useRef(new Map());
  const renderGenerations = useRef(new Map());
  const resizeTimerRef = useRef(null);
  const gazeClientRef = useRef(null);
  const liveHeatmapRef = useRef(null);
  const saveTimerRef = useRef(null);
  const attemptedAutoStartsRef = useRef(new Set());
  const autoStartKeyRef = useRef("");
  const [autoStartTick, setAutoStartTick] = useState(0);
  const debugRender = import.meta.env.DEV;
  const adminTestMode = context.session_type === "admin_test";
  const activePdfLessonId = currentItem?.pdf_lesson?.pdf_lesson_id || context.pdf_lesson_id;

  function setGazeStatus(message, kind = "") {
    setStatus({ message, kind });
  }

  function setAiHealth(message, ok) {
    setAiStatus({ message, ok });
  }

  useEffect(() => {
    if (!context.course_id || !context.session_id || (!context.pdf_lesson_id && !context.course_item_id)) {
      sessionStorage.setItem("lesson_preflight_notice", "Cần hoàn tất bước chuẩn bị học trước khi mở bài học.");
      navigate("/camera-check");
      return;
    }
    if (localStorage.getItem("calibration_ready") !== "true" || !localStorage.getItem("calibration_profile_id")) {
      sessionStorage.setItem("lesson_preflight_notice", "Cần xác nhận hồ sơ hiệu chỉnh trước khi vào bài học.");
      navigate("/camera-check");
      return;
    }
    let active = true;

    async function boot() {
      setLoading(true);
      try {
        const courseData = await requestJson(apiUrl(`/courses/${encodeURIComponent(context.course_id)}`));
        if (!active) return;
        const item = (courseData.items || []).find((entry) => {
          if (context.pdf_lesson_id && entry.pdf_lesson?.pdf_lesson_id === context.pdf_lesson_id) return true;
          if (context.course_item_id && entry.course_item_id === context.course_item_id) return true;
          return false;
        });
        if (!item?.pdf_lesson?.pdf_url) {
          throw new Error("Không tìm thấy PDF lesson cho phiên học này.");
        }
        const resolvedPdfLessonId = item.pdf_lesson.pdf_lesson_id;
        const progressData = adminTestMode
          ? { last_page_number: 1, max_page_number_seen: 1 }
          : await requestJson(apiUrl(`/courses/pdf-lessons/${encodeURIComponent(resolvedPdfLessonId)}/progress`));
        if (!active) return;
        setSessionContext({
          course_id: courseData.course_id || context.course_id,
          course_item_id: item.course_item_id,
          pdf_lesson_id: resolvedPdfLessonId,
          pdf_document_version: item.pdf_lesson.storage_key || context.pdf_document_version || "",
        });
        setCourse(courseData);
        setCurrentItem(item);
        setCurrentPage(progressData.last_page_number || 1);
        setMaxSeenPage(progressData.max_page_number_seen || progressData.last_page_number || 1);

        const loadingTask = pdfjs.getDocument({
          url: item.pdf_lesson.pdf_url,
          withCredentials: true,
        });
        const doc = await loadingTask.promise;
        if (!active) return;
        setPdfDoc(doc);
        setRenderedPages({});
        setRenderErrors({});
        setTrackingState("PAUSED");
        setManualRetryVisible(false);

        const meta = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          meta.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            ratio: viewport.height / viewport.width,
          });
        }
        if (!active) return;
        setPageMeta(meta);
      } catch (error) {
        if (active) setStatus({ message: `Không thể tải PDF lesson: ${error.message}`, kind: "error" });
      } finally {
        if (active) setLoading(false);
      }
    }

    boot();
    return () => {
      active = false;
      renderTasks.current.forEach((task) => task?.cancel?.());
      renderTasks.current.clear();
      renderGenerations.current.clear();
    };
  }, [adminTestMode, context.course_id, context.course_item_id, context.pdf_document_version, context.pdf_lesson_id, context.session_id, navigate]);

  useEffect(() => {
    if (!viewerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setViewerResizing(true);
      renderTasks.current.forEach((task) => task?.cancel?.());
      const containerWidth = Math.floor(entries[0].contentRect.width);
      const paneRect = scrollPaneRef.current?.getBoundingClientRect();
      const nextPaneHeight = Math.max(320, Math.floor(paneRect?.height || window.innerHeight));
      const nextWidth = Math.max(
        READER_MIN_WIDTH,
        Math.min(READER_MAX_WIDTH, Math.floor(containerWidth * READER_WIDTH_RATIO))
      );
      setViewerWidth(nextWidth);
      setPaneHeight(nextPaneHeight);
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        setViewerResizing(false);
        setRenderedPages((current) => {
          const next = { ...current };
          [...visiblePages].forEach((pageNumber) => {
            delete next[pageNumber];
            delete next[pageNumber - 1];
            delete next[pageNumber + 1];
          });
          return next;
        });
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(viewerRef.current);
    return () => {
      window.clearTimeout(resizeTimerRef.current);
      observer.disconnect();
    };
  }, [visiblePages]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    async function ensureRendered(pageNumber) {
      if (!pdfDoc || renderedPages[pageNumber]) return;
      const container = pageRefs.current.get(pageNumber);
      if (!container) return;
      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) return;
      const page = await pdfDoc.getPage(pageNumber);
      const meta = pageMeta.find((entry) => entry.pageNumber === pageNumber);
      if (!meta) return;
      const { scale } = fittedPageSize(meta, viewerWidth, paneHeight);
      const viewport = page.getViewport({ scale });
      const context2d = canvas.getContext("2d");
      const renderToken = (renderGenerations.current.get(pageNumber) || 0) + 1;
      renderGenerations.current.set(pageNumber, renderToken);
      const existingTask = renderTasks.current.get(pageNumber);
      if (existingTask) {
        existingTask.cancel?.();
        try {
          await existingTask.promise;
        } catch {
          // Ignore expected cancellation.
        }
      }
      const startedAt = Date.now();
      canvas.width = viewport.width * window.devicePixelRatio;
      canvas.height = viewport.height * window.devicePixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context2d.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      const task = page.render({ canvasContext: context2d, viewport });
      renderTasks.current.set(pageNumber, task);
      if (debugRender) {
        console.debug("[ELA PDF render:start]", {
          pageNumber,
          pageCount: pdfDoc.numPages,
          renderToken,
          scale,
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          devicePixelRatio: window.devicePixelRatio,
          startedAt,
        });
      }
      try {
        await task.promise;
      } catch (error) {
        if (error?.name === "RenderingCancelledException") {
          return;
        }
        if (debugRender) {
          console.debug("[ELA PDF render:error]", {
            pageNumber,
            pageCount: pdfDoc.numPages,
            renderToken,
            scale,
            cssWidth: viewport.width,
            cssHeight: viewport.height,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            devicePixelRatio: window.devicePixelRatio,
            startedAt,
            completedAt: Date.now(),
            exceptionName: error?.name,
            message: error?.message,
          });
        }
        throw error;
      }
      if (shouldIgnoreRenderCompletion(renderToken, renderGenerations.current.get(pageNumber))) {
        if (debugRender) {
          console.debug("[ELA PDF render:stale]", { pageNumber, renderToken });
        }
        return;
      }
      if (debugRender) {
        console.debug("[ELA PDF render:done]", {
          pageNumber,
          pageCount: pdfDoc.numPages,
          renderToken,
          scale,
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          devicePixelRatio: window.devicePixelRatio,
          startedAt,
          completedAt: Date.now(),
        });
      }
      setRenderErrors((current) => {
        if (!current[pageNumber]) return current;
        const next = { ...current };
        delete next[pageNumber];
        return next;
      });
      setRenderedPages((current) => ({ ...current, [pageNumber]: true }));
      if (renderTasks.current.get(pageNumber) === task) {
        renderTasks.current.delete(pageNumber);
      }
    }

    visiblePages.forEach((pageNumber) => {
      ensureRendered(pageNumber).catch((error) => {
        if (error?.name === "RenderingCancelledException") return;
        setRenderErrors((current) => ({ ...current, [pageNumber]: "Không thể hiển thị trang này." }));
      });
    });
  }, [pdfDoc, pageMeta, renderedPages, viewerWidth, paneHeight, visiblePages, debugRender]);

  useEffect(() => {
    function onScroll() {
      const pane = scrollPaneRef.current;
      if (!pane) return;
      const paneRect = pane.getBoundingClientRect();
      const paneAnchor = paneRect.top + Math.min(120, paneRect.height * 0.25);
      const pages = pageMeta
        .map((entry) => {
          const element = pageRefs.current.get(entry.pageNumber);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { pageNumber: entry.pageNumber, rect, distance: Math.abs(rect.top - paneAnchor) };
        })
        .filter(Boolean);
      if (!pages.length) return;

      const current = pages.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best), pages[0]);
      setCurrentPage(current.pageNumber);
      setMaxSeenPage((value) => Math.max(value, current.pageNumber));

      const nextVisible = new Set();
      pages.forEach((page) => {
        if (
          page.rect.bottom >= paneRect.top - VIEWPORT_MARGIN_PX &&
          page.rect.top <= paneRect.bottom + VIEWPORT_MARGIN_PX
        ) {
          nextVisible.add(page.pageNumber);
          for (let offset = 1; offset <= PAGE_GAZE_LOOKAHEAD; offset += 1) {
            nextVisible.add(page.pageNumber - offset);
            nextVisible.add(page.pageNumber + offset);
          }
        }
      });
      setVisiblePages(new Set([...nextVisible].filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageMeta.length)));
    }

    onScroll();
    const pane = scrollPaneRef.current;
    pane?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      pane?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pageMeta]);

  useEffect(() => {
    if (adminTestMode) return;
    if (!activePdfLessonId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await requestJson(apiUrl(`/courses/pdf-lessons/${encodeURIComponent(activePdfLessonId)}/progress`), {
          method: "POST",
          body: progressForm(currentPage, maxSeenPage, false),
        });
      } catch {
        // Keep local progress flow resilient; explicit user feedback is not worth interrupting reading.
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [adminTestMode, activePdfLessonId, currentPage, maxSeenPage]);

  useEffect(() => {
    if (!context.session_id) return undefined;
    const heartbeat = () => {
      fetch(apiUrl(`/sessions/${encodeURIComponent(context.session_id)}/heartbeat`), {
        method: "PATCH",
        credentials: "include",
      }).catch(() => {});
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [context.session_id]);

  useEffect(() => {
    if (!pdfDoc) return;
    const pageElement = pageRefs.current.get(currentPage);
    pageElement?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [pdfDoc]);

  useEffect(() => {
    scrollPaneRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!context.session_id) return undefined;
    if (gazeClientRef.current) return undefined;
    gazeClientRef.current = createGazeClient({
      refs: { video: videoRef, canvas: canvasRef, dot: dotRef },
      getContext: () => getSessionContext(),
      setStatus: setGazeStatus,
      setAiStatus: setAiHealth,
      calibrationReady,
      calibrationMessage,
      setTrackingState,
    });
    gazeClientRef.current.checkAi();
    return () => {
      gazeClientRef.current?.destroy?.();
      gazeClientRef.current = null;
    };
  }, [context.session_id]);

  useEffect(() => {
    if (!adminTestMode) return undefined;
    liveHeatmapRef.current = createLiveHeatmap().init();
    window.liveHeatmap = liveHeatmapRef.current;
    function onPoint() {
      setDiagnostics((current) => ({
        ...current,
        samples: current.samples + 1,
        heatmapPoints: window.liveHeatmap?.getPointCount?.() || current.heatmapPoints,
      }));
    }
    function onChunkSaved() {
      setDiagnostics((current) => ({ ...current, lastSavedAt: new Date().toLocaleTimeString("vi-VN") }));
    }
    window.addEventListener("eyelearn:tracking-point", onPoint);
    window.addEventListener("eyelearn:gaze-chunk-saved", onChunkSaved);
    return () => {
      window.removeEventListener("eyelearn:tracking-point", onPoint);
      window.removeEventListener("eyelearn:gaze-chunk-saved", onChunkSaved);
      liveHeatmapRef.current?.destroy?.();
      if (window.liveHeatmap === liveHeatmapRef.current) delete window.liveHeatmap;
      liveHeatmapRef.current = null;
    };
  }, [adminTestMode]);

  useEffect(() => {
    gazeClientRef.current?.setDebugDotVisible?.(showGazePoint);
  }, [showGazePoint]);

  useEffect(() => {
    if (!adminTestMode) return;
    if (showLiveHeatmap) liveHeatmapRef.current?.start?.();
    else liveHeatmapRef.current?.stop?.();
  }, [adminTestMode, showLiveHeatmap]);

  useEffect(() => {
    function stopTrackingOnLeave() {
      gazeClientRef.current?.destroy?.();
    }
    window.addEventListener("pagehide", stopTrackingOnLeave);
    window.addEventListener("beforeunload", stopTrackingOnLeave);
    return () => {
      window.removeEventListener("pagehide", stopTrackingOnLeave);
      window.removeEventListener("beforeunload", stopTrackingOnLeave);
    };
  }, []);

  useEffect(() => {
    window.__ELA_PDF_CONTEXT__ = {
      courseId: context.course_id || null,
      courseItemId: context.course_item_id || null,
      pdfLessonId: activePdfLessonId || null,
      pdfDocumentVersion: context.pdf_document_version || null,
      currentPage,
      isTransitioning: false,
      isResizing: viewerResizing,
      isRendering: [...visiblePages].some((pageNumber) => !renderedPages[pageNumber]),
    };
    return () => {
      delete window.__ELA_PDF_CONTEXT__;
    };
  }, [activePdfLessonId, context.course_id, context.course_item_id, context.pdf_document_version, currentPage, viewerResizing, visiblePages, renderedPages]);

  useEffect(() => {
    autoStartKeyRef.current = `${context.session_id}:${context.pdf_document_version || "unknown"}:${localStorage.getItem("calibration_profile_id") || ""}`;
    setAutoStartTick((value) => value + 1);
  }, [context.session_id, context.pdf_document_version]);

  useEffect(() => {
    const firstVisiblePageRendered = Boolean(renderedPages[currentPage] || renderedPages[1]);
    const shouldStart = shouldAutoStartTracking({
      sessionId: context.session_id,
      calibrationReady: localStorage.getItem("calibration_ready") === "true",
      calibrationProfileId: localStorage.getItem("calibration_profile_id") || "",
      pdfLoaded: Boolean(pdfDoc),
      firstVisiblePageRendered,
      aiReady: Boolean(aiStatus.ok),
      isResizing: viewerResizing,
      trackingState,
      attemptKey: autoStartKeyRef.current,
      attemptedKeys: attemptedAutoStartsRef.current,
    });
    if (!shouldStart || !gazeClientRef.current) return;
    attemptedAutoStartsRef.current.add(autoStartKeyRef.current);
    setManualRetryVisible(false);
    gazeClientRef.current.startGaze().then(() => {
      setIsTracking(gazeClientRef.current?.isRunning?.() === true);
    }).catch(() => {
      setIsTracking(false);
      setTrackingState("FAILED");
      setManualRetryVisible(true);
    });
  }, [context.session_id, pdfDoc, renderedPages, currentPage, aiStatus.ok, viewerResizing, trackingState, autoStartTick]);

  async function closeSession(action) {
    if (!context.session_id) return;
    setFinishing(true);
    try {
      await gazeClientRef.current?.stopGaze?.();
      setIsTracking(false);
      await capturePageSnapshot(context.session_id).catch(() => {});
      await requestJson(apiUrl(`/sessions/${encodeURIComponent(context.session_id)}/close`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          last_page_number: currentPage,
          max_page_number_seen: Math.max(maxSeenPage, currentPage),
        }),
      });
      clearSessionContext({ preserveIdentity: true });
      navigate(adminTestMode ? `/admin/eye-tracking-test/${encodeURIComponent(context.session_id)}` : `/courses/${course?.course_id || context.course_id}`);
    } catch (error) {
      setStatus({ message: error.message, kind: "error" });
      setFinishing(false);
    }
  }

  function retryPageRender(pageNumber) {
    setRenderedPages((current) => {
      const next = { ...current };
      delete next[pageNumber];
      return next;
    });
    setRenderErrors((current) => {
      const next = { ...current };
      delete next[pageNumber];
      return next;
    });
    setVisiblePages((current) => new Set([...current, pageNumber]));
  }

  async function retryTrackingConnection() {
    if (!gazeClientRef.current) return;
    setManualRetryVisible(false);
    setTrackingState("CONNECTING");
    try {
      await gazeClientRef.current.stopGaze();
      await gazeClientRef.current.startGaze();
      setIsTracking(gazeClientRef.current?.isRunning?.() === true);
    } catch (error) {
      setTrackingState("FAILED");
      setManualRetryVisible(true);
      setStatus({ message: error?.message || "Không thể kết nối lại eye-tracking.", kind: "error" });
    }
  }

  if (loading) {
    return (
      <LearningLayout className="student-lesson-viewer pdf-lesson-player">
        <div className="panel"><p className="muted">Đang tải PDF lesson...</p></div>
      </LearningLayout>
    );
  }

  if (!currentItem) {
    return (
      <LearningLayout className="student-lesson-viewer pdf-lesson-player">
        <div className="panel"><p className="muted">Không tìm thấy nội dung lesson.</p></div>
      </LearningLayout>
    );
  }

  const totalPages = currentItem.pdf_lesson?.page_count || 0;
  const completedLesson = maxSeenPage >= Math.max(1, totalPages);
  const canComplete = totalPages > 0 && maxSeenPage >= totalPages;
  const trackingLabel = trackingToolbarLabel(trackingState);

  return (
    <LearningLayout className="student-lesson-viewer pdf-lesson-player" id="lesson-root">
      <header className="lesson-viewer-header">
        <div className="lesson-toolbar-copy">
          <strong>{course?.course_title}</strong>
          <span>
            {currentItem.title} · Trang {currentPage}/{totalPages}
            {completedLesson ? " · Đã hoàn thành" : ""}
          </span>
        </div>
        <div className="lesson-header-actions" data-html2canvas-ignore="true">
          <span className={`tracking-status-pill state-${trackingState.toLowerCase()}`}>
            <span className="tracking-status-dot" aria-hidden="true"></span>
            {trackingLabel}
          </span>
          {manualRetryVisible && <button className="btn secondary" type="button" onClick={retryTrackingConnection}>Thử kết nối lại</button>}
          <button className="btn primary" type="button" disabled={finishing || !canComplete} onClick={() => closeSession("complete")}>
            {finishing ? "Đang hoàn tất..." : "Hoàn thành bài học"}
          </button>
          <button className="btn text lesson-back-action" type="button" disabled={finishing} onClick={() => closeSession("exit")}>
            Lưu và thoát
          </button>
        </div>
      </header>

      <section className="pdf-lesson-shell">
        {adminTestMode && (
          <aside className="admin-lesson-diagnostics" data-html2canvas-ignore="true">
            <details open>
              <summary>Chẩn đoán kiểm thử</summary>
              <div className="admin-lesson-diagnostics__grid">
                <span>Camera: {aiStatus.ok === false ? "Lỗi" : "Đang dùng"}</span>
                <span>Gaze model: {trackingLabel}</span>
                <span>Mẫu gaze: {diagnostics.samples}</span>
                <span>Heatmap points: {diagnostics.heatmapPoints}</span>
                <span>Trang hiện tại: {currentPage}</span>
                <span>Session: {context.session_id}</span>
                <span>PDF version: {context.pdf_document_version || "Chưa ghi nhận"}</span>
                <span>Lưu gần nhất: {diagnostics.lastSavedAt || "Chưa ghi nhận"}</span>
              </div>
              <div className="admin-lesson-diagnostics__actions">
                <label><input type="checkbox" checked={showGazePoint} onChange={(event) => setShowGazePoint(event.target.checked)} /> Hiện gaze point</label>
                <label><input type="checkbox" checked={showLiveHeatmap} onChange={(event) => setShowLiveHeatmap(event.target.checked)} /> Hiện live heatmap</label>
                <button className="btn text" type="button" onClick={() => { liveHeatmapRef.current?.clear?.(); setDiagnostics((current) => ({ ...current, heatmapPoints: 0 })); }}>Xóa heatmap</button>
              </div>
            </details>
          </aside>
        )}
        <main className="pdf-lesson-main" ref={scrollPaneRef} tabIndex={0} aria-label="Khu vực đọc PDF">
          <div className="pdf-scroll-viewport" ref={viewerRef}>
            <div className="pdf-reader-column">
              {pageMeta.map((meta) => (
                <section
                  key={stablePageKey(context.pdf_document_version, meta.pageNumber)}
                  ref={(node) => {
                    if (node) pageRefs.current.set(meta.pageNumber, node);
                    else pageRefs.current.delete(meta.pageNumber);
                  }}
                  className="pdf-page-card"
                  data-zone="pdf_page"
                  data-page-number={meta.pageNumber}
                  data-page-width={meta.width}
                  data-page-height={meta.height}
                  style={{ minHeight: `${fittedPageSize(meta, viewerWidth, paneHeight).height}px` }}
                >
                  <canvas ref={(node) => {
                    if (node) canvasRefs.current.set(meta.pageNumber, node);
                    else canvasRefs.current.delete(meta.pageNumber);
                  }} />
                  {!renderedPages[meta.pageNumber] && !renderErrors[meta.pageNumber] && (
                    <div className="pdf-page-loading">Đang hiển thị trang {meta.pageNumber}...</div>
                  )}
                  {renderErrors[meta.pageNumber] && (
                    <div className="pdf-page-loading error">
                      <span>{renderErrors[meta.pageNumber]}</span>
                      <div className="pdf-page-error-actions">
                        <button className="btn secondary" type="button" onClick={() => retryPageRender(meta.pageNumber)}>
                          Thử lại
                        </button>
                        <button className="btn text" type="button" onClick={() => window.location.reload()}>
                          Tải lại bài học
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
          {!!status.message && (
            <div className={`lesson-toolbar-message ${status.kind}`.trim()} data-html2canvas-ignore="true">
              {status.message}
            </div>
          )}
        </main>
      </section>

      <video ref={videoRef} autoPlay playsInline muted className="gaze-video-hidden" data-html2canvas-ignore="true" aria-hidden="true" />
      <canvas ref={canvasRef} className="gaze-canvas-hidden" data-html2canvas-ignore="true" aria-hidden="true" />
      <div ref={dotRef} className="gaze-debug-dot" hidden />
    </LearningLayout>
  );
}
