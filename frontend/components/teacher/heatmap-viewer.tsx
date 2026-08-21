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
import { API_BASE_URL } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Scope = 'class' | string;

const SELECT_CLS =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100';

const PAGE_ASPECT_RATIO = '210 / 297';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [30, 60, 200]],
  [0.25, [60, 180, 250]],
  [0.5, [80, 215, 120]],
  [0.75, [250, 210, 60]],
  [1.0, [235, 70, 50]],
];

function heatColor(t: number): [number, number, number] {
  if (t <= 0) return HEAT_STOPS[0][1];
  if (t >= 1) return HEAT_STOPS[HEAT_STOPS.length - 1][1];
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (t <= HEAT_STOPS[i][0]) {
      const [t0, c0] = HEAT_STOPS[i - 1];
      const [t1, c1] = HEAT_STOPS[i];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * u),
        Math.round(c0[1] + (c1[1] - c0[1]) * u),
        Math.round(c0[2] + (c1[2] - c0[2]) * u),
      ];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

export default function HeatmapViewer() {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const courseId = String(routeParams?.courseId ?? 'c1');

  const [lessonId, setLessonId] = useState(() => String(routeParams?.lessonId ?? 'l8'));
  const [scope, setScope] = useState<Scope>(searchParams.get('student') ?? 'class');
  const [pageIdx, setPageIdx] = useState(0);
  const [opacity, setOpacity] = useState(0.88);
  const [showHeatmap, setShowHeatmap] = useState(true);
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
  // Ảnh media dạng đường dẫn tương đối (/media/…) → trỏ thẳng backend,
  // tránh phụ thuộc proxy + vấn đề ảnh không hiện khi đổi route.
  const slideImageUrl = useMemo(() => {
    if (!slideImageRaw) return null;
    if (/^https?:\/\//.test(slideImageRaw)) return slideImageRaw;
    if (slideImageRaw.startsWith('/media/')) return `${API_BASE_URL}${slideImageRaw}`;
    return slideImageRaw;
  }, [slideImageRaw]);
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

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (noConsent || !showHeatmap) return;

    const points = current.points ?? [];
    const hotspots = current.hotspots ?? [];

    // Vẽ "mật độ" ở bản nhỏ, chồng gaussian mềm bằng composite 'lighter',
    // rồi phóng to + tô màu — tạo heatmap liên tục kiểu chuẩn.
    const SCALE = 6;
    const dw = Math.max(12, Math.round(width / SCALE));
    const dh = Math.max(12, Math.round(height / SCALE));
    const density = document.createElement('canvas');
    density.width = dw;
    density.height = dh;
    const dctx = density.getContext('2d');
    if (!dctx) return;
    dctx.globalCompositeOperation = 'lighter';

    const pointR = Math.max(6, dw * 0.11);
    for (const [x, y] of points) {
      const cx = x * dw;
      const cy = y * dh;
      const gradient = dctx.createRadialGradient(cx, cy, 0, cx, cy, pointR);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      dctx.fillStyle = gradient;
      dctx.beginPath();
      dctx.arc(cx, cy, pointR, 0, Math.PI * 2);
      dctx.fill();
    }

    for (const hotspot of hotspots) {
      const cx = hotspot.x * dw;
      const cy = hotspot.y * dh;
      const radius = Math.max(pointR * 3.0, hotspot.r * dw * 3.2);
      const gradient = dctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${Math.min(1, hotspot.w * 1.4 + 0.35)})`);
      gradient.addColorStop(0.4, `rgba(255,255,255,${Math.min(0.85, hotspot.w * 0.85)})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      dctx.fillStyle = gradient;
      dctx.beginPath();
      dctx.arc(cx, cy, radius, 0, Math.PI * 2);
      dctx.fill();
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(density, 0, 0, dw, dh, 0, 0, width, height);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;

    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    if (maxAlpha < 1) return;
    const gain = 255 / maxAlpha;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a < 0.02) {
        data[i + 3] = 0;
        continue;
      }

      // chuẩn hóa theo maxAlpha → vùng đậm nhất luôn lên tới đỏ (t≈1), vùng thưa vẫn thấy
      const t = Math.min(1, Math.pow(a * gain, 0.6));
      const [r, g, b] = heatColor(t);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(85 + t * 170);
    }

    ctx.putImageData(img, 0, 0);
  }, [current, noConsent, opacity, showHeatmap, stageSize]);

  const Controls = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3 lg:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phạm vi dữ liệu</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 lg:px-5">
        <section>
          <label htmlFor="heatmap-lesson" className="text-xs font-medium text-slate-500">
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
          <p className="text-xs font-medium text-slate-500">Trang</p>
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
            <span className="min-w-0 flex-1 text-center text-sm font-medium tabular-nums text-slate-700">
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
          <p className="text-xs font-medium text-slate-500">Đối tượng</p>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="heatmap-scope"
                checked={scope === 'class'}
                onChange={() => setScope('class')}
                className="h-4 w-4 accent-cyan-700"
              />
              Toàn lớp
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="heatmap-scope"
                checked={scope !== 'class'}
                onChange={() => setScope(students[0]?.id ?? 'class')}
                className="h-4 w-4 accent-cyan-700"
              />
              Một học viên
            </label>
          </div>

          {scope !== 'class' && (
            <div className="mt-3">
              <label htmlFor="heatmap-student" className="sr-only">
                Chọn học viên
              </label>
              <select
                id="heatmap-student"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className={SELECT_CLS}
              >
                {students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.attention === null ? ' (không ghi nhận)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section>
          <p className="text-xs font-medium text-slate-500">Hiển thị</p>
          <div className="mt-2 space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span>Heatmap</span>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(event) => setShowHeatmap(event.target.checked)}
                className="h-4 w-4 accent-cyan-700"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-400">
              <span>Điểm nhìn</span>
              <input type="checkbox" disabled className="h-4 w-4" />
            </label>
          </div>

          <label className="mt-4 block text-xs font-medium text-slate-500">
            Độ đậm
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              disabled={!showHeatmap}
              className="mt-2 w-full accent-cyan-700 disabled:opacity-40"
            />
          </label>
        </section>

        <section>
          <p className="text-xs font-medium text-slate-500">Dữ liệu</p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Mẫu gaze</dt>
              <dd className="font-medium tabular-nums text-slate-800">{Math.max(0, current.fixations * 4)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Số học viên</dt>
              <dd className="font-medium tabular-nums text-slate-800">{scope === 'class' ? students.length : 1}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Thời gian quan sát</dt>
              <dd className="font-medium tabular-nums text-slate-800">{formatDuration(current.viewSec)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Tỷ lệ gaze trên trang</dt>
              <dd className="font-medium tabular-nums text-slate-800">{current.onSlide}%</dd>
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
            <p className="text-xs font-medium text-slate-500">Mật độ quan sát</p>
            <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 via-yellow-300 to-red-500" />
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
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
              <h1 className="shrink-0 text-sm font-semibold text-slate-900">Phân tích điểm nhìn</h1>
              <span className="hidden text-slate-300 sm:inline">·</span>
              <p className="hidden truncate text-sm text-slate-500 sm:block">{lesson.title}</p>
            </div>
            <p className="truncate text-xs text-slate-400 sm:hidden">{lesson.title}</p>
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
              <p className="truncate text-sm font-medium text-slate-900">{lesson.title}</p>
              <p className="hidden truncate text-xs text-slate-400 sm:block">{moduleTitle}</p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums text-slate-600">
              Trang {activePageIdx + 1}/{pageCount}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-6">
            {noConsent ? (
              <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Icon name="ri-eye-off-line" className="text-xl" />
                </div>
                <h2 className="mt-4 text-sm font-semibold text-slate-900">Không có dữ liệu điểm nhìn</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
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
                  className="relative h-full w-auto max-h-full max-w-full overflow-hidden rounded-lg border border-border bg-white shadow-sm"
                  style={{
                    aspectRatio: PAGE_ASPECT_RATIO,
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
                      className="absolute inset-0 h-full w-full bg-white object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-[8%] text-center">
                      <Icon name="ri-image-line" data-icon="inline-start" className="mb-2 text-3xl text-slate-200" />
                      <p className="text-sm font-semibold leading-6 text-slate-800">{lesson.title}</p>
                      <p className="mt-1 text-xs text-slate-400">Trang {activePageIdx + 1}</p>
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
              <span className="min-w-24 text-center text-sm font-medium tabular-nums text-slate-600">
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
