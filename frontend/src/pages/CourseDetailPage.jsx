import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { StudentLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { progressLabel, primaryCourseCta, itemTypeLabel } from "../lib/coursePresentation.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "../lib/session.js";

function itemFacts(item) {
  const parts = [itemTypeLabel(item.item_type)];
  if (item.pdf_lesson?.page_count) parts.push(`${item.pdf_lesson.page_count} trang`);
  if (item.test?.question_count != null) parts.push(`${item.test.question_count} câu hỏi`);
  return parts;
}

function actionLabel(item) {
  if (item.item_type === "TEST") return "Chưa hỗ trợ";
  if (item.access_state === "scheduled") return item.availability_label;
  if (item.access_state === "closed") return "Đã kết thúc thời gian truy cập";
  if (item.access_state === "disabled") return "Giáo viên chưa mở bài";
  if (item.completed) return "Xem lại";
  if (item.progress_ratio > 0) return "Tiếp tục học";
  return "Bắt đầu học";
}

export default function CourseDetailPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState("");
  const [status, setStatus] = useState({ message: "", kind: "" });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [courseId]);

  useEffect(() => {
    let active = true;
    async function loadCourse() {
      try {
        const data = await requestJson(apiUrl(`/courses/${encodeURIComponent(courseId)}`));
        if (!active) return;
        setCourse(data);
        setLoadFailed(false);
      } catch (error) {
        if (active) {
          setLoadFailed(true);
          setStatus({ message: error.message || "Không thể tải nội dung khóa học lúc này.", kind: "error" });
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCourse();
    return () => {
      active = false;
    };
  }, [courseId]);

  async function startItem(item) {
    if (item.item_type !== "PDF_LESSON") {
      setStatus({ message: "Bài kiểm tra chưa có trình làm bài.", kind: "error" });
      return;
    }
    if (item.access_state !== "available") return;
    const sessionId = `S_${context.student_code || "student"}_${Date.now()}`;
    setStarting(item.course_item_id);
    setStatus({ message: "Đang chuẩn bị phiên học...", kind: "" });
    try {
      clearSessionContext({ preserveIdentity: true });
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          course_id: course.course_id,
          course_item_id: item.course_item_id,
          pdf_lesson_id: item.pdf_lesson?.pdf_lesson_id || null,
          test_id: item.test?.test_id || null,
          is_fullscreen: Boolean(document.fullscreenElement),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        }),
      });
      setSessionContext({
        role: "student",
        course_id: session.course_id || course.course_id,
        course_item_id: session.course_item_id || item.course_item_id,
        pdf_lesson_id: session.pdf_lesson_id || item.pdf_lesson?.pdf_lesson_id || "",
        pdf_document_version: session.pdf_document_version || "",
        test_id: session.test_id || item.test?.test_id || "",
        session_id: session.session_id || sessionId,
      });
      navigate("/camera-check");
    } catch (error) {
      setStatus({ message: `Không thể bắt đầu nội dung: ${error.message}`, kind: "error" });
      setStarting("");
    }
  }

  const progressCopy = progressLabel(course?.progress_ratio || 0);
  const nextItem = (
    course?.items?.find((item) => item.course_item_id === course.next_course_item_id && item.item_type === "PDF_LESSON") ||
    course?.items?.find((item) => item.access_state === "available" && item.item_type === "PDF_LESSON") ||
    null
  );

  return (
    <>
      <AppHeader active="courses" />
      <StudentLayout className="student-course-detail-page">
        <Breadcrumbs
          items={[
            { label: "Trang chủ", to: "/courses" },
            { label: "Khóa học của tôi", to: "/courses" },
            { label: course?.course_title || "Chi tiết khóa học" },
          ]}
        />

        <PageHeader
          title={course?.course_title || "Chi tiết khóa học"}
          description={course?.course_description || "Xem danh sách bài học và bắt đầu đúng bài đang mở."}
        />

        {loading && <section className="panel"><p className="muted">Đang tải nội dung khóa học...</p></section>}

        {!loading && loadFailed && (
          <section className="panel">
            <h2>Chưa thể tải nội dung khóa học</h2>
            <p className="muted">Không thể kết nối tới máy chủ lúc này. Kiểm tra backend API rồi thử lại.</p>
          </section>
        )}

        {course && !loadFailed && (
          <>
            <section className="panel student-course-summary">
              <div className="course-summary-strip">
                <span><strong>{course.item_count || 0}</strong> bài học</span>
                <span><strong>{course.available_item_count || 0}</strong> đang mở</span>
                <span><strong>{Math.round((course.progress_ratio || 0) * 100)}%</strong> tiến độ</span>
              </div>
              <div className="student-actions hero-actions">
                <button
                  className="btn primary"
                  type="button"
                  disabled={Boolean(starting) || !nextItem}
                  onClick={() => nextItem && startItem(nextItem)}
                >
                  {starting ? "Đang chuẩn bị..." : nextItem ? `${primaryCourseCta(course.progress_ratio || 0)}: ${nextItem.title}` : "Chưa có bài học khả dụng"}
                </button>
              </div>
            </section>

            <section className="course-content-section" id="course-outline">
              <div className="section-heading-row">
                <div>
                  <h2>Nội dung khóa học</h2>
                  <p className="muted">{course.item_count || 0} bài học · {course.available_item_count || 0} bài đang mở</p>
                </div>
              </div>

              {course.items.length === 0 ? (
                <div className="empty-state layout-surface">
                  <h3>Khóa học chưa có nội dung</h3>
                  <p>Giáo viên sẽ cập nhật PDF lesson hoặc test sau.</p>
                </div>
              ) : (
                <div className="module-outline-list">
                  {course.items.map((item, index) => (
                    <article className="lesson-outline-card" key={item.course_item_id}>
                      <div className="lesson-outline-main">
                        <div className="lesson-outline-copy">
                          <span>Bài {index + 1}</span>
                          <strong>{item.title}</strong>
                          {item.description && <p className="muted">{item.description}</p>}
                          <div className="course-meta-badges">
                            {itemFacts(item).map((fact) => <span className="meta-badge" key={fact}>{fact}</span>)}
                            <span className="meta-badge">{item.access_state === "available" ? "Đang mở" : actionLabel(item)}</span>
                            {item.last_page_number ? <span className="meta-badge">Xem tới trang {item.last_page_number}</span> : null}
                            {item.progress_ratio > 0 ? <span className="meta-badge eye">{Math.round(item.progress_ratio * 100)}%</span> : <span className="meta-badge">Chưa bắt đầu</span>}
                          </div>
                        </div>
                        <div className="lesson-outline-actions">
                          <button
                            className="btn primary"
                            type="button"
                            disabled={item.item_type !== "PDF_LESSON" || item.access_state !== "available" || Boolean(starting)}
                            onClick={() => startItem(item)}
                          >
                            {starting === item.course_item_id ? "Đang chuẩn bị..." : actionLabel(item)}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
      </StudentLayout>
    </>
  );
}
