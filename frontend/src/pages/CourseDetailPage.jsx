import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader, Breadcrumbs, PageHeader } from "../components/AppShell.jsx";
import { StudentLayout } from "../components/Layouts.jsx";
import { apiUrl, requestJson } from "../lib/api.js";
import { activityLabel, courseMeta, courseVisual, durationText, primaryCourseCta, progressLabel, progressState } from "../lib/coursePresentation.js";
import { getSessionContext, setSessionContext } from "../lib/session.js";

function activityIcon(type) {
  return {
    SLIDE_DECK: "▤",
    VIDEO: "▶",
    DOCUMENT: "≣",
    QUIZ: "?",
    TEXT: "¶",
  }[type] || "•";
}

function flattenActivities(course) {
  return (course?.modules || []).flatMap((module) =>
    (module.lessons || []).flatMap((lesson) =>
      (lesson.activities || []).map((activity) => ({
        module,
        lesson,
        activity,
      }))
    )
  );
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
  const [openModules, setOpenModules] = useState({});

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
        const defaultOpen = {};
        const targetModuleId = data.next_module_id || data.modules?.[0]?.module_id;
        (data.modules || []).forEach((module) => {
          defaultOpen[module.module_id] = data.modules.length === 1 || module.module_id === targetModuleId;
        });
        setOpenModules(defaultOpen);
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

  async function startActivity(module, lesson, activity) {
    const sessionId = `S_${context.student_code || "student"}_${Date.now()}`;
    setStarting(activity.activity_id);
    setStatus({ message: "Đang chuẩn bị phiên học...", kind: "" });
    try {
      const session = await requestJson(apiUrl("/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          course_id: course.course_id,
          module_id: module.module_id,
          lesson_id: lesson.lesson_id,
          activity_id: activity.activity_id,
          content_version_id: activity.content_version_id,
          is_fullscreen: Boolean(document.fullscreenElement),
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
        }),
      });
      setSessionContext({
        role: "student",
        course_id: session.course_id || course.course_id,
        module_id: session.module_id || module.module_id,
        lesson_id: session.lesson_id || lesson.lesson_id,
        activity_id: session.activity_id || activity.activity_id,
        content_version_id: session.content_version_id || activity.content_version_id || "",
        session_id: session.session_id || sessionId,
      });
      navigate("/camera-check");
    } catch (error) {
      setStatus({ message: `Không thể bắt đầu hoạt động: ${error.message}`, kind: "error" });
      setStarting("");
    }
  }

  function toggleModule(moduleId) {
    setOpenModules((current) => ({ ...current, [moduleId]: !current[moduleId] }));
  }

  function openCourseContent() {
    if (!course) return;
    const expanded = {};
    (course.modules || []).forEach((module) => {
      expanded[module.module_id] = true;
    });
    setOpenModules(expanded);
    window.requestAnimationFrame(() => {
      document.getElementById("course-outline")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const progress = Number(course?.progress_ratio || 0);
  const progressPct = Math.round(progress * 100);
  const progressCopy = progressLabel(progress);
  const visual = courseVisual(course || {});
  const meta = course ? courseMeta(course) : [];
  const flatActivities = course ? flattenActivities(course) : [];
  const nextActivityIndex = flatActivities.findIndex((item) => item.activity.activity_id === course?.next_activity_id);

  function activityState(globalIndex, activityId) {
    if (progress >= 1) return "completed";
    if (activityId === course?.next_activity_id) return progress > 0 ? "current" : "next";
    if (nextActivityIndex > -1 && globalIndex < nextActivityIndex) return "review";
    return "available";
  }

  function activityActionLabel(globalIndex, activityId) {
    const state = activityState(globalIndex, activityId);
    if (state === "completed" || state === "review") return "Xem lại";
    if (state === "current") return "Tiếp tục học";
    if (state === "next") return "Bắt đầu học";
    return "Mở hoạt động";
  }

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
          description={course?.course_description || "Xem nội dung theo chương, bài học và hoạt động."}
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
            <section className="course-overview-hero">
              <div className={`course-detail-cover theme-${visual.theme}`} aria-hidden="true">
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

              <div className="course-overview-copy">
                {meta.length > 0 && <div className="course-inline-meta">{meta.join(" · ")}</div>}
                <h2>{course.course_title}</h2>
                {course.course_description && <p className="muted">{course.course_description}</p>}
                <div className="course-progress-stack">
                  <div className="course-progress-header">
                    <strong>Tiến độ học</strong>
                    <span>{progressCopy}</span>
                  </div>
                  <div className="course-inline-progress" aria-label={`Tiến độ ${progressPct}%`} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                    <div><i style={{ width: `${progressPct}%` }}></i></div>
                  </div>
                </div>
                <div className="student-actions hero-actions">
                  <button
                    className="btn primary"
                    type="button"
                    disabled={Boolean(starting) || !course.next_activity_id}
                    onClick={() => {
                      const next = flatActivities.find((item) => item.activity.activity_id === course.next_activity_id) || flatActivities[0];
                      if (next) startActivity(next.module, next.lesson, next.activity);
                    }}
                  >
                    {starting ? "Đang chuẩn bị..." : primaryCourseCta(progress)}
                  </button>
                  <button className="btn text" type="button" onClick={openCourseContent}>
                    Xem nội dung
                  </button>
                </div>
              </div>
            </section>

            <section className="course-content-section" id="course-outline">
              <div className="section-heading-row">
                <div>
                  <h2>Nội dung khóa học</h2>
                  <p className="muted">
                    {(course.module_count || 0)} chương · {(course.lesson_count || 0)} bài học · {(course.activity_count || 0)} hoạt động
                  </p>
                </div>
              </div>

              {course.modules.length === 0 ? (
                <div className="empty-state layout-surface">
                  <h3>Khóa học chưa có nội dung</h3>
                  <p>Giảng viên sẽ cập nhật bài học và hoạt động trong thời gian tới.</p>
                </div>
              ) : (
                <div className="module-outline-list">
                  {course.modules.map((module, moduleIndex) => {
                    const moduleLessons = module.lessons || [];
                    const lessonCount = moduleLessons.length;
                    const moduleDuration = module.estimated_duration_min || moduleLessons.reduce((sum, lesson) => sum + (lesson.estimated_duration_min || 0), 0);
                    const isOpen = course.modules.length === 1 ? true : Boolean(openModules[module.module_id]);
                    return (
                      <section className="module-section" key={module.module_id}>
                        <header className="module-section-header">
                          <button
                            type="button"
                            className="module-toggle"
                            onClick={() => course.modules.length > 1 && toggleModule(module.module_id)}
                            aria-expanded={isOpen}
                            disabled={course.modules.length === 1}
                          >
                            <div>
                              <span>Chương {moduleIndex + 1}</span>
                              <h3>{module.module_title}</h3>
                            </div>
                            <div className="module-header-meta">
                              <em>{lessonCount} bài học</em>
                              <em>{durationText(moduleDuration)}</em>
                              {course.modules.length > 1 && <strong>{isOpen ? "−" : "+"}</strong>}
                            </div>
                          </button>
                          {module.module_description && <p className="muted">{module.module_description}</p>}
                        </header>

                        {isOpen && (
                          <div className="module-lesson-list">
                            {moduleLessons.length === 0 ? (
                              <div className="empty-state compact">
                                Bài học trong chương này sẽ được cập nhật sau.
                              </div>
                            ) : (
                              moduleLessons.map((lesson, lessonIndex) => (
                                <article className="lesson-outline-item" key={lesson.lesson_id}>
                                  <div className="lesson-outline-header">
                                    <span>Bài {lessonIndex + 1}</span>
                                    <strong>{lesson.lesson_title}</strong>
                                    {lesson.lesson_description && <p>{lesson.lesson_description}</p>}
                                  </div>
                                  {(lesson.activities || []).length === 0 ? (
                                    <div className="empty-state compact">
                                      Bài học chưa có hoạt động.
                                    </div>
                                  ) : (
                                    <div className="activity-outline-list">
                                      {lesson.activities.map((activity) => {
                                        const globalIndex = flatActivities.findIndex((item) => item.activity.activity_id === activity.activity_id);
                                        const itemState = activityState(globalIndex, activity.activity_id);
                                        return (
                                          <div className="activity-outline-row" key={activity.activity_id}>
                                            <div className="activity-outline-main">
                                              <span className={`activity-outline-icon state-${itemState}`}>{activityIcon(activity.activity_type)}</span>
                                              <div>
                                                <strong>{activity.title}</strong>
                                                <div className="course-meta-badges">
                                                  <span className="meta-badge">{activityLabel(activity.activity_type)}</span>
                                                  {activity.estimated_duration_min ? <span className="meta-badge">{durationText(activity.estimated_duration_min)}</span> : null}
                                                  {activity.tracking_enabled ? <span className="meta-badge eye">Có theo dõi ánh nhìn</span> : null}
                                                </div>
                                              </div>
                                            </div>
                                            <button
                                              className={itemState === "current" || itemState === "next" ? "btn primary" : "btn text"}
                                              type="button"
                                              disabled={Boolean(starting)}
                                              onClick={() => startActivity(module, lesson, activity)}
                                            >
                                              {starting === activity.activity_id ? "Đang chuẩn bị..." : activityActionLabel(globalIndex, activity.activity_id)}
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </article>
                              ))
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
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
