'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { RiMenu2Line, RiCloseLine, RiCheckboxCircleFill, RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { useGazeTracker } from '@/hooks/use-gaze-tracker';
import { useCourseOutline, useLessonProgress, useLessonSlides, useMyEnrollments } from '@/hooks/use-student';
import { createLearningSession, getDeviceFingerprint, patchLessonProgress, postGazeSamples } from '@/lib/api/student';
import { getStoredGazeSessionId, screenGazeToSlide } from '@/lib/api/calibration';
import { resolveMediaUrl } from '@/lib/api/client';

const SLIDE_FALLBACK =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="100%" height="100%" fill="#e2e8f0"/><g fill="#94a3b8"><circle cx="400" cy="170" r="64"/><line x1="300" y1="265" x2="500" y2="265" stroke="#94a3b8" stroke-width="16" stroke-linecap="round"/><line x1="320" y1="300" x2="480" y2="300" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/><line x1="320" y1="330" x2="480" y2="330" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round"/></g></svg>`,
  );

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
  const [showResume, setShowResume] = useState(false);
  const [resumeHandled, setResumeHandled] = useState<string | null>(null);
  const slideImgRef = useRef<HTMLImageElement>(null);
  const [gazeCalibrated, setGazeCalibrated] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [learningSessionIds, setLearningSessionIds] = useState<Record<string, string>>({});
  const [dwellSec, setDwellSec] = useState(0);

  const allLessons = useMemo(() => course?.modules.flatMap((m) => m.lessons) ?? [], [course]);
  const requestedIsValid = !!requestedLessonId && allLessons.some((l) => l.id === requestedLessonId);
  const activeIsValid = allLessons.some((l) => l.id === activeLessonId);
  const resolvedLessonId = allLessons.length === 0 ? activeLessonId : requestedIsValid ? (requestedLessonId as string) : activeIsValid ? activeLessonId : allLessons[0]?.id ?? '';
  if (course && allLessons.length > 0 && resolvedLessonId !== activeLessonId) setActiveLessonId(resolvedLessonId);
  const resolvedModuleId = course?.modules.find((m) => m.lessons.some((l) => l.id === resolvedLessonId))?.id;
  if (resolvedModuleId && !openModules[resolvedModuleId]) setOpenModules((p) => ({ ...p, [resolvedModuleId]: true }));

  const activeModule = course?.modules.find((m) => m.lessons.some((l) => l.id === activeLessonId)) ?? course?.modules[0];
  const activeLesson = activeModule?.lessons.find((l) => l.id === activeLessonId) ?? activeModule?.lessons[0];
  const { data: slides = [] } = useLessonSlides(activeLessonId, activeLesson);
  const total = slides.length;
  const { data: progress } = useLessonProgress(activeLessonId);
  if (total > 0 && currentSlide > total - 1) setCurrentSlide(0);
  const currentContent = slides[currentSlide];
  const slideUrl = useMemo(() => resolveMediaUrl(currentContent?.imageUrl), [currentContent]);
  const completedLessons = allLessons.filter((l) => l.completed).length;
  const courseProgress = allLessons.length ? Math.round((completedLessons / allLessons.length) * 100) : 0;
  const flatIndex = allLessons.findIndex((l) => l.id === activeLessonId);
  const nextLesson = allLessons[flatIndex + 1];

  // dwell timer — reset khi đổi bài/slide
  useEffect(() => {
    const t = window.setInterval(() => setDwellSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [activeLessonId, currentSlide]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDwellSec(0);
  }, [activeLessonId, currentSlide]);

  const formatDwell = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    const e = enrollments.find((x) => x.course.id === courseId);
    if (!activeLessonId || !e || learningSessionIds[activeLessonId]) return;
    let cancelled = false;
    createLearningSession({
      enrollmentId: e.enrollmentId,
      lessonId: activeLessonId,
      deviceFingerprint: getDeviceFingerprint(),
      screenWidthPx: window.innerWidth,
      screenHeightPx: window.innerHeight,
      trackingConsent: true,
    })
      .then((s) => {
        if (!cancelled) {
          setLearningSessionIds((p) => ({ ...p, [activeLessonId]: s.id }));
          setGazeCalibrated(Boolean(getStoredGazeSessionId()));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeLessonId, courseId, enrollments, learningSessionIds]);

  const learningSessionId = learningSessionIds[activeLessonId];
  const { source: gazeSource } = useGazeTracker({
    enabled: Boolean(activeLessonId && total > 0),
    calibrated: gazeCalibrated,
    allowSimulation: false,
    onPoint: useCallback(
      (x: number, y: number, source: string) => {
        if (source !== 'real') return;
        const slide = slides[currentSlide];
        const img = slideImgRef.current;
        const rect = img?.getBoundingClientRect();
        let mapped: { x: number; y: number } | null = null;
        if (rect && rect.width > 0 && rect.height > 0) {
          mapped = screenGazeToSlide(x, y, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        }
        setGazePoint(mapped);
        if (!slide || !learningSessionId) return;
        postGazeSamples(activeLessonId, [{ lessonContentId: slide.id, x: mapped ? mapped.x : -1, y: mapped ? mapped.y : -1, ts: Date.now() }], learningSessionId).catch(() => {});
      },
      [activeLessonId, currentSlide, slides, learningSessionId],
    ),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentSlide((v) => Math.min(Math.max(total - 1, 0), v + 1));
      if (e.key === 'ArrowLeft') setCurrentSlide((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  useEffect(() => {
    if (!activeLessonId || total === 0) return;
    const t = window.setTimeout(() => {
      patchLessonProgress(activeLessonId, currentSlide).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, [activeLessonId, currentSlide, total]);

  useEffect(() => {
    if (!activeLessonId || !progress || total === 0) return;
    if (resumeHandled === activeLessonId) return;
    if (progress.completed) return;
    if (progress.lastSlide > 0 && progress.lastSlide < total) {
      const id = setTimeout(() => setShowResume(true), 0);
      return () => clearTimeout(id);
    }
  }, [activeLessonId, progress, total, resumeHandled]);

  const selectLesson = (id: string) => {
    setActiveLessonId(id);
    setCurrentSlide(0);
    setMobileOpen(false);
    const mod = course?.modules.find((m) => m.lessons.some((l) => l.id === id));
    if (mod) setOpenModules((p) => ({ ...p, [mod.id]: true }));
  };
  const toggleModule = (id: string) => setOpenModules((p) => ({ ...p, [id]: !p[id] }));
  const handleComplete = () => {
    if (!activeLessonId) return;
    patchLessonProgress(activeLessonId, currentSlide, true)
      .then(() => {
        if (nextLesson) selectLesson(nextLesson.id);
      })
      .catch(() => {});
  };

  const gazeDot =
    gazePoint && gazePoint.x >= 0 && gazePoint.x <= 1 && gazePoint.y >= 0 && gazePoint.y <= 1 ? (
      <div className="pointer-events-none absolute inset-0 z-10">
        <span className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow" style={{ left: `${gazePoint.x * 100}%`, top: `${gazePoint.y * 100}%` }} />
      </div>
    ) : null;

  const outline = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold tracking-wide text-[#0f2d5e]">CẤU TRÚC BÀI GIẢNG</p>
          <span className="rounded bg-[#e8f9fd] px-2 py-0.5 text-xs font-bold text-[#0b5f7a]">{allLessons.length ? `${allLessons.findIndex((l) => l.id === activeLessonId) + 1} / ${allLessons.length}` : '—'}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Tiến độ tổng {completedLessons}/{allLessons.length} bài hoàn thành</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-[#0f2d5e]" style={{ width: `${courseProgress}%` }} />
        </div>
        <p className="mt-1 text-right text-xs font-bold text-[#0f2d5e]">{courseProgress}%</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {(course?.modules ?? []).map((module) => {
          const isOpen = !!openModules[module.id];
          const contains = module.lessons.some((l) => l.id === activeLessonId);
          const done = module.lessons.filter((l) => l.completed).length;
          return (
            <section key={module.id} className="border-b border-border/60 py-2 last:border-0">
              <button onClick={() => toggleModule(module.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted/60">
                <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${contains ? 'bg-[#0f2d5e] text-white' : 'bg-muted text-muted-foreground'}`}>{String(module.orderIndex).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{module.title}</span>
                  <span className="text-xs text-muted-foreground">{done}/{module.lessons.length} bài</span>
                </span>
                <RiArrowRightSLine className={`h-4 w-4 text-muted-foreground transition ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              {isOpen && (
                <div className="ml-8 mt-1 space-y-0.5 border-l border-border pl-3">
                  {module.lessons.map((lesson) => {
                    const active = lesson.id === activeLessonId;
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => selectLesson(lesson.id)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${active ? 'bg-[#e8f9fd] font-semibold text-[#0b5f7a]' : 'text-muted-foreground hover:bg-muted/40'}`}
                      >
                        {lesson.completed ? <RiCheckboxCircleFill className="h-4 w-4 text-[#0b5f7a]" /> : <span className={`h-3 w-3 rounded-full border ${active ? 'border-[#0b5f7a]' : 'border-border'}`} />}
                        <span className="truncate">{lesson.title}</span>
                        {active && <span className="ml-auto rounded bg-[#0b5f7a] px-1.5 py-0.5 text-[10px] text-white">Active</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#eef2f5] text-foreground">
      {/* Top bar — khớp ảnh Container */}
      <header className="flex h-8 shrink-0 items-center gap-2 bg-black px-3 text-xs text-white">
        <button onClick={() => setDesktopOpen((v) => !v)} className="hidden items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-black lg:inline-flex">
          {desktopOpen ? 'Thu gọn mục lục' : 'Mở mục lục'}
        </button>
        <button onClick={() => setMobileOpen(true)} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-black lg:hidden">
          <RiMenu2Line className="h-3 w-3" /> Mục lục
        </button>
        <span className="hidden truncate sm:inline">Chương 4: Thuật toán Trích xuất Viền Đồng tử</span>
        <span className="rounded bg-[#7ee3f7] px-2 py-0.5 font-bold text-black">Trang {total ? currentSlide + 1 : 0} / {total || '—'}</span>
        <span className="ml-auto hidden items-center gap-1 text-[#7ee3f7] sm:inline-flex">◷ Thời gian trên slide: {formatDwell(dwellSec)}</span>
        {gazeSource === 'real' ? (
          <span className="ml-2 hidden items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white sm:inline-flex">● GAZE LOGGING ACTIVE</span>
        ) : (
          <span className="ml-2 hidden items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white sm:inline-flex">● OFFLINE (pass)</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {desktopOpen && <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-white lg:flex">{outline}</aside>}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Đóng" />
            <aside className="absolute inset-y-0 left-0 flex w-[85vw] max-w-[320px] flex-col bg-white shadow-xl">
              <div className="flex h-10 items-center justify-between border-b px-4">
                <span className="text-sm font-bold">Cấu trúc bài giảng</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)}>
                  <RiCloseLine />
                </Button>
              </div>
              {outline}
            </aside>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          {gazeSource === 'off' && total > 0 && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Không kết nối được phiên gaze (phiên hiệu chỉnh hết hạn hoặc wss thất bại). Bài học vẫn xem được, dữ liệu sẽ không ghi. <Link href={`/student/courses/${courseId}/prepare${activeLessonId ? `?lesson=${activeLessonId}` : ''}`} className="font-bold underline">Hiệu chỉnh lại</Link>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="relative overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                {/* Paper header */}
                <div className="border-b bg-white px-6 py-4">
                  <p className="text-xs font-bold tracking-wide text-[#0b5f7a]">PHẦN 4.2: TÁCH BIÊN & TỐI ƯU TÂM THỊ GIÁC</p>
                  <h1 className="mt-1 text-lg font-bold leading-snug">4.2 Thuật toán Starburst & Ellipse Fitting cho Tâm Đồng Tử (Pupil Center)</h1>
                  <p className="mt-1 text-xs text-muted-foreground">CS402.LEC.04 · Thị giác Máy tính trong Giáo dục · Slide {total ? currentSlide + 1 : '—'} / {total || '—'}</p>
                </div>
                {slideUrl ? (
                  <div className="relative bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={slideImgRef} src={slideUrl} alt={currentContent?.title ?? 'Slide'} onError={(e) => { const img = e.currentTarget as HTMLImageElement; if ((img as unknown as { dataset: { fallback?: string } }).dataset.fallback) return; (img as unknown as { dataset: { fallback: string } }).dataset.fallback = '1'; img.src = SLIDE_FALLBACK; }} className="block h-auto w-full object-contain" />
                    {gazeDot}
                    <div className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-0.5 text-[11px] font-mono text-[#0b5f7a] shadow">GAZE RAW: X: {gazePoint ? gazePoint.x.toFixed(3) : '—'} | Y: {gazePoint ? gazePoint.y.toFixed(3) : '—'} ●</div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    <p className="font-semibold">{currentContent?.title ?? 'Nội dung bài học'}</p>
                    <p className="mt-1">Nội dung PDF sẽ hiển thị tại đây. — (pass — chưa có slide)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-white px-4 py-3">
            <div className="mx-auto flex max-w-[900px] items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setCurrentSlide((v) => Math.max(0, v - 1))} disabled={currentSlide === 0}>
                <RiArrowLeftSLine /> Trang trước [←]
              </Button>
              <div className="flex flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-[#0f2d5e]" style={{ width: `${total ? ((currentSlide + 1) / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-[#0b5f7a]">Trang {total ? currentSlide + 1 : 0} / {total || '—'}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">Dwell: {formatDwell(dwellSec)}</span>
              </div>
              {currentSlide === total - 1 && total > 0 ? (
                progress?.completed ? (
                  nextLesson ? (
                    <Button size="sm" onClick={() => selectLesson(nextLesson.id)}>
                      Bài tiếp theo <RiArrowRightSLine />
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">Đã hoàn thành ✓</span>
                  )
                ) : (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleComplete}>
                    Hoàn thành
                  </Button>
                )
              ) : (
                <Button size="sm" className="bg-[#0f2d5e] hover:bg-[#143a78] text-white" onClick={() => setCurrentSlide((v) => Math.min(total - 1, v + 1))} disabled={currentSlide >= total - 1}>
                  Slide tiếp theo [→] <RiArrowRightSLine />
                </Button>
              )}
            </div>
          </footer>
        </main>
      </div>

      {showResume && progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-xl">
            <h3 className="font-semibold">Bạn có muốn học tiếp?</h3>
            <p className="mt-2 text-sm text-muted-foreground">Lần trước dừng ở trang {progress.lastSlide + 1}/{total}. Tiếp tục?</p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setCurrentSlide(0); patchLessonProgress(activeLessonId, 0).catch(() => {}); setShowResume(false); setResumeHandled(activeLessonId); }}>
                Bắt đầu lại
              </Button>
              <Button className="flex-1" onClick={() => { setCurrentSlide(progress.lastSlide); setShowResume(false); setResumeHandled(activeLessonId); }}>
                Học tiếp
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
