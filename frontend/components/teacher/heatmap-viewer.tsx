'use client';

// components/teacher/heatmap-viewer.tsx — Document heatmap viewer.
// Data: useHeatmap → lib/api/teacher.ts

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  RiArrowLeftLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiEyeOffLine,
  RiImageLine,
  RiInformationLine,
  RiLayoutLeftLine,
  RiArrowRightLine,
} from '@remixicon/react';

import { Button, buttonVariants } from '@/components/ui/button';
import { useCourseStudents, useCourseTree, useHeatmap, useLessonMastery } from '@/hooks/use-teacher';
import { useLessonSlides } from '@/hooks/use-student';
import { resolveMediaUrl } from '@/lib/api/client';
import { buildHeatLegendGradient } from '@/lib/heatmap-colors';
import { drawKdeHeatmap, HEATMAP_DEFAULT_OPACITY } from '@/components/heatmap/heatmap-canvas';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type Scope = 'class' | string;

const SELECT_CLS =
  'h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const VIEWPORT_ASPECT_RATIO = '16 / 9';
const SCATTER_RADIUS = 2; 

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

export default function HeatmapViewer() {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const courseId = String(routeParams?.courseId ?? 'c1');

  const [lessonId, setLessonId] = useState(() => String(routeParams?.lessonId ?? 'l8'));
  const [scope, setScope] = useState<Scope>(searchParams.get('student') ?? 'class');
  const [pageIdx, setPageIdx] = useState(0);
  const [opacity, setOpacity] = useState(HEATMAP_DEFAULT_OPACITY);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showScatter, setShowScatter] = useState(false);
  const [showAoi, setShowAoi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [imgFailed, setImgFailed] = useState(false);

  const { data: modules = [] } = useCourseTree(courseId);
  const { data: students = [] } = useCourseStudents(courseId);

  const lessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const lesson =
    lessons.find((l) => l.id === lessonId) ??
    lessons[0] ?? { id: '', title: '', slides: 1, completion: 0, attention: null };
  const moduleTitle =
    modules.find((m) => m.lessons.some((l) => l.id === lesson.id))?.title ?? '';

  const student = scope === 'class' ? null : students.find((s) => s.id === scope) ?? null;
  const noConsent = student !== null && student.attention === null;

  const { data: stats = [] } = useHeatmap(lesson.id, lesson.slides, scope === 'class' ? 'class' : scope);
  const { data: slides = [] } = useLessonSlides(lesson.id);
  const { data: mastery } = useLessonMastery(lesson.id, scope === 'class' ? null : scope);
  const pageCount = stats.length || slides.length || lesson.slides || 1;
  const activePageIdx = Math.min(pageCount - 1, Math.max(0, pageIdx));
  const currentCoverage = mastery?.slides[activePageIdx] ?? null;
  const slideImageRaw = slides[activePageIdx]?.imageUrl ?? null;
  const slideImageUrl = useMemo(() => resolveMediaUrl(slideImageRaw), [slideImageRaw]);
  
  const current = useMemo(
    () =>
      stats[activePageIdx] ?? stats[0] ?? {
        idx: activePageIdx,
        onSlide: 0,
        fixations: 0,
        viewSec: 0,
        hotspots: [],
      },
    [activePageIdx, stats],
  );
  
  const lowestOnPage = useMemo(() => [...stats].sort((a, b) => a.onSlide - b.onSlide)[0], [stats]);
  const legendGradient = useMemo(() => buildHeatLegendGradient(260, 8), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const backHref = `/teacher/courses/${courseId}?tab=content`;
  const studentProgressHref = `/teacher/courses/${courseId}?tab=students`;

  const switchLesson = (id: string) => {
    setLessonId(id);
    setPageIdx(0);
  };

  const go = useCallback((delta: number) => {
    setPageIdx((idx) => Math.min(pageCount - 1, Math.max(0, idx + delta)));
  }, [pageCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button')) return;

      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = () => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;

    if (showHeatmap && !noConsent) {
      const points = (current.points ?? []).filter(
        ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
      );
      drawKdeHeatmap(canvas, width, height, points);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    }

    if (noConsent) return;

    if (showScatter) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.fillStyle = `rgba(30, 30, 60, ${0.5 + (1 - opacity) * 0.3})`;
      for (const [x, y] of current.points ?? []) {
        if (x < 0 || x > 1 || y < 0 || y > 1) continue;
        ctx.beginPath();
        ctx.arc(x * width, y * height, SCATTER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }, [current, noConsent, opacity, showHeatmap, showScatter, stageSize]);

  const Controls = (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-bold tracking-widest text-primary uppercase">Cấu hình hiển thị</p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="space-y-1.5">
          <label htmlFor="heatmap-lesson" className="text-sm font-semibold text-foreground">
            Bài học
          </label>
          <select
            id="heatmap-lesson"
            value={lessonId}
            onChange={(event) => switchLesson(event.target.value)}
            className={SELECT_CLS}
          >
            {modules.map((module) => (
              <optgroup key={module.id} label={module.title}>
                {module.lessons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </section>

        <section className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">Trang tài liệu</p>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-1.5 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => go(-1)}
              disabled={activePageIdx === 0}
              aria-label="Trang trước"
            >
              <RiArrowLeftSLine className="h-5 w-5" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums text-foreground">
              {activePageIdx + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => go(1)}
              disabled={activePageIdx === pageCount - 1}
              aria-label="Trang sau"
            >
              <RiArrowRightSLine className="h-5 w-5" />
            </Button>
          </div>
        </section>

        <section className="space-y-1.5">
          <label htmlFor="heatmap-scope" className="text-sm font-semibold text-foreground">
            Phân tích theo
          </label>
          <select
            id="heatmap-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className={SELECT_CLS}
          >
            <option value="class">Toàn bộ lớp ({students.length} học viên)</option>
            {students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.attention === null ? ' (ẩn danh/không ghi nhận)' : ''}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-3 pt-2">
          <p className="text-sm font-semibold text-foreground">Bộ lọc hiển thị</p>
          <div className="space-y-2.5">
            {[
              { label: 'Bản đồ nhiệt (Heatmap)', state: showHeatmap, set: setShowHeatmap },
              { label: 'Điểm nhìn thô (Scatter)', state: showScatter, set: setShowScatter },
              { label: 'Vùng nội dung (AOI)', state: showAoi, set: setShowAoi }
            ].map((opt) => (
              <label key={opt.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                <input
                  type="checkbox"
                  checked={opt.state}
                  onChange={(event) => opt.set(event.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Độ đậm bản nhiệt</span>
              <span className="text-foreground">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              disabled={!showHeatmap && !showScatter}
              className="mt-2 w-full accent-primary disabled:opacity-40"
            />
          </div>
        </section>

        <section className="pt-2">
          <p className="text-xs font-bold tracking-widest text-primary uppercase mb-3">Chỉ số trang hiện tại</p>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <dl className="space-y-2.5 text-sm">
                {[
                  { label: 'Số mẫu Gaze', value: current.fixations ? Math.max(0, current.fixations * 4) : '—' },
                  { label: 'Kích thước mẫu', value: scope === 'class' ? students.length : 1 },
                  { label: 'Tổng TG quan sát', value: current.viewSec ? formatDuration(current.viewSec) : '—' },
                  { label: 'Tỷ lệ chú ý', value: current.onSlide ? `${current.onSlide}%` : '—' },
                  { label: 'Vùng AOI', value: (current.hotspots ?? []).length || '—' },
                  ...(mastery ? [
                    { label: 'Điểm hoàn thành', value: `${mastery.score}%` },
                    { label: 'Trang trọng tâm', value: `${mastery.keyDone}/${mastery.keyTotal}` }
                  ] : []),
                  ...(currentCoverage ? [
                    { label: 'Độ bao phủ', value: `${Math.round(currentCoverage.coverage * 100)}%` }
                  ] : [])
                ].map((stat, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{stat.label}</dt>
                    <dd className="font-semibold tabular-nums text-foreground">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </section>

        {lowestOnPage && (
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal rounded-xl border-amber-200 bg-amber-50/50 p-3 text-left text-amber-900 hover:bg-amber-100/50 hover:text-amber-900"
            onClick={() => setPageIdx(lowestOnPage.idx)}
          >
            <RiInformationLine className="mr-2 h-5 w-5 shrink-0 text-amber-600" />
            <span className="text-sm">
              Trang có độ tập trung thấp nhất: <b>Trang {lowestOnPage.idx + 1}</b> ({lowestOnPage.onSlide}%)
            </span>
          </Button>
        )}

        {showHeatmap && (
          <section className="pt-2 pb-6">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Thang đo tập trung</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={legendGradient}
              alt="Thang màu mức tập trung"
              className="h-2.5 w-full rounded-full object-cover shadow-sm"
            />
            <div className="mt-1.5 flex justify-between text-xs font-medium text-muted-foreground">
              <span>Thấp (Lướt qua)</span>
              <span>Cao (Dừng lâu)</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground font-sans">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "rounded-full")}
            aria-label="Quay lại nội dung khóa học"
          >
            <RiArrowLeftLine className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="shrink-0 text-base font-bold text-foreground">Phân tích bản đồ nhiệt</h1>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <p className="hidden truncate text-sm font-medium text-muted-foreground sm:block">{lesson.title}</p>
            </div>
            <p className="truncate text-xs text-muted-foreground sm:hidden">{lesson.title}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => setIsFullscreen((value) => !value)}
        >
          <RiLayoutLeftLine className="mr-2 h-4 w-4" />
          {isFullscreen ? 'Mở thanh công cụ' : 'Chế độ toàn màn hình'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!isFullscreen && (
          <aside className="max-h-[40dvh] min-h-0 shrink-0 overflow-hidden border-b border-border lg:max-h-none lg:w-[320px] xl:w-[360px] lg:border-b-0 lg:border-r bg-card z-10 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
            {Controls}
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40 relative">
          
          <div className="absolute top-0 left-0 right-0 z-10 flex h-14 items-center justify-between gap-4 bg-gradient-to-b from-black/50 to-transparent px-4 sm:px-6 pointer-events-none">
            <div className="min-w-0 pointer-events-auto">
              <p className="truncate text-base font-semibold text-white drop-shadow-md">{lesson.title}</p>
              <p className="hidden truncate text-sm text-white/80 drop-shadow-md sm:block">{moduleTitle}</p>
            </div>
            <p className="shrink-0 rounded-full bg-black/40 px-3 py-1 text-sm font-bold tabular-nums text-white backdrop-blur-md pointer-events-auto">
              {activePageIdx + 1} / {pageCount}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6 lg:p-8">
            {noConsent ? (
              <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <RiEyeOffLine className="h-8 w-8" />
                </div>
                <h2 className="mt-5 text-lg font-bold text-foreground">Không có dữ liệu điểm nhìn</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Học viên <span className="font-semibold text-foreground">{student?.name}</span> không cấp quyền ghi nhận điểm nhìn trong các phiên học. Bạn vẫn có thể xem tiến độ học tập thông thường.
                </p>
                <Link href={studentProgressHref} className={cn(buttonVariants(), 'mt-8 rounded-full')}>
                  Xem báo cáo học tập <RiArrowRightLine className="ml-2 h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center">
                <div
                  ref={stageRef}
                  className="relative h-full w-auto max-h-full max-w-full overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-border"
                  style={{
                    aspectRatio: VIEWPORT_ASPECT_RATIO,
                  }}
                >
                  {slideImageUrl && !imgFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={slideImageUrl}
                      src={slideImageUrl}
                      alt={slides[activePageIdx]?.title ?? `Trang ${activePageIdx + 1}`}
                      onLoad={() => setImgFailed(false)}
                      onError={() => setImgFailed(true)}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-card px-[8%] text-center">
                      <RiImageLine className="mb-4 h-12 w-12 text-muted-foreground/50" />
                      <p className="text-base font-semibold leading-6 text-foreground">{lesson.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Đang tải trang {activePageIdx + 1}...</p>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full mix-blend-normal transition-opacity duration-200"
                    style={{ opacity }}
                  />
                  {scope !== 'class' && showAoi && currentCoverage && (
                    <div className="pointer-events-none absolute inset-0 z-10">
                      {currentCoverage.aois.map((aoi) => (
                        <div
                          key={aoi.id}
                          className={cn(
                            "absolute rounded-md border-2 transition-colors",
                            aoi.covered
                              ? 'border-emerald-400 bg-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                              : 'border-slate-400/50 bg-slate-400/10'
                          )}
                          style={{
                            left: `${aoi.xMin * 100}%`,
                            top: `${aoi.yMin * 100}%`,
                            width: `${(aoi.xMax - aoi.xMin) * 100}%`,
                            height: `${(aoi.yMax - aoi.yMin) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!noConsent && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-md">
              <Button type="button" variant="ghost" className="rounded-full px-4" onClick={() => go(-1)} disabled={activePageIdx === 0}>
                <RiArrowLeftLine className="mr-2 h-4 w-4" /> Trang trước
              </Button>
              <div className="h-4 w-px bg-border" />
              <Button type="button" variant="ghost" className="rounded-full px-4" onClick={() => go(1)} disabled={activePageIdx === pageCount - 1}>
                Trang sau <RiArrowRightLine className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
