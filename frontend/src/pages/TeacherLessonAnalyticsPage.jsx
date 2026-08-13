import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AppHeader, Breadcrumbs, MetricStrip, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { formatPercent, formatSeconds } from "../lib/teacherAnalyticsPresentation.js";
import { drawHeatmap } from "../lib/heatmapCanvas.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function fmtDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function confidenceLabel(value) {
  return value == null ? "Chưa được mô hình cung cấp" : formatPercent(value);
}

export default function TeacherLessonAnalyticsPage() {
  const { courseId = "", lessonId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [payload, setPayload] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [pageNumber, setPageNumber] = useState(Number(searchParams.get("page") || 1));
  const canvasRef = useRef(null);
  const heatmapOverlayRef = useRef(null);
  const wrapRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(720);
  const minimumConfidence = 0;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setAccessDenied(false);
      try {
        const data = await requestJson(apiUrl(`/courses/teacher/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/analytics`));
        if (!active) return;
        setPayload(data);
        const nextPage = Number(searchParams.get("page") || data.pages?.[0]?.page_number || 1);
        setPageNumber(nextPage);
      } catch (err) {
        if (!active) return;
        if ((err.message || "").toLowerCase().includes("quyền")) setAccessDenied(true);
        else setError("Không thể tải dữ liệu phân tích. Vui lòng thử lại.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [courseId, lessonId, searchParams]);

  useEffect(() => {
    let active = true;
    async function loadHeatmap() {
      if (!payload || tab !== "heatmap") return;
      try {
        const data = await requestJson(apiUrl(`/courses/teacher/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/pages/${pageNumber}/heatmap?minimum_confidence=${minimumConfidence}`));
        if (active) setHeatmap(data);
      } catch {
        if (active) setHeatmap(null);
      }
    }
    loadHeatmap();
    return () => {
      active = false;
    };
  }, [payload, tab, pageNumber, courseId, lessonId, minimumConfidence]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setViewerWidth(Math.max(320, Math.floor(entries[0].contentRect.width - 32)));
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => {
    async function renderPage() {
      if (!heatmap?.pdf_url || !canvasRef.current) return;
      const loadingTask = pdfjs.getDocument({
        url: heatmap.pdf_url,
        withCredentials: true,
      });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = viewerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width * window.devicePixelRatio;
      canvas.height = viewport.height * window.devicePixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const overlay = heatmapOverlayRef.current;
      if (overlay) {
        overlay.width = viewport.width;
        overlay.height = viewport.height;
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;
        drawHeatmap(overlay.getContext("2d"), viewport.width, viewport.height, heatmap?.points || []);
      }
    }
    renderPage().catch(() => {});
  }, [heatmap, pageNumber, viewerWidth]);

  const metrics = payload
    ? [
        { label: "Học viên đã học", value: payload.students_started },
        { label: "Phiên học", value: payload.session_count },
        { label: "Session đóng góp", value: payload.valid_session_count },
        { label: "Mẫu gaze map vào PDF", value: payload.total_valid_gaze_samples },
      ]
    : [];

  const currentPageRow = useMemo(() => payload?.pages?.find((row) => row.page_number === pageNumber) || null, [payload, pageNumber]);

  return (
    <>
      <AppHeader active="analytics" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giáo viên", to: "/teacher" }, { label: "Khóa học", to: "/teacher/courses" }, { label: payload?.lesson_title || "Phân tích bài học" }]} />
        <PageHeader title={payload?.lesson_title || "Phân tích bài học"} description="Dữ liệu thật theo từng trang PDF và bản đồ nhiệt theo tọa độ chuẩn hóa của trang." actions={<Link className="btn secondary" to={`/teacher/courses/${courseId}?tab=analytics`}>Quay lại khóa học</Link>} />

        {loading && <section className="panel"><div className="empty-state">Đang tải dữ liệu phân tích...</div></section>}
        {!loading && accessDenied && <section className="panel"><div className="empty-state"><h2>Bạn không có quyền xem dữ liệu phân tích này.</h2><p>Hãy dùng đúng tài khoản giáo viên đã được phân công khóa học.</p></div></section>}
        {!loading && !accessDenied && error && <section className="panel"><div className="empty-state"><h2>Không thể tải dữ liệu phân tích.</h2><p>Vui lòng thử lại.</p></div></section>}
        {!loading && !accessDenied && !error && payload && (
          <>
            <MetricStrip metrics={metrics} />
            <section className="panel">
              <div className="analytics-tabs" role="tablist" aria-label="Tab phân tích bài học">
                {[
                  ["overview", "Tổng quan"],
                  ["pages", "Theo trang"],
                  ["heatmap", "Bản đồ nhiệt"],
                  ["sessions", "Phiên học"],
                ].map(([key, label]) => (
                  <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => {
                    setTab(key);
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("tab", key);
                      next.set("page", String(pageNumber));
                      return next;
                    });
                  }}>{label}</button>
                ))}
              </div>
            </section>

            {tab === "overview" && (
              <section className="panel">
                <div className="system-status-list">
                  <div><span>Trang có dữ liệu</span><strong>{payload.pages_with_data}</strong></div>
                  <div><span>Thời gian phiên trung bình</span><strong>{formatSeconds(payload.average_session_duration_seconds)}</strong></div>
                  <div><span>Hoạt động đầu tiên</span><strong>{fmtDate(payload.first_activity_at)}</strong></div>
                  <div><span>Hoạt động gần nhất</span><strong>{fmtDate(payload.last_activity_at)}</strong></div>
                </div>
              </section>
            )}

            {tab === "pages" && (
              <section className="panel">
                {!payload.pages.length && <div className="empty-state compact">Chưa có dữ liệu phân tích.</div>}
                {!!payload.pages.length && (
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Trang</th>
                        <th>Học viên đã xem</th>
                        <th>Phiên học</th>
                        <th>Thời gian nhìn hợp lệ trung bình</th>
                        <th>Lượt quay lại</th>
                        <th>Confidence</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.pages.map((row) => (
                        <tr key={row.page_number}>
                          <td>Trang {row.page_number}</td>
                          <td>{row.students_viewed}</td>
                          <td>{row.sessions_viewed}</td>
                          <td>{formatSeconds(row.average_valid_gaze_time_seconds)}</td>
                          <td>{row.revisit_count}</td>
                          <td>{confidenceLabel(row.tracking_quality)}</td>
                          <td><button className="btn text" type="button" onClick={() => {
                            setPageNumber(row.page_number);
                            setTab("heatmap");
                            setSearchParams(new URLSearchParams({ tab: "heatmap", page: String(row.page_number) }));
                          }}>Xem heatmap</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {tab === "heatmap" && (
              <section className="dashboard-grid teacher-overview-grid">
                <article className="panel">
                  <div className="section-header">
                    <div><h2>Trang</h2><p className="muted">Chọn trang để xem bản đồ nhiệt.</p></div>
                  </div>
                  <div className="profile-manager-list">
                    {(payload.pages || []).map((row) => (
                      <button key={row.page_number} type="button" className={`btn ${row.page_number === pageNumber ? "primary" : "secondary"}`} onClick={() => {
                        setPageNumber(row.page_number);
                        setSearchParams(new URLSearchParams({ tab: "heatmap", page: String(row.page_number) }));
                      }}>Trang {row.page_number}</button>
                    ))}
                  </div>
                </article>
                <article className="panel" ref={wrapRef}>
                  <div className="section-header"><div><h2>Bản đồ nhiệt</h2><p className="muted">Các điểm được vẽ theo tọa độ chuẩn hóa của trang PDF.</p></div></div>
                  <div style={{ position: "relative", width: "100%" }}>
                    <canvas ref={canvasRef} style={{ display: "block", maxWidth: "100%" }} />
                    <canvas ref={heatmapOverlayRef} style={{ position: "absolute", inset: 0, maxWidth: "100%", pointerEvents: "none", opacity: 0.55 }} />
                  </div>
                  {!heatmap?.points?.length && <div className="empty-state compact">Chưa có dữ liệu phân tích.</div>}
                  <div className="course-meta-badges">
                    <span className="meta-badge">Thấp</span>
                    <span className="meta-badge">Trung bình</span>
                    <span className="meta-badge">Cao</span>
                  </div>
                </article>
                <article className="panel">
                  <div className="section-header"><div><h2>Chi tiết</h2><p className="muted">Chỉ dùng dữ liệu hợp lệ của đúng phiên bản PDF.</p></div></div>
                  <div className="system-status-list">
                    <div><span>Học viên</span><strong>{heatmap?.included_students ?? 0}</strong></div>
                    <div><span>Phiên học</span><strong>{heatmap?.included_sessions ?? 0}</strong></div>
                    <div><span>Mẫu hợp lệ</span><strong>{heatmap?.valid_sample_count ?? 0}</strong></div>
                    <div><span>Phiên bản tài liệu</span><strong>{heatmap?.document_version || "—"}</strong></div>
                    <div><span>Confidence</span><strong>{confidenceLabel(heatmap?.tracking_quality)}</strong></div>
                  </div>
                </article>
              </section>
            )}

            {tab === "sessions" && (
              <section className="panel">
                {!payload.sessions?.length && <div className="empty-state compact">Chưa có dữ liệu phân tích.</div>}
                {!!payload.sessions?.length && (
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Thời gian bắt đầu</th>
                        <th>Thời lượng</th>
                        <th>Trang đã xem</th>
                        <th>Mẫu tracking hợp lệ</th>
                        <th>Confidence</th>
                        <th>Phiên bản tài liệu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.sessions.map((row) => (
                        <tr key={row.session_id}>
                          <td>{row.student_name || row.student_id}</td>
                          <td>{fmtDate(row.started_at)}</td>
                          <td>{formatSeconds(row.duration_seconds)}</td>
                          <td>{row.pages_viewed}</td>
                          <td>{row.valid_tracking_samples}</td>
                          <td>{confidenceLabel(row.tracking_quality)}</td>
                          <td>{row.document_version || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        )}
      </TeacherLayout>
    </>
  );
}
