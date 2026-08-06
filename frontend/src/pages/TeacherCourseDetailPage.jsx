import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { itemTypeLabel } from "../lib/coursePresentation.js";
import { formatPercent, formatSeconds } from "../lib/teacherAnalyticsPresentation.js";

const COURSE_TABS = [
  ["overview", "Tổng quan"],
  ["content", "Nội dung"],
  ["analytics", "Phân tích"],
  ["settings", "Cài đặt"],
];

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

function fmtDate(value) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(item) {
  if (item.access_state === "available") return "Đang mở";
  if (item.access_state === "scheduled") return "Sắp mở";
  if (item.access_state === "closed") return "Đã đóng";
  return "Đã tắt";
}

function tabFromSearch(searchParams) {
  const raw = searchParams.get("tab") || "overview";
  return COURSE_TABS.some(([key]) => key === raw) ? raw : "overview";
}

function UploadLessonModal({ open, onClose, onSubmit, uploading, form, setForm, dragActive }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel teacher-upload-modal" role="dialog" aria-modal="true" aria-label="Thêm bài học" onClick={(event) => event.stopPropagation()}>
        <div className="section-header">
          <div>
            <h2>Thêm bài học</h2>
            <p className="muted">Tải lên một tệp PDF cho bài học. Dung lượng tối đa 100 MB.</p>
          </div>
          <button className="btn text" type="button" onClick={onClose}>Đóng</button>
        </div>
        <form className="teacher-upload-form" onSubmit={onSubmit}>
          <div className="field compact-field">
            <label htmlFor="lessonTitle">Tên bài học</label>
            <input id="lessonTitle" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
          </div>
          <div className="field compact-field">
            <label htmlFor="lessonDescription">Mô tả</label>
            <textarea id="lessonDescription" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          </div>
          <div className={`pdf-dropzone ${dragActive ? "is-dragging" : ""}`}>
            <label htmlFor="lessonFile">Tệp PDF</label>
            <input id="lessonFile" type="file" accept="application/pdf,.pdf" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} hidden />
            <label className="pdf-dropzone-surface" htmlFor="lessonFile">
              <strong>{form.file ? form.file.name : "Chọn hoặc kéo thả tệp PDF"}</strong>
              <span>{form.file ? `${Math.round(form.file.size / 1024)} KB` : "Nhấp để chọn tệp PDF từ máy tính."}</span>
            </label>
          </div>
          <div className="teacher-upload-grid">
            <div className="field compact-field">
              <label htmlFor="lessonOpensAt">Mở từ</label>
              <input id="lessonOpensAt" type="datetime-local" value={form.available_from} onChange={(event) => setForm((current) => ({ ...current, available_from: event.target.value }))} />
            </div>
            <div className="field compact-field">
              <label htmlFor="lessonClosesAt">Đóng lúc</label>
              <input id="lessonClosesAt" type="datetime-local" value={form.available_until} onChange={(event) => setForm((current) => ({ ...current, available_until: event.target.value }))} />
            </div>
          </div>
          <label className="teacher-inline-toggle">
            <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))} />
            <span>Bật cho học viên</span>
          </label>
          <div className="table-actions">
            <button className="btn primary" type="submit" disabled={uploading}>
              {uploading ? "Đang tải lên..." : "Tạo bài học"}
            </button>
            <button className="btn secondary" type="button" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScheduleModal({ item, form, setForm, saving, onClose, onSubmit }) {
  if (!item) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel teacher-upload-modal" role="dialog" aria-modal="true" aria-label="Thiết lập thời gian bài học" onClick={(event) => event.stopPropagation()}>
        <div className="section-header">
          <div>
            <h2>Thiết lập thời gian</h2>
            <p className="muted">{item.title}</p>
          </div>
          <button className="btn text" type="button" onClick={onClose}>Đóng</button>
        </div>
        <form className="teacher-upload-form" onSubmit={onSubmit}>
          <div className="teacher-upload-grid">
            <div className="field compact-field">
              <label htmlFor="scheduleOpenAt">Mở từ</label>
              <input id="scheduleOpenAt" type="datetime-local" value={form.available_from} onChange={(event) => setForm((current) => ({ ...current, available_from: event.target.value }))} />
            </div>
            <div className="field compact-field">
              <label htmlFor="scheduleCloseAt">Đóng lúc</label>
              <input id="scheduleCloseAt" type="datetime-local" value={form.available_until} onChange={(event) => setForm((current) => ({ ...current, available_until: event.target.value }))} />
            </div>
          </div>
          <label className="teacher-inline-toggle">
            <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))} />
            <span>Bật cho học viên</span>
          </label>
          <div className="table-actions">
            <button className="btn primary" type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
            <button className="btn secondary" type="button" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeacherCourseDetailPage() {
  const { courseId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => tabFromSearch(searchParams), [searchParams]);
  const [course, setCourse] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [scheduleItem, setScheduleItem] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ available_from: "", available_until: "", is_enabled: true });
  const [analyticsData, setAnalyticsData] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    is_enabled: true,
    available_from: "",
    available_until: "",
    file: null,
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [courseData, summaryData] = await Promise.all([
        requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}`)),
        requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/teacher-summary`)),
      ]);
      setCourse(courseData);
      setSummary(summaryData);
      setSelectedIds([]);
    } catch (error) {
      setStatus({ message: `Không thể tải khóa học: ${error.message}`, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [courseId]);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      if (activeTab !== "analytics") return;
      try {
        const data = await requestJson(apiUrl(`/courses/teacher/${encodeURIComponent(courseId)}/analytics`));
        if (active) setAnalyticsData(data);
      } catch {
        if (active) setAnalyticsData(null);
      }
    }
    loadAnalytics();
    return () => {
      active = false;
    };
  }, [activeTab, courseId]);

  async function uploadPdfLesson(event) {
    event.preventDefault();
    if (!uploadForm.file) {
      setStatus({ message: "Hãy chọn một tệp PDF trước khi tạo bài học.", kind: "error" });
      return;
    }
    setUploading(true);
    setStatus({ message: "Đang tải lên bài học PDF...", kind: "" });
    try {
      const form = new FormData();
      form.append("title", uploadForm.title.trim());
      form.append("description", uploadForm.description.trim());
      form.append("is_enabled", String(uploadForm.is_enabled));
      if (uploadForm.available_from) form.append("available_from", fromLocalInput(uploadForm.available_from));
      if (uploadForm.available_until) form.append("available_until", fromLocalInput(uploadForm.available_until));
      form.append("file", uploadForm.file);
      await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/lessons/pdf`), { method: "POST", body: form });
      setUploadForm({ title: "", description: "", is_enabled: true, available_from: "", available_until: "", file: null });
      setUploadOpen(false);
      setStatus({ message: "Đã tạo bài học PDF.", kind: "ok" });
      await loadAll();
    } catch (error) {
      setStatus({ message: `Không thể tải lên bài học: ${error.message}`, kind: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function updateItem(item, patch) {
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/items/${encodeURIComponent(item.course_item_id)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadAll();
    } catch (error) {
      setStatus({ message: `Không thể cập nhật bài học: ${error.message}`, kind: "error" });
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    if (!scheduleItem) return;
    setScheduleSaving(true);
    try {
      await updateItem(scheduleItem, {
        available_from: fromLocalInput(scheduleForm.available_from),
        available_until: fromLocalInput(scheduleForm.available_until),
        is_enabled: scheduleForm.is_enabled,
      });
      setScheduleItem(null);
      setStatus({ message: "Đã cập nhật thời gian mở bài học.", kind: "ok" });
    } finally {
      setScheduleSaving(false);
    }
  }

  async function deleteItem(item) {
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/items/${encodeURIComponent(item.course_item_id)}`), { method: "DELETE" });
      setStatus({ message: "Đã xóa bài học.", kind: "ok" });
      await loadAll();
    } catch (error) {
      setStatus({ message: `Không thể xóa bài học: ${error.message}`, kind: "error" });
    }
  }

  async function moveItem(itemId, direction) {
    const items = [...(course?.items || [])];
    const index = items.findIndex((item) => item.course_item_id === itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const [current] = items.splice(index, 1);
    items.splice(nextIndex, 0, current);
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/items/reorder`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: items.map((item) => item.course_item_id) }),
      });
      await loadAll();
    } catch (error) {
      setStatus({ message: `Không thể sắp xếp bài học: ${error.message}`, kind: "error" });
    }
  }

  async function bulkAction(action) {
    if (!selectedIds.length) return;
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}/items/bulk`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: selectedIds, action }),
      });
      await loadAll();
    } catch (error) {
      setStatus({ message: `Không thể cập nhật các mục đã chọn: ${error.message}`, kind: "error" });
    }
  }

  function renderOverview() {
    const metrics = [
      [ "Bài học", summary?.lesson_count ?? 0 ],
      [ "Lớp học đang sử dụng", summary?.class_count ?? 0 ],
      [ "Học viên", summary?.student_count ?? 0 ],
      [ "Phiên học", summary?.session_count ?? 0 ],
    ];
    return (
      <section className="dashboard-grid teacher-overview-grid">
        <article className="panel">
          <div className="section-header">
            <div>
              <h2>Tổng quan khóa học</h2>
              <p className="muted">Chỉ số được tổng hợp từ dữ liệu thực của khóa học hiện tại.</p>
            </div>
          </div>
          <div className="system-status-list">
            {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            <div><span>Phiên có dữ liệu</span><strong>{Math.round((summary?.valid_tracking_session_rate || 0) * 100)}%</strong></div>
            <div><span>Bài học đã hoàn thành</span><strong>{summary?.completed_lesson_count ?? 0}</strong></div>
            <div><span>Hoạt động gần nhất</span><strong>{fmtDate(summary?.recent_activity_at)}</strong></div>
          </div>
        </article>
        <article className="panel">
          <div className="section-header">
            <div>
              <h2>Cần chú ý</h2>
              <p className="muted">Các tín hiệu cần xem lại trong khóa học này.</p>
            </div>
          </div>
          <div className="teacher-attention-list">
            {(summary?.attention_items || []).map((item) => (
              <div className={`attention-item severity-${item.severity}`} key={item.key}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
            {!(summary?.attention_items || []).length && <div className="empty-state compact">Chưa có cảnh báo nào cho khóa học này.</div>}
          </div>
        </article>
      </section>
    );
  }

  function renderContent() {
    const items = course?.items || [];
    return (
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Nội dung khóa học</h2>
            <p className="muted">{items.length} bài học</p>
          </div>
          <button className="btn primary" type="button" onClick={() => setUploadOpen(true)}>Thêm bài học</button>
        </div>
        <div className="table-actions teacher-bulk-toolbar">
          <button className="btn text" type="button" onClick={() => setSelectedIds(items.map((item) => item.course_item_id))}>Chọn tất cả</button>
          <button className="btn text" type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
          <button className="btn secondary" type="button" disabled={!selectedIds.length} onClick={() => bulkAction("enable")}>Bật các mục đã chọn</button>
          <button className="btn secondary" type="button" disabled={!selectedIds.length} onClick={() => bulkAction("disable")}>Tắt các mục đã chọn</button>
        </div>

        {!items.length && !loading && (
          <div className="empty-state">
            <h3>Khóa học chưa có bài học</h3>
            <p>Tạo bài học PDF đầu tiên để học viên có thể bắt đầu học.</p>
            <button className="btn primary" type="button" onClick={() => setUploadOpen(true)}>Thêm bài học</button>
          </div>
        )}

        <div className="teacher-item-list">
          {items.map((item, index) => (
            <article className="teacher-item-row" key={item.course_item_id}>
              <label className="teacher-item-select">
                <input type="checkbox" checked={selectedIds.includes(item.course_item_id)} onChange={() => setSelectedIds((current) => current.includes(item.course_item_id) ? current.filter((id) => id !== item.course_item_id) : [...current, item.course_item_id])} />
              </label>
              <div className="teacher-item-main">
                <div className="teacher-item-head">
                  <strong>{index + 1}. {item.title}</strong>
                  <span>{itemTypeLabel(item.item_type)}</span>
                  {item.pdf_lesson?.page_count ? <span>{item.pdf_lesson.page_count} trang</span> : null}
                  <span className="meta-badge">{statusBadge(item)}</span>
                </div>
                <p className="muted">{item.description || "Không có mô tả."}</p>
                <div className="course-meta-badges">
                  <span className="meta-badge">
                    {item.available_from || item.available_until
                      ? `${item.available_from ? `Mở ${fmtDate(item.available_from)}` : "Mở ngay"}${item.available_until ? ` • Đóng ${fmtDate(item.available_until)}` : ""}`
                      : "Đang mở theo cài đặt hiện tại"}
                  </span>
                  <span className="meta-badge">{item.progress_ratio > 0 ? `${Math.round(item.progress_ratio * 100)}% đã học` : "Chưa có học viên bắt đầu"}</span>
                </div>
              </div>
              <div className="teacher-item-controls">
                <div className="table-actions">
                  <a className="btn text" href={item.pdf_lesson?.pdf_url} target="_blank" rel="noreferrer">Xem trước</a>
                  <button className="btn text" type="button" onClick={() => setSearchParams({ tab: "analytics" })}>Phân tích</button>
                  <button className="btn text" type="button" onClick={() => {
                    setScheduleItem(item);
                    setScheduleForm({
                      available_from: toLocalInput(item.available_from),
                      available_until: toLocalInput(item.available_until),
                      is_enabled: item.is_enabled,
                    });
                  }}>Thiết lập thời gian</button>
                  <button className="btn text" type="button" disabled={index === 0} onClick={() => moveItem(item.course_item_id, -1)}>Lên</button>
                  <button className="btn text" type="button" disabled={index === items.length - 1} onClick={() => moveItem(item.course_item_id, 1)}>Xuống</button>
                  <button className="btn text" type="button" onClick={() => {
                    if (window.confirm(`Xóa bài học "${item.title}"?`)) deleteItem(item);
                  }}>Xóa</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderClasses() {
    return (
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Lớp học</h2>
            <p className="muted">Theo dõi việc sử dụng khóa học theo từng nhóm học viên.</p>
          </div>
        </div>
        <div className="empty-state">
          <h3>Chưa có lớp học sử dụng khóa học này.</h3>
          <p>Tạo lớp học để tổ chức học viên và theo dõi tiến độ theo nhóm.</p>
        </div>
      </section>
    );
  }

  function renderAnalytics() {
    const lessons = analyticsData?.lessons || [];
    return (
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Phân tích</h2>
            <p className="muted">Theo dõi dữ liệu thật theo từng bài học PDF trong khóa học này.</p>
          </div>
          <Link className="btn secondary" to="/teacher/analytics">Mở trung tâm phân tích</Link>
        </div>
        {!lessons.length && <div className="empty-state compact">Chưa có dữ liệu phân tích.</div>}
        {!!lessons.length && (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Bài học</th>
                <th>Học viên đã học</th>
                <th>Phiên học</th>
                <th>Thời gian phiên trung bình</th>
                <th>Session đóng góp</th>
                <th>Trang có dữ liệu</th>
                <th>Hoạt động gần nhất</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => (
                <tr key={lesson.lesson_id}>
                  <td><strong>{lesson.lesson_title}</strong></td>
                  <td>{lesson.students_started}</td>
                  <td>{lesson.session_count}</td>
                  <td>{formatSeconds(lesson.average_session_duration_seconds)}</td>
                  <td>{formatPercent(lesson.valid_tracking_rate)}</td>
                  <td>{lesson.pages_with_data || 0}</td>
                  <td>{fmtDate(lesson.last_activity_at)}</td>
                  <td><Link className="btn text" to={`/teacher/courses/${courseId}/lessons/${lesson.lesson_id}/analytics`}>Xem chi tiết</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Cài đặt</h2>
            <p className="muted">Quản lý cài đặt khóa học từ các công cụ phù hợp theo từng tab.</p>
          </div>
        </div>
        <div className="empty-state compact">Chưa có cài đặt bổ sung cho khóa học này trong phiên bản MVP.</div>
      </section>
    );
  }

  const tabContent = {
    overview: renderOverview(),
    content: renderContent(),
    classes: renderClasses(),
    analytics: renderAnalytics(),
    settings: renderSettings(),
  }[activeTab];

  return (
    <>
      <AppHeader active="courses" />
      <TeacherLayout>
        <Breadcrumbs items={[{ label: "Giáo viên", to: "/teacher" }, { label: "Khóa học", to: "/teacher/courses" }, { label: course?.course_title || courseId }]} />
        <PageHeader
          title={course?.course_title || "Chi tiết khóa học"}
          description={course?.course_description || "Quản lý nội dung và theo dõi hoạt động học tập theo từng khóa học."}
        />

        <section className="panel">
          <div className="course-detail-topline">
            <strong>{course?.course_title || "Đang tải..."}</strong>
            <span>{summary?.lesson_count ?? 0} bài học · {summary?.class_count ?? 0} lớp đang sử dụng · Cập nhật gần nhất {fmtDate(summary?.recent_activity_at)}</span>
          </div>
          <div className="analytics-tabs-wrap">
            <div className="analytics-tabs" role="tablist" aria-label="Tab khóa học">
              {COURSE_TABS.map(([key, label]) => (
                <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setSearchParams({ tab: key })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {tabContent}

        <UploadLessonModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSubmit={uploadPdfLesson}
          uploading={uploading}
          form={uploadForm}
          setForm={setUploadForm}
          dragActive={dragActive}
        />
        <ScheduleModal
          item={scheduleItem}
          form={scheduleForm}
          setForm={setScheduleForm}
          saving={scheduleSaving}
          onClose={() => setScheduleItem(null)}
          onSubmit={saveSchedule}
        />

        {status.message ? <div className={`status-line ${status.kind}`.trim()}>{status.message}</div> : null}
      </TeacherLayout>
    </>
  );
}
