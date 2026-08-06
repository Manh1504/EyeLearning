import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { StudentLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { courseVisual } from "../lib/coursePresentation.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "../lib/session.js";

function firstAvailableItem(course) {
  return (course.items || []).find((item) => item.access_state === "available") || null;
}

function formatLessonTitle(title) {
  if (!title) return "Chưa có nội dung khả dụng";
  return String(title).replace(/\bmlops\b/gi, "MLOps");
}

function lessonLocationLabel(item, fallback = "Chưa có hoạt động") {
  if (!item) return fallback;
  if (item.last_page_number) return `${formatLessonTitle(item.title)} · Trang ${item.last_page_number}`;
  return formatLessonTitle(item.title);
}

function normalizedPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function lessonCountLabel(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  return `${safeCount} bài học`;
}

function availableLessonCountLabel(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  return `${safeCount} bài học khả dụng`;
}

function normalizeCourseDisplay(course) {
  const items = course.items || [];
  const progressPercent = normalizedPercent(Math.round((course.progress_ratio || 0) * 100));
  const availableItem = firstAvailableItem(course);
  const nextItem = items.find((item) => item.course_item_id === course.next_course_item_id) || availableItem;
  const recentItem = [...items].reverse().find((item) => item.progress_ratio > 0 || item.completed || item.last_page_number) || null;
  const incompleteItem = items.find((item) => item.progress_ratio > 0 && !item.completed && item.access_state === "available") || null;
  const completed = items.length > 0 && items.every((item) => item.completed);
  const started = progressPercent > 0 || Boolean(recentItem);
  const targetItem = incompleteItem || nextItem || recentItem || availableItem;

  if (completed) {
    return {
      state: "completed",
      progressPercent: 100,
      statusLabel: "Đã hoàn thành",
      activityLabel: "Học gần nhất",
      activityValue: lessonLocationLabel(recentItem || targetItem),
      ctaLabel: "Xem lại bài học",
      targetItem: targetItem || availableItem,
    };
  }

  if (started) {
    return {
      state: "incomplete",
      progressPercent,
      statusLabel: "Đang học",
      activityLabel: "Tiếp tục từ",
      activityValue: lessonLocationLabel(incompleteItem || recentItem || nextItem),
      ctaLabel: "Tiếp tục học",
      targetItem: incompleteItem || nextItem || availableItem,
    };
  }

  return {
    state: "not-started",
    progressPercent: 0,
    statusLabel: "Chưa bắt đầu",
    activityLabel: "Bài học đầu tiên",
    activityValue: lessonLocationLabel(nextItem || availableItem, "Chưa có bài học khả dụng"),
    ctaLabel: "Bắt đầu học",
    targetItem: nextItem || availableItem,
  };
}

export default function CoursesPage() {
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [starting, setStarting] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCourses() {
      try {
        const data = await requestJson(apiUrl("/courses/my"));
        if (active) {
          setCourses(data);
          setLoadFailed(false);
        }
      } catch (error) {
        if (active) {
          setLoadFailed(true);
          setStatus({ message: error.message || "Không thể tải danh sách khóa học lúc này.", kind: "error" });
        }
      } finally {
        if (active) setLoadingCourses(false);
      }
    }
    loadCourses();
    return () => {
      active = false;
    };
  }, []);

  async function startItem(course, item) {
    if (!item || item.access_state !== "available") {
      setStatus({ message: "Nội dung này hiện chưa khả dụng.", kind: "error" });
      return;
    }
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
      setStatus({ message: `Không thể tạo phiên học: ${error.message}`, kind: "error" });
      setStarting("");
    }
  }

  return (
    <>
      <AppHeader active="courses" />
      <StudentLayout className="student-courses-page">
        <Breadcrumbs items={[{ label: "Trang chủ", to: "/courses" }, { label: "Khóa học của tôi" }]} />
        <PageHeader
          title="Khóa học của tôi"
          description="Tiếp tục các bài học chưa hoàn thành hoặc xem lại nội dung bạn đã học."
        />

        <section className="course-gallery" aria-busy={loadingCourses}>
          {loadingCourses && (
            <div className="course-skeleton-list" aria-label="Đang tải khóa học">
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
            </div>
          )}

          {!loadingCourses && !loadFailed && courses.length === 0 && (
            <div className="empty-state layout-surface course-empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path d="M6 4.75h9.5A2.5 2.5 0 0 1 18 7.25v12H7.25A2.25 2.25 0 0 1 5 17V5.75c0-.55.45-1 1-1Z" />
                  <path d="M7.25 16.75H18M8.5 8.25h6M8.5 11.25h4" />
                </svg>
              </span>
              <h2>Chưa có khóa học được ghi danh</h2>
              <p>Tài khoản của bạn chưa nằm trong danh sách học viên của khóa học nào.</p>
            </div>
          )}

          {!loadingCourses && loadFailed && (
            <div className="empty-state layout-surface course-empty-state">
              <span className="empty-state-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path d="M12 8v4M12 16h.01M10.25 4.8 3.5 17a1.5 1.5 0 0 0 1.31 2.25h14.38A1.5 1.5 0 0 0 20.5 17L13.75 4.8a2 2 0 0 0-3.5 0Z" />
                </svg>
              </span>
              <h2>Chưa thể tải khóa học</h2>
              <p>Không thể kết nối tới máy chủ lúc này. Kiểm tra backend API rồi thử lại.</p>
            </div>
          )}

          {!loadFailed && courses.map((course) => {
            const visual = courseVisual(course);
            const display = normalizeCourseDisplay(course);
            const targetItem = display.targetItem;
            const isCompleted = display.state === "completed";
            const progress = normalizedPercent(display.progressPercent);
            return (
              <article
                className="course-tile"
                key={course.course_id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/courses/${course.course_id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/courses/${course.course_id}`);
                  }
                }}
                aria-label={`Mở khóa học ${course.course_title}`}
              >
                <div className="course-tile-link" aria-hidden="true">
                  <div className={`course-tile-art theme-${visual.theme}`}>
                    <div className="course-art-badge">{visual.eyebrow}</div>
                    <div className="course-document-graphic" role="img" aria-label={`Ảnh minh họa khóa học ${course.course_title}`}>
                      <span className="document-sheet">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="course-tile-body">
                  <div className="course-tile-header">
                    <h2>{course.course_title}</h2>
                  </div>
                  <p className="course-tile-description">{course.course_description || "Khóa học chưa có mô tả."}</p>

                  <div className="course-meta-badges">
                    <span className="meta-badge">{lessonCountLabel(course.item_count)}</span>
                    <span className="meta-badge">{availableLessonCountLabel(course.available_item_count)}</span>
                  </div>

                  <div className="course-next-activity">
                    <span>{display.activityLabel}</span>
                    <strong>{display.activityValue}</strong>
                  </div>

                  <div className="course-progress">
                    <div className="course-progress__header">
                      <span>Tiến độ</span>
                      <span>{progress}%</span>
                    </div>
                    <div
                      className="course-progress__track"
                      role="progressbar"
                      aria-label={`Tiến độ khóa học ${course.course_title}`}
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div className="course-progress__fill" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="student-actions">
                  <div className={`course-state-pill state-${display.state}`}>
                    {isCompleted && (
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m7.8 13.15-2.7-2.7 1.25-1.25 1.45 1.45 5.85-5.85 1.25 1.25-7.1 7.1Z" />
                      </svg>
                    )}
                    <span>{display.statusLabel}</span>
                  </div>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={Boolean(starting) || !targetItem}
                    onClick={(event) => {
                      event.stopPropagation();
                      startItem(course, targetItem);
                    }}
                  >
                    {starting === targetItem?.course_item_id ? "Đang chuẩn bị..." : display.ctaLabel}
                  </button>
                  {!targetItem && <span className="muted">Hiện chưa có bài học nào đang mở.</span>}
                </div>
              </article>
            );
          })}
        </section>

        <div className={`status-line ${status.kind}`.trim()}>{status.message}</div>
      </StudentLayout>
    </>
  );
}
