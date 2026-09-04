'use client';

// components/teacher/heatmap-viewer.tsx — Document heatmap viewer.
// Data: useHeatmap → lib/api/teacher.ts (mock hiện tại, sẽ là GET /teacher/lessons/{id}/heatmap?student_id=&content_id=)
// Dữ liệu: gaze_events.gaze_x/gaze_y chuẩn hóa [0,1] theo trang tài liệu → vẽ trực tiếp trên PDF page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useCourseStudents, useCourseTree, useHeatmap } from '@/hooks/use-teacher';
import { useLessonSlides } from '@/hooks/use-student';
import { resolveMediaUrl } from '@/lib/api/client';
import { buildHeatLegendGradient } from '@/lib/heatmap-colors';
import { drawKdeHeatmap, HEATMAP_DEFAULT_OPACITY } from '@/components/heatmap/heatmap-canvas';
import { cn } from '@/lib/utils';

type Scope = 'class' | string;

const SELECT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/25';

// Heatmap vẽ theo tọa độ VIEWPORT (0,0 = góc trên-trái viewport, toàn màn hình),
// nên canvas đại diện cả viewport 16:9; slide là ảnh con căn giữa bên trong.
// Nhờ vậy những điểm nhìn ngoài slide vẫn được vẽ lên vùng trống quanh slide.
const VIEWPORT_ASPECT_RATIO = '16 / 9';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

// Bản nhiệt KDE dùng chung với luồng dùng thử (/try): density SCALE=6 +
// colorize gain 255/maxAlpha, point nhỏ, độ đậm mặc định thấp để vẫn đọc
// được nội dung slide bên dưới.
const SCATTER_RADIUS = 2; // bán kính chấm "Điểm nhìn" (CSS px)

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
  const pageCount = stats.length || slides.length || lesson.slides || 1;
  const activePageIdx = Math.min(pageCount - 1, Math.max(0, pageIdx));
  const slideImageRaw = slides[activePageIdx]?.imageUrl ?? null;
  // Ảnh media dạng đường dẫn tương đối (/media/…) đi qua Next.js rewrite,
  // dùng nguyên dạng để đúng phần /media mount của backend.
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

    // Bản nhiệt KDE dùng chung với luồng dùng thử; độ đậm điều chỉnh
    // bằng thanh trượt (style opacity trên canvas).
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

    // Chế độ "Điểm nhìn": vẽ scatter gaze thô lên trên bản nhiệt.
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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3 lg:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phạm vi dữ liệu</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 lg:px-5">
        <section>
          <label htmlFor="heatmap-lesson" className="text-xs font-medium text-muted-foreground">
            Bài học
          </label>
          <select
            id="heatmap-lesson"
            value={lessonId}
            onChange={(event) => switchLesson(event.target.value)}
            className={`${SELECT_CLS} mt-2`}
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

        <section>
          <p className="text-xs font-medium text-muted-foreground">Trang</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(-1)}
              disabled={activePageIdx === 0}
              aria-label="Trang trước"
              title="Trang trước"
            >
              <Icon name="ri-arrow-left-s-line" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm font-medium tabular-nums text-foreground">
              Trang {activePageIdx + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(1)}
              disabled={activePageIdx === pageCount - 1}
              aria-label="Trang sau"
              title="Trang sau"
            >
              <Icon name="ri-arrow-right-s-line" />
            </Button>
          </div>
        </section>

        <section>
          <label htmlFor="heatmap-scope" className="text-xs font-medium text-muted-foreground">
            Đối tượng
          </label>
          <select
            id="heatmap-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className={`${SELECT_CLS} mt-2`}
          >
            <option value="class">Toàn lớp ({students.length} học viên)</option>
            {students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.attention === null ? ' (không ghi nhận)' : ''}
              </option>
            ))}
          </select>
        </section>

        <section>
          <p className="text-xs font-medium text-muted-foreground">Hiển thị</p>
          <div className="mt-2 space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm text-foreground">
              <span>Bản nhiệt</span>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(event) => setShowHeatmap(event.target.checked)}
                className="h-4 w-4 accent-brand-cyan"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-foreground">
              <span>Điểm nhìn</span>
              <input
                type="checkbox"
                checked={showScatter}
                onChange={(event) => setShowScatter(event.target.checked)}
                className="h-4 w-4 accent-brand-cyan"
              />
            </label>
          </div>

          <label className="mt-4 block text-xs font-medium text-muted-foreground">
            Độ đậm nhạt của heatmap
            <span className="ml-1 font-semibold tabular-nums text-foreground">{Math.round(opacity * 100)}%</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              disabled={!showHeatmap && !showScatter}
              className="mt-2 w-full accent-brand-cyan disabled:opacity-40"
            />
          </label>
        </section>

        <section>
          <p className="text-xs font-medium text-muted-foreground">Dữ liệu</p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Mẫu gaze</dt>
              <dd className="font-medium tabular-nums text-foreground">{Math.max(0, current.fixations * 4)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Số học viên</dt>
              <dd className="font-medium tabular-nums text-foreground">{scope === 'class' ? students.length : 1}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Thời gian quan sát</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatDuration(current.viewSec)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tỷ lệ gaze trên trang</dt>
              <dd className="font-medium tabular-nums text-foreground">{current.onSlide}%</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Vùng tập trung</dt>
              <dd className="font-medium tabular-nums text-foreground">{(current.hotspots ?? []).length}</dd>
            </div>
          </dl>
        </section>

        {lowestOnPage && (
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal rounded-lg py-3 text-left"
            onClick={() => setPageIdx(lowestOnPage.idx)}
          >
            <Icon name="ri-information-line" data-icon="inline-start" />
            <span className="text-xs leading-5">
              Trang có tỷ lệ gaze trên nội dung thấp nhất: trang {lowestOnPage.idx + 1} ({lowestOnPage.onSlide}%)
            </span>
          </Button>
        )}

        {showHeatmap && (
          <section className="pt-1">
            <p className="text-xs font-medium text-muted-foreground">Mức tập trung</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={legendGradient}
              alt="Thang màu mức tập trung"
              className="mt-2 h-2 w-full rounded-full object-cover"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Thấp</span>
              <span>Cao</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            aria-label="Quay lại nội dung khóa học"
            title="Quay lại"
          >
            <Icon name="ri-arrow-left-line" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="shrink-0 text-sm font-semibold text-foreground">Phân tích điểm nhìn</h1>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <p className="hidden truncate text-sm text-muted-foreground sm:block">{lesson.title}</p>
            </div>
            <p className="truncate text-xs text-muted-foreground sm:hidden">{lesson.title}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsFullscreen((value) => !value)}
        >
          <Icon name="ri-layout-left-line" data-icon="inline-start" />
          {isFullscreen ? 'Hiện bộ lọc' : 'Toàn màn hình'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!isFullscreen && (
          <aside className="max-h-[38dvh] min-h-0 shrink-0 overflow-hidden border-b border-border bg-card lg:max-h-none lg:w-[276px] lg:border-b-0 lg:border-r">
            {Controls}
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{lesson.title}</p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{moduleTitle}</p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
              Trang {activePageIdx + 1}/{pageCount}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-6">
            {noConsent ? (
              <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon name="ri-eye-off-line" className="text-xl" />
                </div>
                <h2 className="mt-4 text-sm font-semibold text-foreground">Không có dữ liệu điểm nhìn</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {student?.name} không bật ghi nhận điểm nhìn trong các phiên học tương ứng. Bạn vẫn có thể xem tiến độ học tập của học viên.
                </p>
                <Link href={studentProgressHref} className={cn(buttonVariants(), 'mt-5')}>
                  Xem tiến độ học viên
                </Link>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <div
                  ref={stageRef}
                  className="relative h-full w-auto max-h-full max-w-full overflow-hidden rounded-lg border border-border bg-muted shadow-sm"
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-[8%] text-center">
                      <Icon name="ri-image-line" data-icon="inline-start" className="mb-2 text-3xl text-muted-foreground" />
                      <p className="text-sm font-semibold leading-6 text-foreground">{lesson.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Trang {activePageIdx + 1}</p>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full mix-blend-normal"
                    style={{ opacity }}
                  />
                </div>
              </div>
            )}
          </div>

          {!noConsent && (
            <div className="flex h-14 shrink-0 items-center justify-center gap-4 border-t border-border bg-card px-4">
              <Button type="button" variant="outline" size="sm" onClick={() => go(-1)} disabled={activePageIdx === 0}>
                <Icon name="ri-arrow-left-line" data-icon="inline-start" />
                Trang trước
              </Button>
              <span className="min-w-24 text-center text-sm font-medium tabular-nums text-muted-foreground">
                Trang {activePageIdx + 1} / {pageCount}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => go(1)} disabled={activePageIdx === pageCount - 1}>
                Trang sau
                <Icon name="ri-arrow-right-line" data-icon="inline-end" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
