"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { useGazeTracker } from "@/hooks/use-gaze-tracker";
import {
  useCourseOutline,
  useLessonSlides,
  useMyEnrollments,
} from "@/hooks/use-student";
import {
  createLearningSession,
  endLearningSession,
  getDeviceFingerprint,
  postGazeSamples,
  type GazeSample,
} from "@/lib/api/student";
import {
  getContainedImageRect,
  getStoredGazeSessionId,
  screenGazeToSlide,
} from "@/lib/api/calibration";
import { resolveMediaUrl } from "@/lib/api/client";
import { InlineQuiz } from "@/components/quiz/inline-quiz";
import { StudyAssistantChat } from "@/components/assistant/study-assistant-chat";

const SLIDE_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">` +
      `<rect width="100%" height="100%" fill="#e2e8f0"/>` +
      `<g fill="#94a3b8"><circle cx="400" cy="170" r="64"/>` +
      `<line x1="300" y1="265" x2="500" y2="265" stroke="#94a3b8" stroke-width="16" stroke-linecap="round"/>` +
      `<line x1="320" y1="300" x2="480" y2="300" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/>` +
      `<line x1="320" y1="330" x2="480" y2="330" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/>` +
      `</g></svg>`,
  );

// Gom gaze sample rồi gửi theo batch — tránh vượt rate limit 60 req/phút của backend
// (tracker phát ~20 điểm/giây; gửi lẻ từng điểm sẽ chạm trần gần như ngay lập tức).
const GAZE_FLUSH_MS = 1500;
const GAZE_MAX_BATCH = 40;

export function LearningReader({ courseId }: { courseId: string }) {
  const searchParams = useSearchParams();
  const requestedLessonId = searchParams.get("lesson");

  const { data: course, isLoading: courseLoading, isError: courseError, refetch } =
    useCourseOutline(courseId);
  const { data: enrollments = [] } = useMyEnrollments();

  const [activeLessonId, setActiveLessonId] = useState(requestedLessonId ?? "");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [desktopOutlineOpen, setDesktopOutlineOpen] = useState(true);
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [learningSessionIds, setLearningSessionIds] = useState<Record<string, string>>({});
  const [trackingLessons, setTrackingLessons] = useState<Record<string, boolean>>({});
  // Phiên hiệu chỉnh đọc thẳng từ localStorage ngay lần render đầu (client):
  // bài tập không tạo phiên học nên không thể dựa vào callback tạo phiên để biết
  // đã hiệu chỉnh hay chưa. Chỉ dùng cho effect của useGazeTracker nên không gây
  // lệch hydration.
  const [gazeCalibrated, setGazeCalibrated] = useState(() =>
    Boolean(getStoredGazeSessionId()),
  );
  // Vị trí chấm điểm nhìn (chuẩn hóa theo màn hình) khi GV bật hiển thị cho SV.
  // `key` = bài+trang lúc ghi, để tự ẩn khi đổi trang/bài mà không cần effect.
  const [gazeDot, setGazeDot] = useState<{ x: number; y: number; key: string } | null>(null);

  const slideImgRef = useRef<HTMLImageElement>(null);
  const gazeBufferRef = useRef<GazeSample[]>([]);
  const gazeBufferLessonRef = useRef<string | null>(null);
  const flushTimerRef = useRef<number>(0);
  const sessionsRef = useRef<Record<string, string>>({});

  const allItems = useMemo(
    () => course?.modules.flatMap((module) => module.lessons) ?? [],
    [course],
  );

  const requestedIsValid =
    !!requestedLessonId && allItems.some((lesson) => lesson.id === requestedLessonId);
  const activeLessonIsValid = allItems.some((lesson) => lesson.id === activeLessonId);
  const resolvedLessonId =
    allItems.length === 0
      ? activeLessonId
      : requestedIsValid
        ? (requestedLessonId as string)
        : activeLessonIsValid
          ? activeLessonId
          : allItems[0].id;

  // Render-phase adjust: tự chọn bài khi outline tải xong mà chưa có bài hợp lệ.
  if (course && allItems.length > 0 && resolvedLessonId !== activeLessonId) {
    setActiveLessonId(resolvedLessonId);
  }

  const activeModule = useMemo(
    () =>
      course?.modules.find((module) =>
        module.lessons.some((lesson) => lesson.id === activeLessonId),
      ) ?? course?.modules[0],
    [course, activeLessonId],
  );

  const activeLesson = useMemo(
    () =>
      activeModule?.lessons.find((lesson) => lesson.id === activeLessonId) ??
      activeModule?.lessons[0],
    [activeModule, activeLessonId],
  );

  const activeIsQuiz = activeLesson?.kind === "quiz";
  const activeQuizId = activeLesson?.quizId ?? "";
  // Cờ điểm nhìn thuộc KHÓA HỌC: bật là áp cho mọi bài giảng VÀ bài tập.
  const showGazeDot = Boolean(course?.showGazeDot);

  // Render-phase adjust: mở chương chứa bài đang học.
  if (activeModule && !openModules[activeModule.id]) {
    setOpenModules((prev) => ({ ...prev, [activeModule.id]: true }));
  }

  const { data: slides = [], isLoading: slidesLoading } = useLessonSlides(
    activeIsQuiz ? "" : activeLessonId,
  );
  const total = slides.length;
  // Render-phase adjust: đổi bài có ít slide hơn → quay về slide đầu.
  if (total > 0 && currentSlide > total - 1) setCurrentSlide(0);
  const currentContent = slides[currentSlide];

  const slideImageUrl = useMemo(
    () => resolveMediaUrl(currentContent?.imageUrl),
    [currentContent],
  );

  const flatLessonIndex = allItems.findIndex((lesson) => lesson.id === activeLessonId);
  const nextLesson = allItems[flatLessonIndex + 1];

  const enrollmentId = enrollments.find((enrollment) => enrollment.course.id === courseId)?.enrollmentId;

  // Flush đúng batch của bài/phiên cũ trước khi phiên bị đóng.
  const flushGazeForLesson = useCallback((lessonId: string, sessionId?: string, keepalive = false) => {
    if (gazeBufferLessonRef.current !== lessonId) return;
    const sid = sessionId ?? sessionsRef.current[lessonId];
    const buf = gazeBufferRef.current;
    if (!sid || buf.length === 0) return;
    gazeBufferRef.current = [];
    gazeBufferLessonRef.current = null;
    postGazeSamples(lessonId, buf, sid, "real", keepalive).catch(() => {});
  }, []);

  const closeLearningSession = useCallback((lessonId: string, expectedSessionId?: string, keepalive = false) => {
    const sessionId = sessionsRef.current[lessonId];
    if (!sessionId || (expectedSessionId && sessionId !== expectedSessionId)) return;

    flushGazeForLesson(lessonId, sessionId, keepalive);
    delete sessionsRef.current[lessonId];
    setLearningSessionIds((prev) => {
      if (prev[lessonId] !== sessionId) return prev;
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });
    endLearningSession(sessionId, "completed", keepalive).catch(() => {});
  }, [flushGazeForLesson]);

  // Mỗi lần vào bài tạo một phiên mới; phiên đã đóng bị xóa khỏi cả ref và state.
  // Bài tập trắc nghiệm cũng có phiên: gaze của bài tập được ghi thô theo viewport
  // (surface='quiz', không có slide).
  useEffect(() => {
    if (!activeLessonId || !enrollmentId || sessionsRef.current[activeLessonId]) return;

    const lessonId = activeLessonId;
    let cancelled = false;
    let createdSessionId: string | null = null;
    createLearningSession({
      enrollmentId,
      lessonId,
      deviceFingerprint: getDeviceFingerprint(),
      screenWidthPx: window.innerWidth,
      screenHeightPx: window.innerHeight,
      trackingConsent: true,
    })
      .then((session) => {
        createdSessionId = session.id;
        if (cancelled) {
          endLearningSession(session.id, "completed").catch(() => {});
          return;
        }
        sessionsRef.current[lessonId] = session.id;
        setLearningSessionIds((prev) => ({ ...prev, [lessonId]: session.id }));
        setTrackingLessons((prev) => ({ ...prev, [lessonId]: session.trackingConsent }));
        setGazeCalibrated(Boolean(getStoredGazeSessionId()));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (createdSessionId) closeLearningSession(lessonId, createdSessionId);
    };
  }, [activeLessonId, enrollmentId, closeLearningSession]);

  const learningSessionId = learningSessionIds[activeLessonId];
  // Chỉ thu gaze khi backend cho phép (trackingConsent=true trong phiên học).
  const trackingAllowed = Boolean(activeLessonId) && trackingLessons[activeLessonId] !== false;

  const flushGaze = useCallback(() => {
    flushGazeForLesson(activeLessonId);
  }, [activeLessonId, flushGazeForLesson]);

  const enqueueGaze = useCallback(
    (sample: GazeSample) => {
      if (gazeBufferLessonRef.current && gazeBufferLessonRef.current !== activeLessonId) {
        flushGazeForLesson(gazeBufferLessonRef.current);
      }
      gazeBufferLessonRef.current = activeLessonId;
      gazeBufferRef.current.push(sample);
      if (gazeBufferRef.current.length >= GAZE_MAX_BATCH) {
        flushGaze();
      }
    },
    [activeLessonId, flushGaze, flushGazeForLesson],
  );

  useEffect(() => {
    if (!learningSessionId) return;
    flushTimerRef.current = window.setInterval(flushGaze, GAZE_FLUSH_MS);
    return () => {
      window.clearInterval(flushTimerRef.current);
      flushGaze();
    };
  }, [learningSessionId, flushGaze]);

  const { source: gazeSource } = useGazeTracker({
    // Bài giảng: cần có slide. Bài tập: không có slide nhưng vẫn thu gaze để ghi
    // nhận (và để hiện chấm nếu khóa bật "hiển thị điểm nhìn cho sinh viên").
    enabled: Boolean(activeLessonId && trackingAllowed && (total > 0 || activeIsQuiz)),
    calibrated: gazeCalibrated,
    allowSimulation: false,
    onPoint: useCallback(
      (x: number, y: number, source: string) => {
        if (source !== "real") return;
        if (showGazeDot) {
          // Toạ độ gaze chuẩn hoá theo viewport có thể < 0 hoặc > 1 khi nhìn ra
          // ngoài màn hình → cho chấm đi hẳn ra ngoài thay vì kẹp lại bên trong.
          // (-1, -1) là sentinel "mất khuôn mặt" (no_face) → ẩn chấm.
          if (x === -1 && y === -1) setGazeDot(null);
          else setGazeDot({ x, y, key: `${activeLessonId}:${currentSlide}` });
        }
        if (!learningSessionId || !trackingAllowed) return;

        if (activeIsQuiz) {
          // Bài tập: không có ảnh slide để map toạ độ → gửi thẳng toạ độ viewport.
          enqueueGaze({ lessonContentId: null, x, y, ts: Date.now() });
          return;
        }

        const slide = slides[currentSlide];
        const img = slideImgRef.current;
        const containerRect = img?.getBoundingClientRect();

        let mapped: { x: number; y: number } | null = null;
        if (img && containerRect) {
          const paintedRect = getContainedImageRect(
            {
              left: containerRect.left,
              top: containerRect.top,
              width: containerRect.width,
              height: containerRect.height,
            },
            img.naturalWidth,
            img.naturalHeight,
          );
          if (paintedRect) mapped = screenGazeToSlide(x, y, paintedRect);
        }

        if (!slide) return;
        enqueueGaze({
          lessonContentId: slide.id,
          x: mapped ? mapped.x : -1,
          y: mapped ? mapped.y : -1,
          ts: Date.now(),
        });
      },
      [currentSlide, slides, learningSessionId, enqueueGaze, trackingAllowed, showGazeDot, activeLessonId, activeIsQuiz],
    ),
  });

  // Điều hướng bàn phím
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setCurrentSlide((value) => Math.min(Math.max(total - 1, 0), value + 1));
      }
      if (event.key === "ArrowLeft") {
        setCurrentSlide((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [total]);

  // Đóng mọi phiên còn sống khi rời trang. closeLearningSession xóa ID trước khi gọi API.
  useEffect(() => {
    const closeAll = (keepalive = false) => {
      for (const lessonId of Object.keys(sessionsRef.current)) {
        closeLearningSession(lessonId, undefined, keepalive);
      }
    };
    const onBeforeUnload = () => {
      closeAll(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      closeAll();
    };
  }, [closeLearningSession]);

  const selectLesson = (lessonId: string) => {
    // Đóng phiên bài cũ trước khi chuyển
    if (activeLessonId !== lessonId) closeLearningSession(activeLessonId);
    setActiveLessonId(lessonId);
    setCurrentSlide(0);
    setMobileOutlineOpen(false);
    const mod = course?.modules.find((item) =>
      item.lessons.some((lesson) => lesson.id === lessonId),
    );
    if (mod) setOpenModules((prevOpen) => ({ ...prevOpen, [mod.id]: true }));
  };

  if (courseLoading) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-[#f5f6f2] p-2 sm:p-3">
        <div className="flex h-12 shrink-0 items-center px-3">
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
           <Skeleton className="hidden w-64 shrink-0 rounded-[20px] lg:block" />
          <div className="flex min-w-0 flex-1 items-center justify-center p-3">
             <Skeleton className="aspect-video w-full max-w-5xl rounded-[18px]" />
          </div>
        </div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <ErrorState
          title="Không tải được bài học"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const outline = (
    <>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#e8f1e6] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#52704f]">
            Mục lục
          </span>
          <button
            type="button"
            onClick={() => setDesktopOutlineOpen(false)}
            className="hidden size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
            aria-label="Thu gọn mục lục"
          >
            <Icon name="ri-arrow-left-s-line" className="size-4" />
          </button>
        </div>
        <h2 className="mt-4 line-clamp-2 text-base font-semibold leading-6 tracking-tight text-foreground">
          {course.title}
        </h2>
        <p className="mt-5 text-[11px] text-muted-foreground">{allItems.length} mục</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {course.modules.map((module) => {
          const isOpen = !!openModules[module.id];
          const containsActive = module.lessons.some((lesson) => lesson.id === activeLessonId);
          return (
            <section key={module.id} className="py-1">
              <button
                type="button"
                onClick={() => setOpenModules((prev) => ({ ...prev, [module.id]: !prev[module.id] }))}
                className="group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    containsActive ? "bg-primary text-white" : "border border-border bg-surface text-muted-foreground",
                  )}
                >
                  {String(module.orderIndex).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5 text-foreground">
                    {module.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {module.lessons.length} mục
                  </span>
                </span>
                <Icon
                  name="ri-arrow-right-s-line"
                  className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                />
              </button>

              {isOpen && (
                <div className="mb-2 ml-6 border-l border-border pl-3">
                  {module.lessons.map((lesson) => {
                    const active = lesson.id === activeLessonId;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => selectLesson(lesson.id)}
                        className={cn(
                          "relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                          active
                            ? "bg-primary text-white"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {lesson.kind === "quiz" ? (
                          <Icon
                            name="ri-file-text-line"
                            className={cn(
                              "size-3.5 shrink-0",
                              active ? "text-white" : "text-muted-foreground",
                            )}
                          />
                        ) : (
                          <span
                            className={cn(
                              "size-3.5 shrink-0 rounded-full border",
                              active ? "border-white bg-white" : "border-border",
                            )}
                          />
                        )}
                        <span className={cn("min-w-0 flex-1 truncate", active && "font-medium")}>
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>
    </>
  );

  const atLast = currentSlide === total - 1 && total > 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f5f6f2] p-2 text-foreground sm:p-3">
      <header className="z-40 flex h-12 shrink-0 items-center px-2 sm:px-3">
        <Link
          href="/student"
          className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <Icon name="ri-arrow-left-line" className="size-4 shrink-0" />
          <span className="hidden sm:inline">Khóa học của tôi</span>
        </Link>

        <div className="mx-auto hidden min-w-0 px-4 md:block">
          <p className="max-w-[460px] truncate text-center text-xs font-medium text-muted-foreground">
            {course.title}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {gazeSource === "real" ? (
            <div className="hidden items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] text-foreground sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Gaze đang hoạt động
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              Gaze chưa kết nối
            </div>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOutlineOpen(true)}
            aria-label="Mở mục lục"
          >
            <Icon name="ri-menu-line" className="size-5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {desktopOutlineOpen && (
          <aside className="hidden w-[280px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-border/80 bg-white shadow-xs lg:flex">
            {outline}
          </aside>
        )}

        {mobileOutlineOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              onClick={() => setMobileOutlineOpen(false)}
              aria-label="Đóng mục lục"
            />
             <aside className="absolute inset-y-2 left-2 flex w-[min(88vw,320px)] flex-col overflow-hidden rounded-[20px] border border-border/80 bg-white shadow-lg">
              <div className="flex h-14 items-center justify-between px-5">
                <span className="text-sm font-semibold">Mục lục</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMobileOutlineOpen(false)}
                  aria-label="Đóng mục lục"
                >
                  <Icon name="ri-close-line" className="size-5" />
                </Button>
              </div>
              {outline}
            </aside>
          </div>
        )}

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-border/80 bg-[#fffffb] shadow-xs">
          <div className="z-10 shrink-0 px-4 py-3 sm:px-5">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3">
              {!desktopOutlineOpen && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden shrink-0 lg:inline-flex"
                  onClick={() => setDesktopOutlineOpen(true)}
                  aria-label="Mở mục lục"
                >
                  <Icon name="ri-menu-line" className="size-5" />
                </Button>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-muted-foreground">
                  {activeModule ? `Chương ${activeModule.orderIndex} · ${activeModule.title}` : "Bài học"}
                </p>
                <h1 className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {activeLesson?.title ?? "Đang tải bài học..."}
                </h1>
              </div>
              <div className="shrink-0 rounded-full bg-muted px-3 py-1.5">
                {activeIsQuiz ? (
                  <p className="text-xs font-medium text-foreground">Bài tập</p>
                ) : (
                  <p className="text-xs font-medium tabular-nums text-foreground">
                    {total ? currentSlide + 1 : 0}
                    <span className="font-normal text-muted-foreground"> / {total}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {gazeSource === "off" && (total > 0 || activeIsQuiz) && (
            <div className="z-10 shrink-0 px-4 pb-2 sm:px-5">
              <div className="mx-auto flex max-w-[1400px] flex-col gap-2 rounded-xl border border-[#dce8d9] bg-[#e8f1e6] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-foreground">
                  Không kết nối được phiên theo dõi điểm nhìn (phiên hiệu chỉnh có thể đã hết hạn). Nội
                  dung vẫn dùng được bình thường, nhưng dữ liệu gaze sẽ không được ghi nhận.
                </p>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link
                    href={`/student/courses/${courseId}/prepare${activeLessonId ? `?lesson=${encodeURIComponent(activeLessonId)}` : ""}`}
                  >
                    Kiểm tra &amp; hiệu chỉnh lại
                  </Link>
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-[#f9f9f5] px-3 pb-24 pt-3 sm:px-5">
            {activeIsQuiz ? (
              <div className="mx-auto w-full max-w-4xl py-2">
                {activeQuizId ? (
                  <InlineQuiz
                    quizId={activeQuizId}
                    onNext={nextLesson ? () => selectLesson(nextLesson.id) : undefined}
                    hasNext={Boolean(nextLesson)}
                  />
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Bài tập chưa sẵn sàng.
                  </p>
                )}
              </div>
            ) : (
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-8 py-2">
              <div className="mx-auto w-full max-w-[min(1120px,calc((100dvh-10.5rem)*16/9))]">
              {slidesLoading ? (
                <Skeleton className="aspect-video w-full rounded-2xl" />
              ) : slideImageUrl ? (
                <div className="relative aspect-video overflow-hidden rounded-[18px] border border-border/80 bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={slideImgRef}
                    src={slideImageUrl}
                    alt={currentContent.title}
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.dataset.fallback) return;
                      img.dataset.fallback = "1";
                      img.src = SLIDE_FALLBACK_IMAGE;
                    }}
                    className="absolute inset-0 block h-full w-full bg-white object-contain"
                  />
                </div>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center rounded-[18px] border border-border/80 bg-white p-8 text-center shadow-sm">
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon name="ri-image-line" className="size-5" />
                  </div>
                  <p className="mt-4 max-w-sm text-base font-semibold text-foreground sm:text-lg">
                    {currentContent?.title ?? "Nội dung bài học"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nội dung trang PDF sẽ hiển thị tại đây.
                  </p>
                </div>
              )}
              </div>
            </div>
            )}
          </div>

          {!activeIsQuiz && (
          <footer className="absolute inset-x-0 bottom-3 z-20 px-3 sm:bottom-4 sm:px-5">
            <div className="mx-auto flex max-w-xl items-center gap-2 rounded-full border border-border/80 bg-white/95 p-1.5 shadow-md backdrop-blur-md">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSlide((value) => Math.max(0, value - 1))}
                disabled={currentSlide === 0 || total === 0}
              >
                <Icon name="ri-arrow-left-s-line" className="size-4" />
                <span className="hidden sm:inline">Trước</span>
              </Button>

              <div className="flex-1" />

              {atLast && nextLesson ? (
                <Button size="sm" onClick={() => selectLesson(nextLesson.id)}>
                  Bài tiếp theo
                  <Icon name="ri-arrow-right-s-line" className="size-4" />
                </Button>
              ) : atLast ? (
                <span className="hidden px-2 text-xs font-medium text-muted-foreground sm:inline-flex">
                  Đã xem hết bài
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentSlide((value) => Math.min(Math.max(total - 1, 0), value + 1))
                  }
                  disabled={atLast || total === 0}
                >
                  <span className="hidden sm:inline">Sau</span>
                  <Icon name="ri-arrow-right-s-line" className="size-4" />
                </Button>
              )}
            </div>
          </footer>
          )}
        </main>
      </div>

      {showGazeDot && gazeDot && gazeDot.key === `${activeLessonId}:${currentSlide}` && (
        <div className="pointer-events-none fixed inset-0 z-30">
          <span
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow-[0_1px_5px_rgba(0,0,0,0.2)]"
            style={{ left: `${gazeDot.x * 100}%`, top: `${gazeDot.y * 100}%` }}
          />
        </div>
      )}

      {/* Trợ lý học tập: gắn ở trang đọc slide để hỏi ngay trong ngữ cảnh bài đang học.
          Bài tập (quiz) có widget riêng trong InlineQuiz nên không gắn trùng. */}
      {!activeIsQuiz && activeLessonId && (
        <StudyAssistantChat courseId={courseId} lessonId={activeLessonId} />
      )}
    </div>
  );
}
