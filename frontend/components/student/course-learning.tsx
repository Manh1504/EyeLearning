'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  RiArrowLeftLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckboxCircleFill,
  RiCloseLine,
  RiImageLine,
  RiMenu2Line,
} from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { useGazeTracker } from '@/hooks/use-gaze-tracker';
import { useCourseOutline, useLessonSlides, useMyEnrollments } from '@/hooks/use-student';
import {
  createLearningSession,
  getDeviceFingerprint,
  patchLessonProgress,
  postGazeSamples,
} from '@/lib/api/student';

const SLIDE_FALLBACK_IMAGE = 'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">` +
      `<rect width="100%" height="100%" fill="#e2e8f0"/>` +
      `<g fill="#94a3b8"><circle cx="400" cy="170" r="64"/>` +
      `<line x1="300" y1="265" x2="500" y2="265" stroke="#94a3b8" stroke-width="16" stroke-linecap="round"/>` +
      `<line x1="320" y1="300" x2="480" y2="300" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/>` +
      `<line x1="320" y1="330" x2="480" y2="330" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/>` +
      `</g></svg>`,
  );

function isUnresolvableImageUrl(url: string): boolean {
  try {
    const hostname = new URL(url, window.location.origin).hostname;
    return hostname === '' || !hostname.includes('.');
  } catch {
    return true;
  }
}

export default function CourseLearningPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = String(params?.courseId ?? 'c1');
  const requestedLessonId = searchParams.get('lesson');

  const { data: course } = useCourseOutline(courseId);
  const { data: enrollments = [] } = useMyEnrollments();

  const [activeLessonId, setActiveLessonId] = useState(requestedLessonId ?? '');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [gazePoint, setGazePoint] = useState<{ x: number; y: number } | null>(null);
  // Có model calibration trên backend cho (user, device) chưa → tracker quyết
  // định stream thật hay mô phỏng.
  const [gazeCalibrated, setGazeCalibrated] = useState(false);
  const [desktopOutlineOpen, setDesktopOutlineOpen] = useState(true);
  const [mobileOutlineOpen, setMobileOutlineOpen] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  // Session theo từng bài đã mở; đổi bài không cần reset phiên cũ.
  const [learningSessionIds, setLearningSessionIds] = useState<Record<string, string>>({});

  const allLessons = useMemo(
    () => course?.modules.flatMap((module) => module.lessons) ?? [],
    [course],
  );

  const requestedIsValid =
    !!requestedLessonId && allLessons.some((lesson) => lesson.id === requestedLessonId);
  const activeLessonIsValid = allLessons.some((lesson) => lesson.id === activeLessonId);
  const resolvedLessonId =
    allLessons.length === 0
      ? activeLessonId
      : requestedIsValid
        ? (requestedLessonId as string)
        : activeLessonIsValid
          ? activeLessonId
          : allLessons[0].id;

  // Render-phase adjust: tự chọn bài khi outline tải xong mà chưa có bài hợp lệ.
  if (course && allLessons.length > 0 && resolvedLessonId !== activeLessonId) {
    setActiveLessonId(resolvedLessonId);
  }
  const resolvedModuleId = course?.modules.find((module) =>
    module.lessons.some((lesson) => lesson.id === resolvedLessonId),
  )?.id;
  if (resolvedModuleId && !openModules[resolvedModuleId]) {
    setOpenModules((prev) => ({ ...prev, [resolvedModuleId]: true }));
  }

  const activeModule =
    course?.modules.find((module) =>
      module.lessons.some((lesson) => lesson.id === activeLessonId),
    ) ?? course?.modules[0];

  const activeLesson =
    activeModule?.lessons.find((lesson) => lesson.id === activeLessonId) ??
    activeModule?.lessons[0];

  const { data: slides = [] } = useLessonSlides(activeLessonId, activeLesson);
  const total = slides.length;
  // Đổi bài có ít slide hơn → quay về slide đầu (render-phase adjust).
  if (total > 0 && currentSlide > total - 1) setCurrentSlide(0);
  const currentContent = slides[currentSlide];
  const slideImageUrl =
    currentContent?.imageUrl && !isUnresolvableImageUrl(currentContent.imageUrl)
      ? currentContent.imageUrl
      : null;

  const completedLessons = allLessons.filter((lesson) => lesson.completed).length;
  const courseProgress = allLessons.length
    ? Math.round((completedLessons / allLessons.length) * 100)
    : 0;

  const flatLessonIndex = allLessons.findIndex((lesson) => lesson.id === activeLessonId);
  const nextLesson = allLessons[flatLessonIndex + 1];

  // Mở phiên học cho bài đang xem để backend ghi gaze (cần tracking_consent=true).
  useEffect(() => {
    const enrollment = enrollments.find((e) => e.course.id === courseId);
    if (!activeLessonId || !enrollment || learningSessionIds[activeLessonId]) return;

    let cancelled = false;
    createLearningSession({
      enrollmentId: enrollment.enrollmentId,
      lessonId: activeLessonId,
      deviceFingerprint: getDeviceFingerprint(),
      screenWidthPx: window.screen?.width,
      screenHeightPx: window.screen?.height,
      trackingConsent: true,
    })
      .then((session) => {
        if (!cancelled) {
          setLearningSessionIds((prev) => ({ ...prev, [activeLessonId]: session.id }));
          setGazeCalibrated(session.calibrated);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeLessonId, courseId, enrollments, learningSessionIds]);

  // Gaze stream: thu thầm, tuyệt đối không render con trỏ gaze lên nội dung.
  const learningSessionId = learningSessionIds[activeLessonId];

  const { stream: gazeStream, source: gazeSource } = useGazeTracker({
    enabled: Boolean(activeLessonId && total > 0),
    calibrated: gazeCalibrated,
    onPoint: useCallback(
      (x: number, y: number) => {
        setGazePoint({ x, y });

        const slide = slides[currentSlide];
        if (!slide || !learningSessionId) return;

        postGazeSamples(
          activeLessonId,
          [{ lessonContentId: slide.id, x, y, ts: Date.now() }],
          learningSessionId,
        ).catch(() => {});
      },
      [activeLessonId, currentSlide, slides, learningSessionId],
    ),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        setCurrentSlide((value) => Math.min(Math.max(total - 1, 0), value + 1));
      }
      if (event.key === 'ArrowLeft') {
        setCurrentSlide((value) => Math.max(0, value - 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [total]);

  useEffect(() => {
    if (!activeLessonId || total === 0) return;

    const timer = window.setTimeout(() => {
      patchLessonProgress(activeLessonId, currentSlide).catch(() => {});
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [activeLessonId, currentSlide, total]);

  const selectLesson = (lessonId: string) => {
    setActiveLessonId(lessonId);
    setCurrentSlide(0);
    setMobileOutlineOpen(false);

    const mod = course?.modules.find((item) =>
      item.lessons.some((lesson) => lesson.id === lessonId),
    );

    if (mod) {
      setOpenModules((prev) => ({ ...prev, [mod.id]: true }));
    }
  };

  const toggleModule = (moduleId: string) => {
    setOpenModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const outline = (
    <>
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Nội dung khóa học
          </p>

          <button
            type="button"
            onClick={() => setDesktopOutlineOpen(false)}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
            aria-label="Thu gọn mục lục"
            title="Thu gọn mục lục"
          >
            <RiArrowLeftSLine className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {course?.title ?? 'Khóa học'}
        </h2>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedLessons}/{allLessons.length} bài đã học</span>
          <span className="font-medium text-foreground">{courseProgress}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${courseProgress}%` }}
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {(course?.modules ?? []).map((module) => {
          const moduleDone = module.lessons.filter((lesson) => lesson.completed).length;
          const isOpen = !!openModules[module.id];
          const containsActive = module.lessons.some((lesson) => lesson.id === activeLessonId);

          return (
            <section key={module.id} className="border-b border-border/70 py-2 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleModule(module.id)}
                className="group flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/70"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                    containsActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {String(module.orderIndex).padStart(2, '0')}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5 text-foreground">
                    {module.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {moduleDone}/{module.lessons.length} bài hoàn thành
                  </span>
                </span>

                <RiArrowRightSLine
                  className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5 pl-9 pr-1 pb-1">
                  {module.lessons.map((lesson) => {
                    const active = lesson.id === activeLessonId;

                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => selectLesson(lesson.id)}
                        className={`relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'bg-cyan-50 text-cyan-800'
                            : 'text-slate-600 hover:bg-muted/70 hover:text-foreground'
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                        )}

                        {lesson.completed ? (
                          <RiCheckboxCircleFill className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                              active ? 'border-primary bg-primary/10' : 'border-slate-300'
                            }`}
                          />
                        )}

                        <span className={`min-w-0 flex-1 truncate ${active ? 'font-medium' : ''}`}>
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

  // Điểm nhìn chiếu theo KHÔNG GIAN TOÀN MÀN HÌNH — AI trả x/y chuẩn hóa theo
  // viewport (calibration phủ full màn hình) nên không nên ràng vào vùng reader.
  const gazeDot =
    gazePoint && gazePoint.x >= 0 && gazePoint.x <= 1 && gazePoint.y >= 0 && gazePoint.y <= 1 ? (
      <div className="pointer-events-none fixed inset-0 z-30">
        <span
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
          style={{ left: `${gazePoint.x * 100}%`, top: `${gazePoint.y * 100}%` }}
        />
      </div>
    ) : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-foreground">
      {/* App header */}
      <header className="z-40 flex h-14 shrink-0 items-center border-b border-border bg-white px-4 sm:px-5">
        <Link
          href="/student/my-courses"
          className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RiArrowLeftLine className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Khóa học của tôi</span>
        </Link>

        <div className="mx-auto hidden min-w-0 px-4 md:block">
          <p className="max-w-[460px] truncate text-center text-sm font-semibold text-foreground">
            {course?.title}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {gazeSource === 'real' ? (
            <div className="hidden items-center gap-1.5 pr-2 text-xs text-emerald-600 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Đang theo dõi điểm nhìn
            </div>
          ) : gazeSource === 'simulated' ? (
            <div className="hidden items-center gap-1.5 pr-2 text-xs text-amber-600 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Điểm nhìn mô phỏng
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 pr-2 text-xs text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              Theo dõi điểm nhìn
            </div>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOutlineOpen(true)}
            aria-label="Mở mục lục"
          >
            <RiMenu2Line />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop outline */}
        {desktopOutlineOpen && (
          <aside className="hidden w-[292px] shrink-0 flex-col border-r border-border bg-white lg:flex">
            {outline}
          </aside>
        )}

        {/* Mobile outline */}
        {mobileOutlineOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/20"
              onClick={() => setMobileOutlineOpen(false)}
              aria-label="Đóng mục lục"
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col bg-white shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <span className="text-sm font-semibold">Mục lục</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMobileOutlineOpen(false)}
                  aria-label="Đóng mục lục"
                >
                  <RiCloseLine />
                </Button>
              </div>
              {outline}
            </aside>
          </div>
        )}

        {/* Learning canvas */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
          {/* Lesson meta */}
          <div className="shrink-0 border-b border-border/70 bg-white px-4 py-3 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1280px] items-center gap-3">
              {!desktopOutlineOpen && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden shrink-0 lg:inline-flex"
                  onClick={() => setDesktopOutlineOpen(true)}
                  aria-label="Mở mục lục"
                  title="Mở mục lục"
                >
                  <RiMenu2Line />
                </Button>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {activeModule
                    ? `Chương ${activeModule.orderIndex} · ${activeModule.title}`
                    : 'Bài học'}
                </p>
                <h1 className="mt-0.5 truncate text-sm font-semibold text-foreground sm:text-base">
                  {activeLesson?.title ?? 'Đang tải bài học...'}
                </h1>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Trang</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {total ? currentSlide + 1 : 0}
                  <span className="font-normal text-muted-foreground"> / {total}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Reader — luôn nằm gọn trong phần viewport còn lại.
              Ảnh trang PDF giữ nguyên aspect ratio gốc, không bị ép thành 16:9. */}
          <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
            <div className="relative mx-auto flex h-full min-h-0 max-w-[1280px] items-center justify-center overflow-hidden">
              {slideImageUrl ? (
                <span className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slideImageUrl}
                    alt={currentContent.title}
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.dataset.fallback) return;
                      img.dataset.fallback = '1';
                      img.src = SLIDE_FALLBACK_IMAGE;
                    }}
                    className="block h-auto max-h-full w-auto max-w-full bg-white object-contain shadow-sm ring-1 ring-slate-900/10"
                  />
                </span>
              ) : (
                <div className="relative h-full max-h-full aspect-[210/297] max-w-full overflow-hidden bg-white shadow-sm ring-1 ring-slate-900/10">
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                      <RiImageLine className="h-5 w-5" />
                    </div>
                    <p className="mt-4 max-w-sm text-base font-semibold text-slate-800 sm:text-lg">
                      {currentContent?.title ?? 'Nội dung bài học'}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nội dung trang PDF sẽ hiển thị tại đây.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {gazeStream && gazeSource === 'real' && (
            <div
              className="pointer-events-none fixed bottom-20 right-4 z-30 h-28 w-20 overflow-hidden rounded-xl border-2 border-white shadow-lg ring-1 ring-slate-900/10"
              title="Camera đang theo dõi điểm nhìn"
            >
              <video
                autoPlay
                playsInline
                muted
                ref={(element) => {
                  if (element && element.srcObject !== gazeStream) {
                    element.srcObject = gazeStream;
                  }
                }}
                className="h-full w-full scale-x-[-1] object-cover"
              />
            </div>
          )}

          {/* Reader controls */}
          <footer className="shrink-0 border-t border-border bg-white px-4 py-2 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1280px] items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSlide((value) => Math.max(0, value - 1))}
                disabled={currentSlide === 0 || total === 0}
              >
                <RiArrowLeftSLine />
                <span className="hidden sm:inline">Trang trước</span>
              </Button>

              <div className="flex min-w-0 flex-1 items-center gap-3 px-1 sm:px-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">Tiến độ bài</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{
                      width: `${total ? ((currentSlide + 1) / total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {total ? Math.round(((currentSlide + 1) / total) * 100) : 0}%
                </span>
              </div>

              {currentSlide === total - 1 && total > 0 && nextLesson ? (
                <Button size="sm" onClick={() => selectLesson(nextLesson.id)}>
                  Bài tiếp theo
                  <RiArrowRightSLine />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentSlide((value) => Math.min(Math.max(total - 1, 0), value + 1))
                  }
                  disabled={currentSlide === total - 1 || total === 0}
                >
                  <span className="hidden sm:inline">Trang sau</span>
                  <RiArrowRightSLine />
                </Button>
              )}
            </div>
          </footer>
        </main>
      </div>
      {gazeDot}
    </div>
  );
}