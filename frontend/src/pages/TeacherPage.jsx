import { useEffect, useState } from "react";
import { AppHeader } from "../components/AppShell.jsx";
import { TeacherLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { itemTypeLabel } from "../lib/coursePresentation.js";

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function TeacherPage() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [course, setCourse] = useState(null);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    is_enabled: true,
    available_from: "",
    available_until: "",
    file: null,
  });

  async function loadCourses() {
    try {
      const data = await requestJson(apiUrl("/courses/my"));
      setCourses(data);
      if (!selectedCourseId && data[0]?.course_id) setSelectedCourseId(data[0].course_id);
    } catch (error) {
      setStatus({ message: `Không thể tải khóa học: ${error.message}`, kind: "error" });
    }
  }

  async function loadCourse(courseId) {
    if (!courseId) return;
    setLoading(true);
    try {
      const data = await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}`));
      setCourse(data);
      setSelectedIds([]);
    } catch (error) {
      setStatus({ message: `Không thể tải chi tiết khóa học: ${error.message}`, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    loadCourse(selectedCourseId);
  }, [selectedCourseId]);

  async function uploadPdfLesson(event) {
    event.preventDefault();
    if (!selectedCourseId || !uploadForm.file) return;
    setUploading(true);
    setStatus({ message: "Đang upload PDF lesson...", kind: "" });
    try {
      const form = new FormData();
      form.append("title", uploadForm.title.trim());
      form.append("description", uploadForm.description.trim());
      form.append("is_enabled", String(uploadForm.is_enabled));
      if (uploadForm.available_from) form.append("available_from", fromLocalInput(uploadForm.available_from));
      if (uploadForm.available_until) form.append("available_until", fromLocalInput(uploadForm.available_until));
      form.append("file", uploadForm.file);
      await requestJson(apiUrl(`/courses/${encodeURIComponent(selectedCourseId)}/lessons/pdf`), {
        method: "POST",
        body: form,
      });
      setUploadForm({ title: "", description: "", is_enabled: true, available_from: "", available_until: "", file: null });
      setStatus({ message: "Đã tạo PDF lesson.", kind: "ok" });
      await loadCourse(selectedCourseId);
    } catch (error) {
      setStatus({ message: `Không thể upload PDF lesson: ${error.message}`, kind: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function updateItem(item, patch) {
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(selectedCourseId)}/items/${encodeURIComponent(item.course_item_id)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadCourse(selectedCourseId);
    } catch (error) {
      setStatus({ message: `Không thể cập nhật item: ${error.message}`, kind: "error" });
    }
  }

  async function deleteItem(item) {
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(selectedCourseId)}/items/${encodeURIComponent(item.course_item_id)}`), {
        method: "DELETE",
      });
      setStatus({ message: "Đã xóa item.", kind: "ok" });
      await loadCourse(selectedCourseId);
    } catch (error) {
      setStatus({ message: `Không thể xóa item: ${error.message}`, kind: "error" });
    }
  }

  async function moveItem(itemId, direction) {
    if (!course) return;
    const items = [...course.items];
    const index = items.findIndex((item) => item.course_item_id === itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const [current] = items.splice(index, 1);
    items.splice(nextIndex, 0, current);
    try {
      await requestJson(apiUrl(`/courses/${encodeURIComponent(selectedCourseId)}/items/reorder`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: items.map((item) => item.course_item_id) }),
      });
      await loadCourse(selectedCourseId);
    } catch (error) {
      setStatus({ message: `Không thể sắp xếp item: ${error.message}`, kind: "error" });
    }
  }

  async function bulkAction(action) {
    if (!selectedIds.length) return;
    try {
      const body = { item_ids: selectedIds, action };
      if (action === "set_availability") {
        const first = course.items.find((item) => item.course_item_id === selectedIds[0]);
        body.available_from = first?.available_from || null;
        body.available_until = first?.available_until || null;
      }
      await requestJson(apiUrl(`/courses/${encodeURIComponent(selectedCourseId)}/items/bulk`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await loadCourse(selectedCourseId);
    } catch (error) {
      setStatus({ message: `Không thể chạy bulk action: ${error.message}`, kind: "error" });
    }
  }

  function toggleSelection(courseItemId) {
    setSelectedIds((current) => current.includes(courseItemId) ? current.filter((id) => id !== courseItemId) : [...current, courseItemId]);
  }

  const items = course?.items || [];

  return (
    <>
      <AppHeader active="home" />
      <TeacherLayout className="teacher-dashboard">
        <div className="dashboard-workspace teacher-manager-page">
          <header className="dashboard-hero">
            <div>
              <div className="course-kicker">Teacher course management</div>
              <h1>Quản lý PDF lesson</h1>
              <p className="muted">Tạo, thay PDF, bật tắt và sắp xếp course item theo mô hình MVP.</p>
            </div>
            <div className="dashboard-filters">
              <div className="field compact-field">
                <label htmlFor="teacherCourseSelect">Khóa học</label>
                <select id="teacherCourseSelect" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                  {courses.map((entry) => <option key={entry.course_id} value={entry.course_id}>{entry.course_title}</option>)}
                </select>
              </div>
            </div>
          </header>

          <section className="panel teacher-upload-panel">
            <div className="section-header">
              <div>
                <h2>Tạo PDF lesson</h2>
                <p className="muted">Upload một file PDF cho mỗi lesson. PPTX không còn được hỗ trợ trực tiếp.</p>
              </div>
            </div>
            <form className="teacher-upload-form" onSubmit={uploadPdfLesson}>
              <div className="field compact-field">
                <label htmlFor="lessonTitle">Tiêu đề</label>
                <input id="lessonTitle" value={uploadForm.title} onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))} required />
              </div>
              <div className="field compact-field">
                <label htmlFor="lessonDescription">Mô tả</label>
                <input id="lessonDescription" value={uploadForm.description} onChange={(event) => setUploadForm((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="field compact-field">
                <label htmlFor="lessonFile">PDF</label>
                <input id="lessonFile" type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} required />
              </div>
              <div className="field compact-field">
                <label htmlFor="lessonOpensAt">Mở từ</label>
                <input id="lessonOpensAt" type="datetime-local" value={uploadForm.available_from} onChange={(event) => setUploadForm((current) => ({ ...current, available_from: event.target.value }))} />
              </div>
              <div className="field compact-field">
                <label htmlFor="lessonClosesAt">Đóng lúc</label>
                <input id="lessonClosesAt" type="datetime-local" value={uploadForm.available_until} onChange={(event) => setUploadForm((current) => ({ ...current, available_until: event.target.value }))} />
              </div>
              <label className="teacher-inline-toggle">
                <input type="checkbox" checked={uploadForm.is_enabled} onChange={(event) => setUploadForm((current) => ({ ...current, is_enabled: event.target.checked }))} />
                <span>Bật cho học viên</span>
              </label>
              <button className="btn primary" type="submit" disabled={uploading || !selectedCourseId}>
                {uploading ? "Đang upload..." : "Tạo lesson"}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <h2>Course items</h2>
                <p className="muted">{loading ? "Đang tải..." : `${items.length} item`}</p>
              </div>
              <div className="table-actions">
                <button className="btn text" type="button" onClick={() => setSelectedIds(items.map((item) => item.course_item_id))}>Chọn tất cả</button>
                <button className="btn text" type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
                <button className="btn secondary" type="button" disabled={!selectedIds.length} onClick={() => bulkAction("enable")}>Bật selected</button>
                <button className="btn secondary" type="button" disabled={!selectedIds.length} onClick={() => bulkAction("disable")}>Tắt selected</button>
              </div>
            </div>
            <div className="teacher-item-list">
              {items.map((item, index) => (
                <article className="teacher-item-row" key={item.course_item_id}>
                  <label className="teacher-item-select">
                    <input type="checkbox" checked={selectedIds.includes(item.course_item_id)} onChange={() => toggleSelection(item.course_item_id)} />
                  </label>
                  <div className="teacher-item-main">
                    <div className="teacher-item-head">
                      <strong>{item.title}</strong>
                      <span>{itemTypeLabel(item.item_type)}</span>
                      {item.pdf_lesson?.page_count ? <span>{item.pdf_lesson.page_count} trang</span> : null}
                      {item.test?.question_count != null ? <span>{item.test.question_count} câu hỏi</span> : null}
                    </div>
                    <p className="muted">{item.description || "Không có mô tả."}</p>
                    <div className="course-meta-badges">
                      <span className="meta-badge">{item.availability_label}</span>
                      {item.pdf_lesson?.original_filename ? <span className="meta-badge">{item.pdf_lesson.original_filename}</span> : null}
                    </div>
                  </div>
                  <div className="teacher-item-controls">
                    <label className="teacher-inline-toggle">
                      <input type="checkbox" checked={item.is_enabled} onChange={(event) => updateItem(item, { is_enabled: event.target.checked })} />
                      <span>Enabled</span>
                    </label>
                    <input type="datetime-local" defaultValue={toLocalInput(item.available_from)} onBlur={(event) => updateItem(item, { available_from: fromLocalInput(event.target.value) })} />
                    <input type="datetime-local" defaultValue={toLocalInput(item.available_until)} onBlur={(event) => updateItem(item, { available_until: fromLocalInput(event.target.value) })} />
                    <div className="table-actions">
                      <button className="btn text" type="button" disabled={index === 0} onClick={() => moveItem(item.course_item_id, -1)}>Len</button>
                      <button className="btn text" type="button" disabled={index === items.length - 1} onClick={() => moveItem(item.course_item_id, 1)}>Xuong</button>
                      <button className="btn text" type="button" onClick={() => deleteItem(item)}>Xóa</button>
                    </div>
                  </div>
                </article>
              ))}
              {!items.length && !loading && <div className="empty-state">Khóa học này chưa có course item.</div>}
            </div>
          </section>

          <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
        </div>
      </TeacherLayout>
    </>
  );
}
