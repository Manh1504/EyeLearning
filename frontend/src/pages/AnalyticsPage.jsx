import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminSidebar } from "../components/AdminShell.jsx";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { AdminLayout, AnalyticsLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { getLessonSlides } from "../data/lessonSlides.js";

const TABS = [
  ["overview", "Tổng quan"],
  ["student", "Học sinh"],
  ["slide", "Slide & AOI"],
  ["pattern", "Pattern quan sát"],
  ["quality", "Chất lượng dữ liệu"],
];

function params() {
  return new URLSearchParams(window.location.search);
}

function getSessionId() {
  return params().get("session_id") || "";
}

function getLessonId() {
  return params().get("lesson_id") || localStorage.getItem("lesson_id") || "";
}

function getBackTarget(role) {
  const from = params().get("from");
  if (from && from.startsWith("/")) return from;
  return role === "admin" ? "/admin/sessions" : "/teacher";
}

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtPct(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const formatter = digits === 0
    ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
    : new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${formatter.format(Number(value) * 100)}%`;
}

function fmtSeconds(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return "-";
  const seconds = Number(ms) / 1000;
  return seconds < 60
    ? `${percentFormatter.format(seconds)} giây`
    : `${Math.floor(seconds / 60)} phút ${Math.round(seconds % 60)} giây`;
}

function fmtRatio(value) {
  if (value === null || value === undefined) return "Chưa đủ cohort";
  return `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}×`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function slideLabel(slides, slideId) {
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return slideId || "-";
  return `Slide ${index + 1}: ${slides[index].title}`;
}

function slideMeta(slides, slideId) {
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return { orderLabel: slideId || "-", title: slideId || "-" };
  return {
    orderLabel: `Slide ${String(index + 1).padStart(2, "0")}`,
    title: slides[index].title,
  };
}

function fetchLearningAnalytics({ sessionId, lessonId }) {
  const path = sessionId
    ? `/learning-analytics/sessions/${encodeURIComponent(sessionId)}`
    : `/learning-analytics/lessons/${encodeURIComponent(lessonId)}`;
  return requestJson(apiUrl(path));
}

function fetchHeatmaps(sessionId) {
  if (!sessionId) return Promise.resolve([]);
  return requestJson(apiUrl(`/heatmaps/${encodeURIComponent(sessionId)}`));
}

function generateSlideHeatmap(sessionId, slideId) {
  return requestJson(apiUrl(`/heatmaps/generate/${encodeURIComponent(sessionId)}?slide_id=${encodeURIComponent(slideId)}`), {
    method: "POST",
  });
}

function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function DataQualityBadge({ value }) {
  const ok = value === "ok";
  return <span className={`quality-badge ${ok ? "ok" : "warn"}`}>{ok ? "Đủ tin cậy" : "Coverage thấp"}</span>;
}

function SlidePreviewContent({ slide }) {
  if (!slide) return null;
  if (slide.type === "title") {
    return (
      <div className="analytics-slide-content analytics-slide-title">
        <p>{slide.eyebrow}</p>
        <h3>{slide.title}</h3>
        <span>{slide.subtitle}</span>
      </div>
    );
  }
  if (slide.type === "pdf-page") {
    return (
      <div className="analytics-slide-content analytics-slide-pdf">
        <img src={slide.imageSrc} alt={`${slide.eyebrow} - trang ${slide.page}`} />
      </div>
    );
  }
  if (slide.type === "image") {
    return (
      <div className="analytics-slide-content analytics-slide-split">
        <div>
          <p>{slide.eyebrow}</p>
          <h3>{slide.title}</h3>
          <span>{slide.body}</span>
        </div>
        <div className="analytics-mini-chart" aria-hidden="true">
          {[44, 66, 52, 76, 70].map((height, index) => <i key={index} style={{ height: `${height}%` }}></i>)}
        </div>
      </div>
    );
  }
  if (slide.type === "media") {
    return (
      <div className="analytics-slide-content analytics-slide-media">
        <p>{slide.eyebrow}</p>
        <h3>{slide.title}</h3>
        <div><strong>Video bài giảng</strong><span>12:45 / 45:00</span></div>
        <span>{slide.body}</span>
      </div>
    );
  }
  if (slide.type === "example") {
    return (
      <div className="analytics-slide-content analytics-slide-split">
        <div>
          <p>{slide.eyebrow}</p>
          <h3>{slide.title}</h3>
          <span>{slide.body}</span>
        </div>
        <div className="analytics-line-chart" aria-hidden="true"></div>
      </div>
    );
  }
  if (slide.type === "quiz") {
    return (
      <div className="analytics-slide-content analytics-slide-quiz">
        <p>{slide.eyebrow}</p>
        <h3>{slide.title}</h3>
        {slide.options?.map((option) => <span key={option}>{option}</span>)}
      </div>
    );
  }
  return (
    <div className="analytics-slide-content">
      <p>{slide.eyebrow}</p>
      <h3>{slide.title}</h3>
      {slide.body && <span>{slide.body}</span>}
      {slide.bullets?.map((bullet) => <span key={bullet}>{bullet}</span>)}
    </div>
  );
}

function SlideHeatmapPreview({ heatmap, slide }) {
  const points = heatmap?.metadata_json?.slide_preview_points || [];
  if (!heatmap?.image_url) return <span>Chưa có heatmap cho slide đã chọn.</span>;
  if (!slide || !points.length) {
    return <span>Heatmap slide này được tạo bằng phiên bản cũ. Bấm “Tạo heatmap slide” để dựng lại trên nội dung slide thật.</span>;
  }
  return (
    <div className="analytics-slide-heatmap">
      <SlidePreviewContent slide={slide} />
      <div className="analytics-heatmap-layer" aria-hidden="true">
        {points.map((point, index) => (
          <i
            key={`${point.timestamp_ms || index}-${index}`}
            style={{
              left: `${Number(point.x) * 100}%`,
              top: `${Number(point.y) * 100}%`,
              opacity: Math.max(0.45, Math.min(0.95, Number(point.confidence ?? 0.75))),
            }}
          ></i>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPageHeader({ role, backTarget, metadata, metrics }) {
  return (
    <>
      <Breadcrumbs
        items={[
          role === "admin" ? { label: "Quản trị", to: "/admin" } : { label: "Lớp học", to: "/teacher" },
          { label: "ELA" },
          { label: "Learning Analytics" },
        ]}
      />

      <section className="analytics-page-header">
        <PageHeader
          title="Learning Analytics"
          description="Phân tích dữ liệu ánh nhìn theo slide, AOI và pattern quan sát. Các chỉ số chỉ mô tả tín hiệu thị giác, không dùng để kết luận trực tiếp về mức độ tập trung hoặc năng lực của học sinh."
          actions={
            <>
              <Link className="btn secondary" to={backTarget}>Quay lại</Link>
              {role === "admin" && <Link className="btn outline" to="/admin/eye-tracking-test">Kiểm thử live heatmap</Link>}
            </>
          }
        />

        <section className="analytics-context-card" aria-label="Ngữ cảnh phân tích">
          <div className="analytics-context-card__header">
            <h2>Ngữ cảnh phân tích</h2>
          </div>
          <dl className="analytics-context-grid">
            {metadata.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd title={value}>{value || "-"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="analytics-kpi-grid" aria-label="Tóm tắt chỉ số">
          {metrics.map((metric) => (
            <article className="analytics-kpi-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.detail ? <p>{metric.detail}</p> : <p className="is-empty" aria-hidden="true">.</p>}
            </article>
          ))}
        </section>
      </section>
    </>
  );
}

function AnalyticsTabs({ activeTab, setActiveTab }) {
  const currentIndex = TABS.findIndex(([key]) => key === activeTab);

  function onKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    setActiveTab(TABS[nextIndex][0]);
  }

  return (
    <nav className="analytics-tabs-wrap" aria-label="Điều hướng tab analytics">
      <div className="analytics-tabs" role="tablist" aria-label="Learning Analytics tabs" onKeyDown={onKeyDown}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            id={`analytics-tab-${key}`}
            className={activeTab === key ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`analytics-panel-${key}`}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function MatrixLegend() {
  return (
    <div className="matrix-legend" aria-label="Chú giải RVT">
      <span><i className="is-low" aria-hidden="true"></i>RVT thấp hơn cohort</span>
      <span><i className="is-mid" aria-hidden="true"></i>Gần trung vị cohort</span>
      <span><i className="is-high" aria-hidden="true"></i>RVT cao hơn cohort</span>
      <span><i className="is-empty" aria-hidden="true"></i>Chưa đủ dữ liệu</span>
    </div>
  );
}

function StudentSlideMatrix({ studentOptions, cohortRows, studentRows, lessonSlides, onSelect, emptyReason }) {
  if (!studentOptions.length) {
    return <EmptyState title="Chưa có đủ dữ liệu để tạo ma trận" body={emptyReason || "Cần phiên học có tracking coverage đủ tin cậy."} />;
  }

  return (
    <div className="analytics-matrix-wrap">
      <table className="analytics-matrix-table">
        <thead>
          <tr>
            <th scope="col" className="matrix-student-heading">Học sinh</th>
            {cohortRows.map((slide) => {
              const meta = slideMeta(lessonSlides, slide.slide_id);
              return (
                <th scope="col" key={slide.slide_id} title={meta.title}>
                  <span>{meta.orderLabel}</span>
                  <strong>{meta.title}</strong>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {studentOptions.map((student) => (
            <MatrixRow
              key={student.id}
              student={student}
              lessonSlides={lessonSlides}
              slides={cohortRows}
              rows={studentRows.filter((row) => row.student_id === student.id)}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightPanel({ insights, onSelect }) {
  return (
    <section className="analytics-insight-section">
      <div className="section-header">
        <div>
          <h2>Tín hiệu cần kiểm tra</h2>
          <p className="muted">Các tín hiệu được tạo từ quy tắc minh bạch và đi kèm bằng chứng dữ liệu.</p>
        </div>
      </div>
      <div className="insight-list">
        {insights?.length ? insights.map((item) => (
          <button key={`${item.kind}-${item.slide_id}`} className="insight-card" type="button" onClick={() => onSelect(item.slide_id)}>
            <span className="insight-card__type">{item.kind || "Tín hiệu"}</span>
            <strong>{item.title}</strong>
            <div className="insight-card__meta">
              <span>Bằng chứng</span>
              <p>{item.evidence}</p>
            </div>
            <p className="insight-card__body">{item.description}</p>
          </button>
        )) : <EmptyState title="Chưa có tín hiệu" body="Cần thêm phiên học hoặc AOI hợp lệ trước khi tạo tín hiệu mô tả." />}
      </div>
      <div className="analytics-note" role="note">
        <strong>Ghi chú</strong>
        <span>Các tín hiệu chỉ hỗ trợ kiểm tra và diễn giải dữ liệu. Không sử dụng riêng lẻ để đánh giá mức độ tập trung, khả năng học tập hoặc kết quả của học sinh.</span>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const role = user?.role || "teacher";
  const sessionId = getSessionId();
  const lessonId = getLessonId();
  const lessonSlides = useMemo(() => getLessonSlides(lessonId), [lessonId]);
  const backTarget = getBackTarget(role);

  const [activeTab, setActiveTab] = useState(params().get("tab") || "overview");
  const [payload, setPayload] = useState(null);
  const [heatmaps, setHeatmaps] = useState([]);
  const [selectedSlideId, setSelectedSlideId] = useState(lessonSlides[0]?.id || "slide-1");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedHeatmap, setSelectedHeatmap] = useState(null);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function load() {
    if (!sessionId && !lessonId) {
      setPayload(null);
      setHeatmaps([]);
      setStatus({ message: "Chọn khóa học và bài học để xem analytics.", kind: "" });
      return;
    }
    setLoading(true);
    setStatus({ message: "Đang tải learning analytics...", kind: "" });
    try {
      const [analytics, heatmapList] = await Promise.all([
        fetchLearningAnalytics({ sessionId, lessonId }),
        fetchHeatmaps(sessionId),
      ]);
      setPayload(analytics);
      setHeatmaps(heatmapList);
      setSelectedStudentId((value) => value || analytics.student_focus?.[0]?.student_id || analytics.student_slide_rows?.[0]?.student_id || "");
      const preferredSlide = analytics.student_focus?.[0]?.slide_id || analytics.cohort_slide_rows?.[0]?.slide_id || lessonSlides[0]?.id;
      if (preferredSlide) setSelectedSlideId(preferredSlide);
      setSelectedHeatmap(heatmapList.find((item) => item.metadata_json?.slide_id === preferredSlide) || heatmapList[0] || null);
      setStatus({ message: analytics.empty_reason || "Đã tải analytics từ dữ liệu phiên học thật.", kind: analytics.empty_reason ? "error" : "ok" });
    } catch (error) {
      setPayload(null);
      setStatus({ message: `Không thể tải analytics: ${error.message}`, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, lessonId]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", activeTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [activeTab]);

  async function handleGenerateHeatmap() {
    if (!sessionId) {
      setStatus({ message: "Cần mở analytics từ một phiên cụ thể để tạo heatmap theo slide.", kind: "error" });
      return;
    }
    setHeatmapLoading(true);
    setStatus({ message: `Đang tạo heatmap cho ${slideLabel(lessonSlides, selectedSlideId)}...`, kind: "" });
    try {
      const heatmap = await generateSlideHeatmap(sessionId, selectedSlideId);
      const list = await fetchHeatmaps(sessionId);
      setHeatmaps(list);
      setSelectedHeatmap(heatmap.status === "done" ? heatmap : list.find((item) => item.metadata_json?.slide_id === selectedSlideId) || heatmap);
      setStatus({
        message: heatmap.status === "done"
          ? `Đã tạo heatmap theo slide từ ${heatmap.point_count ?? 0} mẫu.`
          : heatmap.error_message || "Chưa tạo được heatmap cho slide này.",
        kind: heatmap.status === "done" ? "ok" : "error",
      });
    } catch (error) {
      setStatus({ message: `Không thể tạo heatmap: ${error.message}`, kind: "error" });
    } finally {
      setHeatmapLoading(false);
    }
  }

  const summary = payload?.summary || {};
  const studentRows = payload?.student_slide_rows || [];
  const cohortRows = payload?.cohort_slide_rows || [];
  const aoiRows = payload?.aoi_rows || [];
  const selectedStudentRows = studentRows.filter((row) => !selectedStudentId || row.student_id === selectedStudentId);
  const selectedSlideAois = aoiRows.filter((row) => row.slide_id === selectedSlideId);
  const studentOptions = useMemo(() => {
    const map = new Map();
    studentRows.forEach((row) => map.set(row.student_id, row.student_name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [studentRows]);
  const lsa = payload?.lsa || {};
  const slideHeatmap = useMemo(
    () => heatmaps.find((item) => item.metadata_json?.slide_id === selectedSlideId) || null,
    [heatmaps, selectedSlideId]
  );
  const selectedSlide = useMemo(
    () => lessonSlides.find((slide) => slide.id === selectedSlideId) || null,
    [lessonSlides, selectedSlideId]
  );

  const metadata = [
    ["Bài học", lessonId],
    ["Phiên", sessionId || "Toàn bộ phiên hợp lệ"],
    ["Cập nhật", formatDate(new Date())],
    ["Phiên bản thuật toán", payload?.algorithm_version || "Chưa ghi nhận"],
  ];

  const metrics = [
    {
      label: "Học sinh hợp lệ",
      value: `${summary.valid_students ?? 0}/${summary.students ?? 0}`,
      detail: summary.students ? `${fmtPct((summary.valid_students ?? 0) / summary.students, 0)} học sinh có ít nhất một phiên hợp lệ` : "",
    },
    {
      label: "Phiên hợp lệ",
      value: `${summary.valid_sessions ?? 0}/${summary.sessions ?? 0}`,
      detail: summary.sessions !== undefined && summary.valid_sessions !== undefined ? `${Math.max(0, summary.sessions - summary.valid_sessions)} phiên chưa đạt điều kiện dữ liệu` : "",
    },
    {
      label: "Độ phủ tracking",
      value: fmtPct(summary.tracking_coverage, 1),
      detail: summary.tracking_coverage !== undefined ? "Tỷ lệ dữ liệu theo dõi đạt điều kiện phân tích" : "",
    },
    {
      label: "Số fixation hợp lệ",
      value: numberFormatter.format(summary.fixation_count ?? 0),
      detail: summary.fixation_count !== undefined ? "Tổng fixation được dùng trong báo cáo" : "",
    },
  ];

  const content = (
    <>
      <AnalyticsPageHeader role={role} backTarget={backTarget} metadata={metadata} metrics={metrics} />
      <AnalyticsTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {loading && <section className="panel analytics-panel"><EmptyState title="Đang tải dữ liệu" body="ELA đang tính lại metric từ tracking points đã ghi nhận." /></section>}

      {!loading && !payload && <section className="panel analytics-panel"><EmptyState title="Không tải được phân tích" body="Kiểm tra quyền truy cập, phiên học hoặc trạng thái hệ thống rồi thử lại." /></section>}

      {!loading && payload && activeTab === "overview" && (
        <section className="analytics-grid" id="analytics-panel-overview" role="tabpanel" aria-labelledby="analytics-tab-overview">
          <div className="panel analytics-panel analytics-section-card span-2">
            <div className="section-header">
              <div>
                <h2>Ma trận học sinh × slide</h2>
                <p className="muted">Mỗi ô thể hiện RVT - tỷ lệ thời gian xem hợp lệ của học sinh so với trung vị cohort trên cùng slide và phiên bản.</p>
              </div>
              <MatrixLegend />
            </div>
            <StudentSlideMatrix
              studentOptions={studentOptions}
              cohortRows={cohortRows}
              studentRows={studentRows}
              lessonSlides={lessonSlides}
              emptyReason={payload.empty_reason}
              onSelect={(studentId, slideId) => {
                setSelectedStudentId(studentId);
                setSelectedSlideId(slideId);
                setActiveTab("student");
              }}
            />
          </div>

          <div className="panel analytics-panel analytics-section-card">
            <InsightPanel insights={payload.insights} onSelect={(slideId) => {
              setSelectedSlideId(slideId);
              setActiveTab("slide");
            }} />
          </div>
        </section>
      )}

      {!loading && payload && activeTab === "student" && (
        <section className="panel analytics-panel analytics-section-card" id="analytics-panel-student" role="tabpanel" aria-labelledby="analytics-tab-student">
          <FilterBar
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            studentOptions={studentOptions}
          />
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Slide</th><th>RVT</th><th>Thời gian xem</th><th>Cohort median</th><th>Fixation</th><th>AOI coverage</th><th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {selectedStudentRows.map((row) => (
                <tr key={`${row.student_id}-${row.slide_id}-${row.slide_version}`} onClick={() => setSelectedSlideId(row.slide_id)}>
                  <td>{slideLabel(lessonSlides, row.slide_id)}</td>
                  <td><strong>{fmtRatio(row.relative_viewing_time)}</strong></td>
                  <td>{fmtSeconds(row.valid_viewing_ms)}</td>
                  <td>{fmtSeconds(row.cohort_baseline_ms)}</td>
                  <td>{row.fixation_count}</td>
                  <td>{row.aoi_coverage}</td>
                  <td><DataQualityBadge value={row.data_quality} /></td>
                </tr>
              ))}
              {!selectedStudentRows.length && <tr><td colSpan={7} className="empty-cell">Chưa có dữ liệu cho học sinh đã chọn.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {!loading && payload && activeTab === "slide" && (
        <section className="analytics-grid" id="analytics-panel-slide" role="tabpanel" aria-labelledby="analytics-tab-slide">
          <div className="panel analytics-panel analytics-section-card">
            <div className="section-header">
              <div>
                <h2>Heatmap theo slide</h2>
                <p className="muted">Heatmap chung toàn trang không còn là view chính khi bài học chạy theo slide.</p>
              </div>
            </div>
            <div className="filter-bar">
              <select
                value={selectedSlideId}
                onChange={(event) => {
                  const nextSlideId = event.target.value;
                  setSelectedSlideId(nextSlideId);
                  setSelectedHeatmap(heatmaps.find((item) => item.metadata_json?.slide_id === nextSlideId) || null);
                }}
                aria-label="Chọn slide"
              >
                {lessonSlides.map((slide, index) => <option key={slide.id} value={slide.id}>Slide {index + 1}: {slide.title}</option>)}
              </select>
              <button className="btn primary" type="button" disabled={heatmapLoading || !sessionId} onClick={handleGenerateHeatmap}>
                {heatmapLoading ? "Đang tạo..." : "Tạo heatmap slide"}
              </button>
            </div>
            <div className="heatmap-preview">
              <SlideHeatmapPreview heatmap={slideHeatmap} slide={selectedSlide} />
            </div>
            <div className="heatmap-list compact">
              {heatmaps.filter((item) => item.metadata_json?.slide_id).map((item) => (
                <button key={item.heatmap_id} className={slideHeatmap?.heatmap_id === item.heatmap_id ? "selected" : ""} type="button" onClick={() => {
                  setSelectedHeatmap(item);
                  setSelectedSlideId(item.metadata_json?.slide_id || selectedSlideId);
                }}>
                  <strong>{slideLabel(lessonSlides, item.metadata_json?.slide_id)}</strong>
                  <span>{item.point_count ?? 0} mẫu</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel analytics-panel analytics-section-card">
            <div className="section-header"><div><h2>AOI trên slide</h2><p className="muted">AOI được tính từ fixation hợp lệ, không dùng sample calibration/validation.</p></div></div>
            <table className="analytics-table">
              <thead><tr><th>AOI</th><th>Dwell</th><th>Fixation</th><th>Học sinh</th><th>First fixation</th><th>Revisit</th></tr></thead>
              <tbody>
                {selectedSlideAois.map((row) => (
                  <tr key={`${row.slide_id}-${row.aoi_key}`}>
                    <td>{row.aoi_name}</td>
                    <td>{fmtSeconds(row.dwell_ms)}</td>
                    <td>{row.fixation_count}</td>
                    <td>{row.students_reached}</td>
                    <td>{fmtSeconds(row.median_time_to_first_fixation_ms)}</td>
                    <td>{fmtPct(row.revisit_rate, 0)}</td>
                  </tr>
                ))}
                {!selectedSlideAois.length && <tr><td colSpan={6} className="empty-cell">Slide này chưa có AOI/fixation hợp lệ.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && payload && activeTab === "pattern" && (
        <section className="analytics-grid" id="analytics-panel-pattern" role="tabpanel" aria-labelledby="analytics-tab-pattern">
          <div className="panel analytics-panel analytics-section-card span-2">
            <div className="section-header">
              <div>
                <h2>Lag-1 transition matrix</h2>
                <p className="muted">Transition chỉ nối fixation trong cùng học sinh, session, slide, version và exposure. AOI trùng liên tiếp được gộp.</p>
              </div>
              <span className={`quality-badge ${lsa.status === "ready" ? "ok" : "warn"}`}>{lsa.status === "ready" ? "Đủ dữ liệu" : "Chưa đủ dữ liệu"}</span>
            </div>
            <TransitionMatrix transitions={lsa.transitions || []} />
          </div>

          <div className="panel analytics-panel analytics-section-card">
            <div className="section-header"><div><h2>Sequence phổ biến</h2><p className="muted">Chỉ mô tả pattern quan sát, không diễn giải nguyên nhân.</p></div></div>
            <div className="sequence-list">
              {lsa.representative_sequences?.length ? lsa.representative_sequences.map((item) => (
                <div key={item.sequence.join(">")}>
                  <strong>{item.sequence.join(" -> ")}</strong>
                  <span>{item.count} exposure</span>
                </div>
              )) : <EmptyState title="Chưa có sequence" body={lsa.reason || "Cần thêm fixation hợp lệ."} />}
            </div>
          </div>
        </section>
      )}

      {!loading && payload && activeTab === "quality" && (
        <section className="panel analytics-panel analytics-section-card" id="analytics-panel-quality" role="tabpanel" aria-labelledby="analytics-tab-quality">
          <div className="section-header"><div><h2>Chất lượng dữ liệu</h2><p className="muted">Lỗi tracking được tách khỏi hành vi học sinh.</p></div></div>
          <table className="analytics-table">
            <thead><tr><th>Học sinh</th><th>Phiên</th><th>Samples</th><th>Content valid</th><th>Coverage</th><th>Fixation</th><th>Loại trừ</th></tr></thead>
            <tbody>
              {payload.data_quality?.map((row) => (
                <tr key={row.session_id}>
                  <td>{row.student_name}</td>
                  <td>{row.session_id}</td>
                  <td>{row.total_samples ?? 0}</td>
                  <td>{row.valid_content_samples ?? 0}</td>
                  <td>{fmtPct(row.tracking_coverage, 1)}</td>
                  <td>{row.fixation_count ?? 0}</td>
                  <td>{row.excluded_samples ?? 0}</td>
                </tr>
              ))}
              {!payload.data_quality?.length && <tr><td colSpan={7} className="empty-cell">Chưa có dữ liệu quality.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
    </>
  );

  return (
    <>
      <AppHeader
        active="results"
        sidebarToggle={role === "admin" ? {
          open: sidebarOpen,
          controls: "admin-sidebar",
          label: "Mở điều hướng quản trị",
          onToggle: () => setSidebarOpen((value) => !value),
        } : null}
      />
      {role === "admin" ? (
        <AdminLayout className="admin-dashboard analytics-page">
          <AdminSidebar active="analytics" mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="dashboard-workspace">{content}</div>
        </AdminLayout>
      ) : (
        <AnalyticsLayout className="analytics-page">{content}</AnalyticsLayout>
      )}
    </>
  );
}

function FilterBar({ selectedStudentId, setSelectedStudentId, studentOptions }) {
  return (
    <div className="filter-bar">
      <label htmlFor="analytics-student-filter">
        <span>Học sinh</span>
        <select id="analytics-student-filter" value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
          {studentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
      </label>
    </div>
  );
}

function MatrixRow({ student, lessonSlides, slides, rows, onSelect }) {
  const bySlide = new Map(rows.map((row) => [row.slide_id, row]));
  return (
    <tr>
      <th scope="row" className="matrix-student">
        <strong>{student.name}</strong>
        <span>{student.id}</span>
      </th>
      {slides.map((slide) => {
        const row = bySlide.get(slide.slide_id);
        const value = row?.relative_viewing_time;
        const hasData = value !== null && value !== undefined;
        const intensity = hasData ? Math.max(0, Math.min(1, Math.abs(value - 1))) : 0;
        const tone = !hasData ? "is-empty" : value > 1.15 ? "is-high" : value < 0.75 ? "is-low" : "is-mid";
        const style = !hasData
          ? {}
          : { "--cell-alpha": 0.12 + intensity * 0.45 };
        return (
          <td key={slide.slide_id}>
            <button
              className={`matrix-cell ${tone}`}
              style={style}
              type="button"
              title={hasData
                ? `${student.name} - ${slideLabel(lessonSlides, slide.slide_id)} | RVT ${fmtRatio(value)} | Thời gian xem ${fmtSeconds(row.valid_viewing_ms)} | Cohort ${fmtSeconds(row.cohort_baseline_ms)}`
                : `${student.name} - ${slideLabel(lessonSlides, slide.slide_id)} | Chưa đủ dữ liệu`}
              onClick={() => onSelect(student.id, slide.slide_id)}
            >
              <strong>{hasData ? fmtRatio(value) : "Thiếu cohort"}</strong>
              <span>{row ? fmtPct(row.tracking_coverage, 0) : "Chưa đủ dữ liệu"}</span>
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function TransitionMatrix({ transitions }) {
  if (!transitions.length) return <EmptyState title="Chưa đủ dữ liệu LSA" body="Cần thêm transition hợp lệ sau khi gộp fixation liên tiếp trong cùng slide exposure." />;
  const top = transitions
    .filter((row) => row.passes_support)
    .sort((a, b) => Math.abs(b.adjusted_residual) - Math.abs(a.adjusted_residual))
    .slice(0, 18);
  return (
    <table className="analytics-table transition-table">
      <thead>
        <tr>
          <th>Từ AOI</th><th>Sang AOI</th><th>Count</th><th>P(j|i)</th><th>Expected</th><th>Residual</th><th>FDR p</th><th>Học sinh</th>
        </tr>
      </thead>
      <tbody>
        {top.map((row) => (
          <tr key={`${row.source_aoi}-${row.target_aoi}`}>
            <td>{row.source_aoi}</td>
            <td>{row.target_aoi}</td>
            <td>{row.observed_count}</td>
            <td>{fmtPct(row.probability, 1)}</td>
            <td>{row.expected_count.toFixed(2)}</td>
            <td><span className={row.adjusted_residual >= 0 ? "residual-pos" : "residual-neg"}>{row.adjusted_residual.toFixed(2)}</span></td>
            <td>{row.adjusted_p_value?.toFixed(3) ?? "-"}</td>
            <td>{row.contributing_students}</td>
          </tr>
        ))}
        {!top.length && <tr><td colSpan={8} className="empty-cell">Có transition nhưng chưa đạt minimum support.</td></tr>}
      </tbody>
    </table>
  );
}
