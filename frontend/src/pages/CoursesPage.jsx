import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { StudentLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { activityLabel, courseMeta, courseVisual, primaryCourseCta, progressLabel, progressState } from "../lib/coursePresentation.js";
import { getSessionContext, setSessionContext } from "../lib/session.js";

export default function CoursesPage() {
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState({ message: "", kind: "" });
  const [starting, setStarting] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  async function startCourse(course) {
    if (!course.next_lesson_id) {
      setStatus({ message: "Khóa học này chưa có nội dung khả dụng.", kind: "error" });
      return;
    }
    const sessionId = `S_${context.student_code || "student"}_${Date.now()}`;
    setStarting(course.course_id);
    setStatus({ message: "Đang chuẩn bị phiên học...", kind: "" });
    try {
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          course_id: course.course_id,
          module_id: course.next_module_id,
          lesson_id: course.next_lesson_id,
          activity_id: course.next_activity_id,
          content_version_id: course.next_content_version_id,
          is_fullscreen: Boolean(document.fullscreenElement),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        }),
      });
      setSessionContext({
        role: "student",
        course_id: session.course_id || course.course_id,
        module_id: session.module_id || course.next_module_id || "",
        lesson_id: session.lesson_id || course.next_lesson_id,
        activity_id: session.activity_id || course.next_activity_id || "",
        content_version_id: session.content_version_id || course.next_content_version_id || "",
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
      <StudentLayout>
        <Breadcrumbs items={[{ label: "Trang chủ", to: "/courses" }, { label: "Khóa học của tôi" }]} />
        <PageHeader
          title="Khóa học của tôi"
          description="Tiếp tục các khóa học đã ghi danh và chuyển sang hoạt động tiếp theo."
        />

        <section className="course-gallery" aria-busy={loadingCourses}>
          {loadingCourses && (
            <div className="course-skeleton-list" aria-label="Đang tải khóa học">
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
            </div>
          )}

          {!loadingCourses && !loadFailed && courses.length === 0 && (
            <div className="empty-state layout-surface">
              <h2>Chưa có khóa học được ghi danh</h2>
              <p>Tài khoản của bạn chưa nằm trong danh sách học sinh của khóa học nào.</p>
            </div>
          )}

          {!loadingCourses && loadFailed && (
            <div className="empty-state layout-surface">
              <h2>Chưa thể tải khóa học</h2>
              <p>Không thể kết nối tới máy chủ lúc này. Kiểm tra backend API rồi thử lại.</p>
            </div>
          )}

          {!loadFailed && courses.map((course) => {
            const progress = Math.round((course.progress_ratio || 0) * 100);
            const visual = courseVisual(course);
            const progressText = progressLabel(course.progress_ratio || 0);
            const progressMode = progressState(course.progress_ratio || 0);
            const meta = courseMeta(course);
            return (
              <article className="course-tile" key={course.course_id}>
                <div className={`course-tile-art theme-${visual.theme}`} aria-hidden="true">
                  <div className="course-art-badge">{visual.eyebrow}</div>
                  <div className="course-art-graphic">
                    <span className="art-node art-node-a"></span>
                    <span className="art-node art-node-b"></span>
                    <span className="art-node art-node-c"></span>
                    <span className="art-line art-line-a"></span>
                    <span className="art-line art-line-b"></span>
                    <span className="art-line art-line-c"></span>
                  </div>
                  <small>{visual.accent}</small>
                </div>
                <div className="course-tile-body">
                  <div className="course-tile-header">
                    <h2>{course.course_title}</h2>
                    {meta.length > 0 && <p className="muted">{meta.join(" · ")}</p>}
                  </div>

                  <p className="course-tile-description">{course.course_description || "Tiếp tục nội dung học đã được ghi danh."}</p>

                  <div className="course-next-activity">
                    <span>Tiếp theo</span>
                    <strong>{course.next_activity_title || course.next_lesson_title || "Chưa có hoạt động"}</strong>
                    <div className="course-meta-badges">
                      <span className="meta-badge">{activityLabel(course.next_activity_type)}</span>
                      {course.next_estimated_duration_min ? <span className="meta-badge">{course.next_estimated_duration_min} phút</span> : null}
                      {course.next_tracking_required ? <span className="meta-badge eye">Có theo dõi ánh nhìn</span> : null}
                    </div>
                  </div>

                  {progress > 0 ? (
                    <div
                      className="course-inline-progress"
                      aria-label={`Tiến độ ${progress}%`}
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      role="progressbar"
                    >
                      <div><i style={{ width: `${progress}%` }}></i></div>
                      <span className={`progress-copy state-${progressMode}`}>{progressText}</span>
                    </div>
                  ) : (
                    <div className="course-status-copy" aria-label={progressText}>{progressText}</div>
                  )}

                  <div className="student-actions">
                    <button
                      className="btn primary"
                      type="button"
                      disabled={Boolean(starting)}
                      onClick={() => startCourse(course)}
                    >
                      {starting === course.course_id ? "Đang chuẩn bị..." : primaryCourseCta(course.progress_ratio || 0)}
                    </button>
                    <Link className="btn text" to={`/courses/${course.course_id}`}>
                      Xem nội dung
                    </Link>
                  </div>
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
