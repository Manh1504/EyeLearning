import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LearningLayout } from "../components/Layouts.jsx";
import { apiUrl, loadClientConfig, requestJson } from "../lib/api.js";
import { getSessionContext } from "../lib/session.js";
import { createLiveHeatmap } from "../lib/liveHeatmap.js";
import { createGazeClient } from "../lib/gazeClient.js";
import { capturePageSnapshot } from "../lib/pageSnapshot.js";
import { buildLessonSequence, getLessonActivities, getLessonPlan, getLessonTitle } from "../data/lessonSlides.js";

const TRACKING_INTERVAL_MS = 100;
const SLIDE_TRANSITION_MS = 180;

function calibrationReady() {
  return localStorage.getItem("calibration_ready") === "true";
}

function calibrationMessage() {
  if (localStorage.getItem("calibration_ready") !== "true") {
    return "Chưa tải hồ sơ camera cho phiên học này.";
  }
  return "Camera chưa sẵn sàng.";
}

function progressKey(sessionId) {
  return `ela_lesson_progress_${sessionId}`;
}

function formatSavedTime(timestamp) {
  if (!timestamp) return "Đang lưu...";
  return "Đã tự động lưu";
}

function durationLabel(minutes) {
  return minutes ? `${minutes} phút` : "Chưa đặt thời lượng";
}

function gazeStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (!value || value === "idle") return "Chưa bật";
  if (value.includes("started") || value.includes("running") || value.includes("ok") || value.includes("đang ghi nhận")) return "Đang ghi nhận";
  if (value.includes("stopped")) return "Tạm dừng";
  if (value.includes("reconnect") || value.includes("checking") || value.includes("đang mở") || value.includes("đang kết nối")) return "Đang kết nối";
  if (value.includes("required") || value.includes("viewport") || value.includes("failed") || value.includes("error") || value.includes("không thể") || value.includes("chưa")) return "Chưa ghi nhận";
  return status;
}

function studentTrackingState(status) {
  const label = gazeStatusLabel(status.message);
  if (label === "Đang ghi nhận") {
    return { className: "ok", text: "Đang theo dõi ánh nhìn" };
  }
  if (label === "Đang kết nối") {
    return { className: "pending", text: "Đang chuẩn bị theo dõi" };
  }
  return { className: "warn", text: status.message && status.message !== "idle" ? "Tín hiệu chưa ổn định" : "Không theo dõi" };
}

function activityTypeLabel(type) {
  return {
    SLIDE_DECK: "Slide",
    VIDEO: "Video",
    DOCUMENT: "Tài liệu",
    QUIZ: "Quiz",
    TEXT: "Bài đọc",
  }[type] || "Hoạt động";
}

function activityAoiZone(unit) {
  if (unit.activity.activity_type === "VIDEO") return "video_area";
  if (unit.activity.activity_type === "QUIZ") return "quiz_area";
  if (unit.activity.activity_type === "SLIDE_DECK" && unit.slide?.type === "media") return "video_area";
  return "transcript_panel";
}

function activityTypeIcon(type) {
  return {
    SLIDE_DECK: "▤",
    VIDEO: "▶",
    DOCUMENT: "≣",
    QUIZ: "?",
    TEXT: "¶",
  }[type] || "•";
}

function outlineActivityState(index, currentActivityIndex, unlockedIndex) {
  if (index < currentActivityIndex) return "completed";
  if (index === currentActivityIndex) return "current";
  if (index <= unlockedIndex) return "available";
  return "locked";
}

function SlideDeckActivity({ slide }) {
  if (slide.type === "pdf-page") {
    return (
      <div className="slide-content slide-pdf-layout">
        <img src={slide.imageSrc} alt={`${slide.eyebrow} - trang ${slide.page}`} draggable="false" />
      </div>
    );
  }

  if (slide.type === "title") {
    return (
      <div className="slide-content slide-title-layout">
        <p className="slide-eyebrow">{slide.eyebrow}</p>
        <h1>{slide.title}</h1>
        <p className="slide-subtitle">{slide.subtitle}</p>
      </div>
    );
  }

  if (slide.type === "image") {
    return (
      <div className="slide-content slide-split-layout">
        <div>
          <p className="slide-eyebrow">{slide.eyebrow}</p>
          <h2>{slide.title}</h2>
          <p>{slide.body}</p>
        </div>
        <figure className="slide-figure" aria-label="Minh họa cấu trúc biểu đồ">
          <div className="axis-chart">
            <span style={{ height: "44%" }}></span>
            <span style={{ height: "66%" }}></span>
            <span style={{ height: "52%" }}></span>
            <span style={{ height: "76%" }}></span>
            <span style={{ height: "70%" }}></span>
          </div>
          <figcaption>Tiêu đề, trục, đơn vị, chú giải</figcaption>
        </figure>
      </div>
    );
  }

  if (slide.type === "media") {
    return (
      <div className="slide-content slide-media-layout">
        <p className="slide-eyebrow">{slide.eyebrow}</p>
        <h2>{slide.title}</h2>
        <div className="media-placeholder" data-zone="video_area">
          <span>Video bài giảng</span>
          <strong>12:45 / 45:00</strong>
        </div>
        <p>{slide.body}</p>
      </div>
    );
  }

  if (slide.type === "example") {
    return (
      <div className="slide-content slide-example-layout">
        <div>
          <p className="slide-eyebrow">{slide.eyebrow}</p>
          <h2>{slide.title}</h2>
          <p>{slide.body}</p>
        </div>
        <div className="line-example" aria-label="Ví dụ biểu đồ đường">
          <svg viewBox="0 0 520 260" role="img" aria-label="Đường xu hướng tăng rồi giảm nhẹ">
            <path d="M50 220H480M50 30V220" />
            <polyline points="70,190 150,160 230,128 310,92 390,64 460,88" />
            <circle cx="70" cy="190" r="6" />
            <circle cx="150" cy="160" r="6" />
            <circle cx="230" cy="128" r="6" />
            <circle cx="310" cy="92" r="6" />
            <circle cx="390" cy="64" r="6" />
            <circle cx="460" cy="88" r="6" />
          </svg>
        </div>
      </div>
    );
  }

  if (slide.type === "quiz") {
    return (
      <div className="slide-content slide-quiz-layout" data-zone="quiz_area">
        <p className="slide-eyebrow">{slide.eyebrow}</p>
        <h2>{slide.title}</h2>
        <div className="slide-answers">
          {slide.options.map((option) => (
            <button type="button" key={option}>{option}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="slide-content slide-text-layout">
      <p className="slide-eyebrow">{slide.eyebrow}</p>
      <h2>{slide.title}</h2>
      {slide.body && <p>{slide.body}</p>}
      {slide.bullets && (
        <ul>
          {slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      )}
    </div>
  );
}

function TextActivity({ activity }) {
  const content = activity.content || {};
  return (
    <article className="reading-activity" data-zone="reading_content">
      <div className="reading-activity-inner">
        <p className="reading-eyebrow">{content.eyebrow || activityTypeLabel(activity.activity_type)}</p>
        <h1>{content.title || activity.title}</h1>
        {content.body && <p>{content.body}</p>}
        {content.bullets && (
          <ul>
            {content.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
        )}
      </div>
    </article>
  );
}

function QuizActivity({ activity, selectedAnswer, onSelectAnswer, showFeedback }) {
  return (
    <section className="quiz-activity" data-zone="quiz_area">
      <div className="quiz-activity-inner">
        <p className="reading-eyebrow">Kiểm tra kiến thức</p>
        <div className="quiz-progress">Câu hỏi 1 / 1</div>
        <h1>{activity.question}</h1>
        <div className="slide-answers">
          {activity.options.map((option, index) => (
            <button
              type="button"
              key={option}
              className={selectedAnswer === index ? "selected" : ""}
              onClick={() => onSelectAnswer(index)}
            >
              {option}
            </button>
          ))}
        </div>
        {showFeedback && (
          <div className="quiz-feedback-panel" data-zone="feedback_panel">
            <strong>{activity.feedbackTitle}</strong>
            <ul>
              {activity.feedbackBullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoActivity({ activity }) {
  return (
    <section className="video-activity">
      <div className="video-stage" data-zone="video_area">
        <div className="media-placeholder">
          <span>Video bài giảng</span>
          <strong>12:45 / 45:00</strong>
        </div>
      </div>
      <aside className="video-support-panel" data-zone="transcript_panel">
        <p className="reading-eyebrow">Nội dung</p>
        <h2>{activity.title}</h2>
        {activity.description && <p>{activity.description}</p>}
      </aside>
    </section>
  );
}

function DocumentActivity({ activity }) {
  return (
    <article className="reading-activity document-activity" data-zone="document_content">
      <div className="reading-activity-inner">
        <p className="reading-eyebrow">Tài liệu</p>
        <h1>{activity.title}</h1>
        {activity.description && <p>{activity.description}</p>}
      </div>
    </article>
  );
}

function ActivityRenderer({ unit, selectedAnswer, onSelectAnswer, showFeedback, dragProps = {}, slideFrameStyle, isTransitioning, transitionDirection, dragOffset }) {
  if (unit.activity.activity_type === "SLIDE_DECK") {
    return (
      <article
        className={`slide-canvas ${isTransitioning ? "is-transitioning" : ""} ${dragOffset ? "is-dragging" : ""}`}
        data-direction={transitionDirection}
        data-zone={activityAoiZone(unit)}
        data-slide-id={unit.slide?.id || unit.activity.activity_id}
        style={{ ...slideFrameStyle, "--slide-drag-x": `${dragOffset || 0}px` }}
        {...dragProps}
      >
        <SlideDeckActivity slide={unit.slide} />
        {isTransitioning && <div className="slide-transition-shield" data-zone="ui_transition"></div>}
      </article>
    );
  }
  if (unit.activity.activity_type === "QUIZ") {
    return (
      <QuizActivity
        activity={unit.activity}
        selectedAnswer={selectedAnswer}
        onSelectAnswer={onSelectAnswer}
        showFeedback={showFeedback}
      />
    );
  }
  if (unit.activity.activity_type === "VIDEO") return <VideoActivity activity={unit.activity} />;
  if (unit.activity.activity_type === "DOCUMENT") return <DocumentActivity activity={unit.activity} />;
  return <TextActivity activity={unit.activity} />;
}

export default function LessonPage() {
  const navigate = useNavigate();
  const context = useMemo(getSessionContext, []);
  const lessonPlan = useMemo(() => getLessonPlan(context.lesson_id), [context.lesson_id]);
  const lessonActivities = useMemo(() => getLessonActivities(context.lesson_id), [context.lesson_id]);
  const lessonSlides = useMemo(() => buildLessonSequence(context.lesson_id), [context.lesson_id]);
  const lessonTitle = useMemo(() => getLessonTitle(context.lesson_id), [context.lesson_id]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const liveHeatmapRef = useRef(null);
  const gazeClientRef = useRef(null);
  const isTrackingRef = useRef(false);
  const lastCaptureAtRef = useRef(0);
  const autoStartTimerRef = useRef(null);
  const dragStartRef = useRef(null);

  const [learnerInfo, setLearnerInfo] = useState("No session");
  const [config, setConfig] = useState({ enable_dev_tools: false, enable_mouse_simulation: false });
  const [isAdmin, setIsAdmin] = useState(false);
  const [mouseAllowed, setMouseAllowed] = useState(false);

  const [trackingStatus, setTrackingStatusState] = useState({ message: "", kind: "" });
  const [snapshotStatus, setSnapshotStatusState] = useState({ message: "", kind: "" });
  const [gazeStatus, setGazeStatusState] = useState({
    message: context.session_id ? "Đang khởi động camera..." : "idle",
    kind: "",
  });
  const [gazeAiStatus, setGazeAiStatusState] = useState({ message: "checking", ok: false });

  const [health, setHealth] = useState({ gaze_chunks_count: 0, tracking_points_count: 0, page_snapshot_exists: false });

  const [isTracking, setIsTracking] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastZone, setLastZone] = useState("none");
  const [lastSend, setLastSend] = useState("not sent");

  const [liveHeatmapOn, setLiveHeatmapOn] = useState(false);
  const [mouseTestOn, setMouseTestOn] = useState(false);
  const [liveHeatmapOpacity, setLiveHeatmapOpacityState] = useState(0.35);
  const [liveHeatmapPoints, setLiveHeatmapPoints] = useState(0);
  const [debugDotOn, setDebugDotOn] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const [finishing, setFinishing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [sending, setSending] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [unlockedSlide, setUnlockedSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState("next");
  const [dragOffset, setDragOffset] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const setTrackingStatus = (message, kind = "") => setTrackingStatusState({ message, kind });
  const setSnapshotStatus = (message, kind = "") => setSnapshotStatusState({ message, kind });
  const setGazeStatus = (message, kind = "") => {
    setGazeStatusState({ message, kind });
    const normalized = gazeStatusLabel(message);
    if (normalized === "Đang ghi nhận") setIsTracking(true);
    if (normalized === "Tạm dừng" || normalized === "Chưa ghi nhận") setIsTracking(false);
  };
  const setGazeAiStatus = (message, ok = false) => setGazeAiStatusState({ message, ok });

  const getContext = useCallback(() => getSessionContext(), []);
  const currentUnit = lessonSlides[currentSlide];
  const currentActivityIndex = currentUnit ? lessonActivities.findIndex((activity) => activity.activity_id === currentUnit.activity.activity_id) : 0;
  const showQuizFeedback = currentUnit?.activity.activity_type === "QUIZ" && selectedAnswer !== null;

  const refreshSessionHealth = useCallback(async () => {
    if (!context.session_id) return;
    if (context.role !== "admin") return;
    try {
      const data = await requestJson(apiUrl(`/debug/session-health/${encodeURIComponent(context.session_id)}`));
      setHealth(data);
    } catch {
      // best-effort UI info
    }
  }, [context.session_id]);

  useEffect(() => {
    if (!context.session_id) navigate("/");
  }, [context.session_id, navigate]);

  useEffect(() => {
    if (!context.session_id) return;
    const raw = localStorage.getItem(progressKey(context.session_id));
    if (!raw) return;
    try {
      const progress = JSON.parse(raw);
      const slideIndex = Math.max(0, Math.min(lessonSlides.length - 1, Number(progress.currentSlide) || 0));
      const maxUnlocked = Math.max(slideIndex, Math.min(lessonSlides.length - 1, Number(progress.unlockedSlide) || 0));
      setCurrentSlide(slideIndex);
      setUnlockedSlide(maxUnlocked);
      setSavedAt(progress.savedAt || null);
    } catch {
      // ignore invalid local progress
    }
  }, [context.session_id, lessonSlides.length]);

  useEffect(() => {
    if (!context.session_id) return;
    const timestamp = Date.now();
    const nextUnlocked = Math.max(unlockedSlide, currentSlide);
    localStorage.setItem(
      progressKey(context.session_id),
      JSON.stringify({
        lesson_id: context.lesson_id,
        currentSlide,
        unlockedSlide: nextUnlocked,
        slideId: lessonSlides[currentSlide]?.slide?.id || lessonSlides[currentSlide]?.activity?.activity_id || "",
        savedAt: timestamp,
      })
    );
    if (nextUnlocked !== unlockedSlide) setUnlockedSlide(nextUnlocked);
    setSavedAt(timestamp);
  }, [context.session_id, context.lesson_id, currentSlide, unlockedSlide, lessonSlides]);

  useEffect(() => {
    if (!context.session_id) return undefined;

    const liveHeatmap = createLiveHeatmap();
    liveHeatmap.init();
    window.liveHeatmap = liveHeatmap;
    liveHeatmapRef.current = liveHeatmap;
    liveHeatmap.setOpacity(liveHeatmapOpacity);

    const gazeClient = createGazeClient({
      refs: { video: videoRef, canvas: canvasRef, dot: dotRef },
      getContext,
      setStatus: setGazeStatus,
      setAiStatus: setGazeAiStatus,
      calibrationReady,
      calibrationMessage,
    });
    gazeClientRef.current = gazeClient;
    gazeClient.checkAi();

    window.tracking_events = window.tracking_events || [];
    setEventCount(window.tracking_events.length);

    setLearnerInfo(
      context.role === "admin"
        ? `${context.full_name || context.student_code || "Learner"} · ${context.session_id}`
        : context.full_name || context.student_code || "Người học"
    );
    refreshSessionHealth();

    loadClientConfig()
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig({ enable_dev_tools: false, enable_mouse_simulation: false }));

    const onTrackingPoint = (event) => {
      if (event.detail?.target_zone) setLastZone(event.detail.target_zone);
      setEventCount(window.tracking_events.length);
    };
    const onGazeChunkSaved = () => {
      refreshSessionHealth();
      setLiveHeatmapPoints(liveHeatmap.getPointCount());
    };
    const onLiveHeatmapUpdated = (event) => {
      setLiveHeatmapPoints(event.detail?.point_count ?? liveHeatmap.getPointCount());
    };
    const onSnapshotCaptured = () => {
      refreshSessionHealth();
    };

    window.addEventListener("eyelearn:tracking-point", onTrackingPoint);
    window.addEventListener("eyelearn:gaze-chunk-saved", onGazeChunkSaved);
    window.addEventListener("eyelearn:live-heatmap-updated", onLiveHeatmapUpdated);
    window.addEventListener("page-snapshot-captured", onSnapshotCaptured);

    return () => {
      window.removeEventListener("eyelearn:tracking-point", onTrackingPoint);
      window.removeEventListener("eyelearn:gaze-chunk-saved", onGazeChunkSaved);
      window.removeEventListener("eyelearn:live-heatmap-updated", onLiveHeatmapUpdated);
      window.removeEventListener("page-snapshot-captured", onSnapshotCaptured);
      if (gazeClientRef.current === gazeClient) gazeClientRef.current = null;
      gazeClient.destroy();
      liveHeatmap.destroy();
      if (window.liveHeatmap === liveHeatmap) delete window.liveHeatmap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.session_id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const admin = context.role === "admin";
    const mouse = admin && config.enable_mouse_simulation && (config.enable_dev_tools || params.get("debug") === "1");
    setIsAdmin(admin);
    setMouseAllowed(mouse);
  }, [context.role, config]);

  useEffect(() => {
    if (!context.session_id) return undefined;

    let canceled = false;
    let attempts = 0;
    const startWhenReady = () => {
      if (canceled) return;
      attempts += 1;
      if (gazeClientRef.current) {
        setGazeStatus("Đang khởi động camera...");
        gazeClientRef.current.startGaze();
        return;
      }
      if (attempts < 10) {
        autoStartTimerRef.current = window.setTimeout(startWhenReady, 250);
        return;
      }
      setGazeStatus("Camera chưa sẵn sàng. Hãy tải lại trang hoặc quay lại bước kiểm tra camera.", "error");
    };

    autoStartTimerRef.current = window.setTimeout(startWhenReady, 450);
    return () => {
      canceled = true;
      if (autoStartTimerRef.current) window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    };
  }, [context.session_id]);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    const unit = lessonSlides[currentSlide];
    if (!unit) return undefined;
    window.__ELA_LESSON_CONTEXT__ = {
      courseId: context.course_id || null,
      moduleId: context.module_id || null,
      activityId: currentUnit?.activity.activity_id || context.activity_id || null,
      contentVersionId: context.content_version_id || null,
      slideId: unit.slide?.id || null,
      stimulusId: unit.unit_id,
      slideIndex: currentSlide,
      slideTitle: unit.title,
      slideType: unit.kind === "slide" ? unit.slide.type : unit.activity.activity_type,
      isTransitioning,
      outlineOpen,
    };
    return () => {
      if (window.__ELA_LESSON_CONTEXT__?.stimulusId === unit.unit_id) delete window.__ELA_LESSON_CONTEXT__;
    };
  }, [context.activity_id, context.content_version_id, context.course_id, context.lesson_id, context.module_id, currentSlide, currentUnit, isTransitioning, lessonSlides, outlineOpen]);

  useEffect(() => {
    setSelectedAnswer(null);
  }, [currentSlide]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ela:layout-change", { detail: { outlineOpen, fullscreen } }));
  }, [outlineOpen, fullscreen]);

  useEffect(() => {
    function captureMousePoint(event) {
      if (!isTrackingRef.current) return;
      const now = Date.now();
      if (now - lastCaptureAtRef.current < TRACKING_INTERVAL_MS) return;
      lastCaptureAtRef.current = now;

      const ctx = getSessionContext();
      const targetZone = event.target.closest("[data-zone]")?.dataset.zone || null;
      const slideCanvas = document.querySelector(".slide-canvas");
      const rect = slideCanvas?.getBoundingClientRect();
      const lessonContext = window.__ELA_LESSON_CONTEXT__ || {};
      const slideXNorm = rect?.width ? (event.clientX - rect.left) / rect.width : null;
      const slideYNorm = rect?.height ? (event.clientY - rect.top) / rect.height : null;
      const inSlideCanvas = Boolean(
        rect &&
        slideXNorm >= 0 &&
        slideXNorm <= 1 &&
        slideYNorm >= 0 &&
        slideYNorm <= 1
      );
      const point = {
        session_id: ctx.session_id,
        lesson_id: ctx.lesson_id,
        course_id: ctx.course_id || lessonContext.courseId || null,
        module_id: ctx.module_id || lessonContext.moduleId || null,
        activity_id: ctx.activity_id || lessonContext.activityId || null,
        content_version_id: ctx.content_version_id || lessonContext.contentVersionId || null,
        stimulus_id: lessonContext.stimulusId || null,
        student_code: ctx.student_code,
        full_name: ctx.full_name,
        timestamp_ms: now,
        viewport_x: event.clientX,
        viewport_y: event.clientY,
        x: event.clientX,
        y: event.clientY,
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
        stimulus_x_norm: inSlideCanvas ? Math.max(0, Math.min(1, slideXNorm)) : null,
        stimulus_y_norm: inSlideCanvas ? Math.max(0, Math.min(1, slideYNorm)) : null,
        stimulus_left: rect?.left ?? null,
        stimulus_top: rect?.top ?? null,
        stimulus_width: rect?.width ?? null,
        stimulus_height: rect?.height ?? null,
        tracking_quality:
          event.clientX >= window.innerWidth * 0.1 &&
          event.clientX <= window.innerWidth * 0.9 &&
          event.clientY >= window.innerHeight * 0.12 &&
          event.clientY <= window.innerHeight * 0.88
            ? "reliable"
            : "outside_reliable_region",
        screen_x: typeof window.screenX === "number" ? window.screenX + event.clientX : null,
        screen_y: typeof window.screenY === "number" ? window.screenY + event.clientY : null,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio || 1,
        zoom: window.visualViewport?.scale || 1,
        fullscreen: Boolean(document.fullscreenElement),
        target_zone: targetZone,
        confidence: 1,
        gaze_status: "mouse_test",
        metadata_json: {
          slide_id: lessonContext.slideId || null,
          course_id: ctx.course_id || lessonContext.courseId || null,
          module_id: ctx.module_id || lessonContext.moduleId || null,
          activity_id: ctx.activity_id || lessonContext.activityId || null,
          content_version_id: ctx.content_version_id || lessonContext.contentVersionId || null,
          stimulus_id: lessonContext.stimulusId || null,
          slide_index: lessonContext.slideIndex ?? null,
          slide_title: lessonContext.slideTitle || null,
          slide_type: lessonContext.slideType || null,
          slide_x_norm: inSlideCanvas ? Math.max(0, Math.min(1, slideXNorm)) : null,
          slide_y_norm: inSlideCanvas ? Math.max(0, Math.min(1, slideYNorm)) : null,
          in_slide_canvas: inSlideCanvas,
          in_reliable_region:
            event.clientX >= window.innerWidth * 0.1 &&
            event.clientX <= window.innerWidth * 0.9 &&
            event.clientY >= window.innerHeight * 0.12 &&
            event.clientY <= window.innerHeight * 0.88,
          is_transitioning: Boolean(lessonContext.isTransitioning),
          ui_interaction: Boolean(targetZone && !["transcript_panel", "video_area", "quiz_area"].includes(targetZone)),
          target_zone: targetZone,
        },
      };

      window.tracking_events = window.tracking_events || [];
      window.tracking_events.push(point);
      const added = window.liveHeatmap?.addPoint(point);
      if (!added) {
        window.dispatchEvent(new CustomEvent("eyelearn:tracking-point", { detail: point }));
      }
      setLastZone(targetZone || "none");
      setEventCount(window.tracking_events.length);
    }

    document.addEventListener("mousemove", captureMousePoint, { passive: true });
    return () => document.removeEventListener("mousemove", captureMousePoint);
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const goToSlide = useCallback((nextIndex) => {
    if (nextIndex < 0 || nextIndex >= lessonSlides.length || nextIndex > unlockedSlide + 1) return;
    if (nextIndex === currentSlide || isTransitioning) return;
    setTransitionDirection(nextIndex > currentSlide ? "next" : "previous");
    setIsTransitioning(true);
    window.setTimeout(() => {
      setCurrentSlide(nextIndex);
      setUnlockedSlide((value) => Math.max(value, nextIndex));
      window.setTimeout(() => setIsTransitioning(false), SLIDE_TRANSITION_MS);
    }, SLIDE_TRANSITION_MS);
  }, [currentSlide, isTransitioning, lessonSlides.length, unlockedSlide]);

  function beginSlideDrag(event) {
    if (isTransitioning || outlineOpen) return;
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSlideDrag(event) {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < Math.abs(dy)) return;
    setDragOffset(Math.max(-140, Math.min(140, dx)));
  }

  function endSlideDrag(event) {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    dragStartRef.current = null;
    setDragOffset(0);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    goToSlide(dx < 0 ? currentSlide + 1 : currentSlide - 1);
  }

  useEffect(() => {
    function onKeydown(event) {
      if (outlineOpen) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(Math.min(lessonSlides.length - 1, currentSlide + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(Math.max(0, currentSlide - 1));
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [currentSlide, goToSlide, lessonSlides.length, outlineOpen]);

  async function sendTrackingEvents() {
    if (!context.session_id) return;
    if (!window.tracking_events?.length) {
      setTrackingStatus("No tracking points to send.");
      return;
    }
    setSending(true);
    setTrackingStatus("Sending tracking points...");

    try {
      const payload = window.tracking_events.slice();
      const response = await fetch(apiUrl("/tracking/points"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const data = await response.json();
      window.tracking_events = [];
      setEventCount(0);
      setLastSend(`${data.inserted} points`);
      setTrackingStatus(`Sent ${data.inserted} tracking points.`, "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Send failed: ${error.message}`, "error");
    } finally {
      setSending(false);
    }
  }

  async function recalculateMetrics() {
    if (!context.session_id) return;
    setRecalculating(true);
    setTrackingStatus("Recalculating metrics...");
    try {
      const data = await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(context.session_id)}`), {
        method: "POST",
      });
      setTrackingStatus(`Metrics recalculated for ${data.length} AOIs.`, "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Recalculate failed: ${error.message}`, "error");
    } finally {
      setRecalculating(false);
    }
  }

  async function finishSession() {
    if (!context.session_id) return;
    setFinishing(true);
    setTrackingStatus("Đang kết thúc phiên...");
    try {
      await gazeClientRef.current?.stopGaze?.();
      liveHeatmapRef.current?.stop();
      setLiveHeatmapOn(false);
      await capturePageSnapshot(context.session_id).catch(() => {});
      if (context.role === "admin") {
        await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(context.session_id)}`), {
          method: "POST",
        }).catch(() => {});
      }
      const response = await fetch(apiUrl(`/sessions/${encodeURIComponent(context.session_id)}/finish`), {
        method: "PATCH",
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setTrackingStatus("Đã kết thúc phiên.", "ok");
      refreshSessionHealth();
    } catch (error) {
      setTrackingStatus(`Không thể kết thúc phiên: ${error.message}`, "error");
      setFinishing(false);
      return;
    }
    setFinishing(false);
    setCompleted(true);
  }

  async function exitAdminTest() {
    if (!completed && (window.tracking_events?.length || isTracking)) {
      const confirmed = window.confirm("Phiên kiểm thử đang chạy. Thoát bây giờ sẽ kết thúc phiên và xử lý dữ liệu đã ghi nhận. Bạn muốn thoát?");
      if (!confirmed) return;
    }
    await gazeClientRef.current?.stopGaze?.();
    liveHeatmapRef.current?.stop();
    setLiveHeatmapOn(false);
    if (!completed) await finishSession();
    navigate("/admin#trial");
  }

  async function openAnalyticsWithSnapshot() {
    const href = `/analytics?session_id=${encodeURIComponent(context.session_id)}`;
    setTrackingStatus("Đang chuẩn bị phân tích...");
    try {
      await capturePageSnapshot(context.session_id);
      await requestJson(apiUrl(`/metrics/recalculate/${encodeURIComponent(context.session_id)}`), {
        method: "POST",
      });
      refreshSessionHealth();
      setTrackingStatus("Đã sẵn sàng. Đang mở phân tích.", "ok");
    } catch (error) {
      setTrackingStatus(`Không thể chuẩn bị đầy đủ phân tích: ${error.message}. Có thể tính lại chỉ số trong trang phân tích.`, "error");
    } finally {
      navigate(href);
    }
  }

  async function captureSnapshotManually() {
    setSnapshotStatus("Capturing page snapshot...");
    try {
      const result = await capturePageSnapshot(context.session_id);
      setSnapshotStatus(`Snapshot captured: ${result.snapshot_url}`, "ok");
    } catch (error) {
      setSnapshotStatus(`Snapshot capture failed: ${error.message}`, "error");
    }
  }

  function toggleLiveHeatmap(checked) {
    setLiveHeatmapOn(checked);
    if (checked) liveHeatmapRef.current?.start();
    else liveHeatmapRef.current?.stop();
  }

  function toggleMouseTest(checked) {
    setMouseTestOn(checked);
    setIsTracking(checked);
    setTrackingStatus(checked ? "Mouse simulation started." : "Mouse simulation stopped.", checked ? "ok" : "");
  }

  function onOpacityChange(value) {
    setLiveHeatmapOpacityState(value);
    liveHeatmapRef.current?.setOpacity(value);
  }

  function onDebugDotToggle(checked) {
    setDebugDotOn(checked);
    gazeClientRef.current?.setDebugDotVisible(checked);
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  function handleAdvance() {
    if (isLastSlide) {
      finishSession();
      return;
    }
    if (activity?.activity_type === "QUIZ" && selectedAnswer === null) return;
    goToSlide(currentSlide + 1);
  }

  if (!context.session_id) return null;

  const analyticsHref = `/analytics?session_id=${encodeURIComponent(context.session_id)}`;
  const canOpenAnalytics = context.role === "admin";
  const isAdminTest = context.role === "admin";
  const slide = currentUnit?.slide;
  const activity = currentUnit?.activity;
  const isLastSlide = currentSlide === lessonSlides.length - 1;
  const progressPct = ((currentSlide + 1) / lessonSlides.length) * 100;
  const studentTracking = studentTrackingState(gazeStatus);
  const isPdfLesson = activity?.activity_type === "SLIDE_DECK" && slide?.type === "pdf-page";
  const slideFrameStyle = isPdfLesson
    ? { "--lesson-slide-ratio": 4 / 3, "--lesson-slide-aspect": "4 / 3" }
    : { "--lesson-slide-ratio": 16 / 9, "--lesson-slide-aspect": "16 / 9" };
  const unlockedActivityIndex = Math.max(
    0,
    lessonActivities.findIndex((item) => item.activity_id === lessonSlides[Math.min(unlockedSlide, lessonSlides.length - 1)]?.activity.activity_id)
  );
  const dragProps =
    activity?.activity_type === "SLIDE_DECK"
      ? {
          onPointerDown: beginSlideDrag,
          onPointerMove: moveSlideDrag,
          onPointerUp: endSlideDrag,
          onPointerCancel: endSlideDrag,
        }
      : {};

  return (
    <LearningLayout className={`student-lesson-viewer ${fullscreen ? "is-fullscreen" : ""}`} id="lesson-root">
      {!fullscreen && (
        <header className="lesson-viewer-header" data-zone="lesson_header">
          <div className="lesson-topbar-copy">
            <strong>{lessonTitle}</strong>
            <span>{activity ? `${activity.title} · ${activityTypeLabel(activity.activity_type)} · ${durationLabel(activity.estimated_duration_min)}` : learnerInfo}</span>
          </div>
          <div className="lesson-header-actions" data-zone="ui_controls" data-html2canvas-ignore="true">
            <div className={`student-tracking-status ${studentTracking.className}`} role="status" aria-live="polite">
              <span></span>
              {studentTracking.text}
            </div>
            {isAdminTest && <span className="test-mode-badge">Chế độ kiểm thử</span>}
            <button className="btn text" type="button" title="Chế độ toàn màn hình" onClick={toggleFullscreen}>Toàn màn hình</button>
            <button className="btn text" type="button" onClick={() => navigate(isAdminTest ? "/admin#trial" : "/courses")}>
              {isAdminTest ? "Thoát kiểm thử" : "Thoát bài học"}
            </button>
          </div>
        </header>
      )}

      <section className={`lesson-shell-grid ${outlineOpen ? "outline-visible" : ""} ${!outlineOpen ? "outline-collapsed" : ""}`}>
        <aside
          className={`lesson-outline-sidebar ${outlineOpen ? "is-open" : ""}`}
          data-zone="table_of_contents"
          data-html2canvas-ignore="true"
        >
          <div className="lesson-outline-header">
            <div>
              <h2>Nội dung bài học</h2>
              <p className="muted">{lessonPlan.modules[0]?.title || "Bài học hiện tại"}</p>
            </div>
            <button className="btn text" type="button" title="Thu gọn mục lục" onClick={() => setOutlineOpen(false)}>‹</button>
          </div>
          <div className="lesson-outline-tree">
            {lessonPlan.modules.map((module, moduleIndex) => (
              <section key={module.module_id} className="outline-module">
                <span>Chương {moduleIndex + 1}</span>
                {module.lessons.map((lesson, lessonIndex) => (
                  <div key={lesson.lesson_id} className="outline-lesson-block">
                    <div className="outline-lesson-title">Bài {lessonIndex + 1} - {lesson.title}</div>
                    <div className="outline-activity-list">
                      {lesson.activities.map((item) => {
                        const firstIndex = lessonSlides.findIndex((unit) => unit.activity.activity_id === item.activity_id);
                        const activityIndex = lessonActivities.findIndex((candidate) => candidate.activity_id === item.activity_id);
                        const state = outlineActivityState(activityIndex, currentActivityIndex, unlockedActivityIndex);
                        const locked = state === "locked";
                        return (
                          <div key={item.activity_id} className="outline-activity-block">
                            <button
                              type="button"
                              disabled={locked}
                              className={`outline-activity-row state-${state} ${currentUnit?.activity.activity_id === item.activity_id ? "active" : ""}`}
                              title={locked ? "Hoàn thành hoạt động hiện tại để mở khóa." : item.title}
                              onClick={() => {
                                if (!locked) {
                                  setOutlineOpen(false);
                                  goToSlide(firstIndex);
                                }
                              }}
                            >
                              <span className="outline-activity-marker">{locked ? "🔒" : state === "completed" ? "✓" : state === "current" ? "●" : "○"}</span>
                              <div className="outline-activity-copy">
                                <strong>{String(activityIndex + 1).padStart(2, "0")}. {item.title}</strong>
                                <em>{activityTypeIcon(item.activity_type)} {activityTypeLabel(item.activity_type)} · {item.tracking_enabled ? "Có theo dõi ánh nhìn" : durationLabel(item.estimated_duration_min)}</em>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </aside>

      <section className={`lesson-stage activity-stage type-${String(activity?.activity_type || "").toLowerCase()}`} aria-label="Student lesson activity viewer">
        {completed ? (
          <section className="lesson-complete-panel" data-zone="ui_controls" data-html2canvas-ignore="true">
            <div className="course-kicker">{isAdminTest ? "Dữ liệu kiểm thử" : "Hoàn thành bài học"}</div>
            <h1>{isAdminTest ? "Phiên kiểm thử đã kết thúc" : `Bạn đã hoàn thành ${lessonTitle}`}</h1>
            <p className="muted">
              {isAdminTest
                ? "Phiên này được gắn nhãn admin_test và không thuộc dữ liệu học tập chính thức."
                : "Tiến độ học đã được lưu. Quay lại khóa học để chọn bài tiếp theo khi giảng viên mở thêm nội dung."}
            </p>
            <div className="student-actions">
              {isAdminTest ? (
                <>
                  <button className="btn primary" type="button" onClick={() => navigate("/admin#trial")}>Về khu vực quản trị</button>
                  <button className="btn" type="button" onClick={openAnalyticsWithSnapshot}>Xem kết quả kỹ thuật</button>
                </>
              ) : (
                <>
                  <button className="btn primary" type="button" onClick={() => navigate("/courses")}>Quay lại khóa học</button>
                </>
              )}
            </div>
          </section>
	        ) : (
	          <>
          {activity?.activity_type === "SLIDE_DECK" && (
            <div className="slide-progress" aria-label={`Tiến độ ${currentSlide + 1} trên ${lessonSlides.length}`}>
              <span style={{ width: `${progressPct}%` }}></span>
            </div>
          )}

          <div className="activity-viewport">
            <div
              className={`activity-render-surface type-${String(activity?.activity_type || "").toLowerCase()}`}
              data-zone={activityAoiZone(currentUnit)}
              data-slide-id={slide?.id || activity?.activity_id}
              style={activity?.activity_type === "SLIDE_DECK" ? slideFrameStyle : undefined}
            >
              <ActivityRenderer
                unit={currentUnit}
                selectedAnswer={selectedAnswer}
                onSelectAnswer={setSelectedAnswer}
                showFeedback={showQuizFeedback}
                dragProps={dragProps}
                slideFrameStyle={slideFrameStyle}
                isTransitioning={isTransitioning}
                transitionDirection={transitionDirection}
                dragOffset={dragOffset}
              />
            </div>
          </div>

	        <div className="lesson-controls" data-zone="ui_controls" data-html2canvas-ignore="true">
	          <button className="btn" type="button" disabled={currentSlide === 0 || isTransitioning} onClick={() => goToSlide(currentSlide - 1)}>
	            Bài trước
	          </button>
	          <span>
	            {`Hoạt động ${currentActivityIndex + 1} / ${lessonActivities.length}`}
	          </span>
	          <button
	            className="btn primary"
	            type="button"
	            disabled={isLastSlide || isTransitioning || (activity?.activity_type === "QUIZ" && selectedAnswer === null)}
	            title={activity?.activity_type === "QUIZ" && selectedAnswer === null ? "Chọn một đáp án để tiếp tục." : ""}
	            onClick={handleAdvance}
	          >
	            {isLastSlide ? "Hoàn thành bài học" : showQuizFeedback || activity?.activity_type !== "QUIZ" ? "Tiếp theo" : "Xem giải thích"}
	          </button>
	        </div>

	        <div className="lesson-status-row" data-zone="ui_status" data-html2canvas-ignore="true">
            <div className="lesson-save-status">{formatSavedTime(savedAt)}</div>
            {!isAdminTest && (
              <div className={`student-tracking-status ${studentTracking.className}`} role="status" aria-live="polite">
                <span></span>
                {studentTracking.text}
              </div>
            )}
          </div>

		        {isAdminTest ? (
	          <section className="lesson-session-controls" data-zone="ui_controls" data-html2canvas-ignore="true">
	            <div className="lesson-tracking-pill">
	              <span>AI <strong className={gazeAiStatus.ok ? "ok-text" : ""}>{gazeAiStatus.message}</strong></span>
	              <span>Eye-tracking <strong>{gazeStatusLabel(gazeStatus.message)}</strong></span>
	            </div>
	            <div className="student-actions">
	              <button className="btn primary" type="button" onClick={() => gazeClientRef.current?.startGaze()}>Bật eye-tracking</button>
	              <button
	                className="btn danger"
	                type="button"
	                onClick={() => {
	                  gazeClientRef.current?.stopGaze();
	                  setGazeStatus("Tạm dừng eye-tracking.");
	                }}
	              >
	                Tạm dừng
	              </button>
	              <button className="btn" type="button" disabled={finishing} onClick={finishSession}>Hoàn thành bài</button>
	              <button className="btn danger" type="button" disabled={finishing} onClick={exitAdminTest}>Thoát kiểm thử</button>
	              {canOpenAnalytics && (
	                <a
	                  className="btn"
	                  href={analyticsHref}
	                  onClick={(e) => {
	                    e.preventDefault();
	                    openAnalyticsWithSnapshot();
	                  }}
	                >
	                  Mở phân tích
	                </a>
	              )}
	            </div>
	          </section>
			        ) : null}
	          </>
	        )}

        {!completed && (mouseAllowed || isAdmin) && (
          <details className="lesson-dev-panel" data-zone="ui_controls" data-html2canvas-ignore="true">
            <summary>Công cụ tracking cho developer</summary>
            {mouseAllowed && (
              <div className="tracking-grid" data-mouse-simulation>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    setIsTracking(true);
                    setMouseTestOn(true);
                    setTrackingStatus("Đã bật mô phỏng chuột.", "ok");
                  }}
                >
                  Bật mô phỏng chuột
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    setIsTracking(false);
                    setMouseTestOn(false);
                    setTrackingStatus("Đã tắt mô phỏng chuột.");
                  }}
                >
                  Tắt mô phỏng chuột
                </button>
                <button className="btn" type="button" disabled={sending} onClick={sendTrackingEvents}>Gửi dữ liệu tracking</button>
                <button className="btn" type="button" disabled={recalculating} onClick={recalculateMetrics}>Tính lại chỉ số</button>
                <button className="btn" type="button" onClick={captureSnapshotManually}>Chụp màn bài học</button>
              </div>
            )}
            {isAdmin && (
              <>
                <div className="live-heatmap-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={liveHeatmapOn}
                      onChange={(e) => toggleLiveHeatmap(e.target.checked)}
                    />{" "}
                    Bản đồ nhiệt trực tiếp
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={mouseTestOn}
                      onChange={(e) => toggleMouseTest(e.target.checked)}
                    />{" "}
                    Kiểm thử chuột
                  </label>
                  <label>
                    <input type="checkbox" checked={debugDotOn} onChange={(e) => onDebugDotToggle(e.target.checked)} /> Điểm kiểm tra
                  </label>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      liveHeatmapRef.current?.clear();
                      setLiveHeatmapPoints(0);
                    }}
                  >
                    Xóa bản đồ nhiệt
                  </button>
                  <label className="opacity-control">
                    Độ mờ{" "}
                    <input
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={liveHeatmapOpacity}
                      onChange={(e) => onOpacityChange(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="debug-values">
                  <div><strong>{isTracking ? "Đang tracking" : "Đang nghỉ"}</strong><br /><span className="muted">Trạng thái</span></div>
                  <div><strong>{eventCount}</strong><br /><span className="muted">Mẫu trong bộ đệm</span></div>
                  <div><strong>{lastZone}</strong><br /><span className="muted">Vùng cuối</span></div>
                  <div><strong>{lastSend}</strong><br /><span className="muted">Lần gửi cuối</span></div>
                  <div><strong>{health.gaze_chunks_count ?? 0}</strong><br /><span className="muted">Gói gaze</span></div>
                  <div><strong>{health.page_snapshot_exists ? "Đã có" : "Thiếu"}</strong><br /><span className="muted">Ảnh chụp</span></div>
                  <div><strong>{liveHeatmapPoints}</strong><br /><span className="muted">Mẫu heatmap trực tiếp</span></div>
                </div>
              </>
            )}
            <div className={`status-line ${trackingStatus.kind}`.trim()}>{trackingStatus.message}</div>
            <div className={`status-line ${snapshotStatus.kind}`.trim()}>{snapshotStatus.message}</div>
          </details>
        )}
      </section>
      </section>

      <video ref={videoRef} autoPlay playsInline muted hidden data-html2canvas-ignore="true"></video>
      <canvas ref={canvasRef} hidden data-html2canvas-ignore="true"></canvas>
      <div ref={dotRef} className="gaze-debug-dot" hidden data-html2canvas-ignore="true"></div>
    </LearningLayout>
  );
}
