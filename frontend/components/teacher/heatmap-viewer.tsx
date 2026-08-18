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

export default function HeatmapViewer() {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const courseId = String(routeParams?.courseId ?? 'c1');

  const [lessonId, setLessonId] = useState(() => String(routeParams?.lessonId ?? 'l8'));
  const [scope, setScope] = useState<Scope>(searchParams.get('student') ?? 'class');
  const [pageIdx, setPageIdx] = useState(0);
  const [opacity, setOpacity] = useState(0.7);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

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
  const pageCount = stats.length || lesson.slides || 1;
  const activePageIdx = Math.min(pageCount - 1, Math.max(0, pageIdx));
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

    const ctx = canvas.getContext('2d');
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

    for (const hotspot of current.hotspots) {
      const cx = hotspot.x * width;
      const cy = hotspot.y * height;
      const radius = hotspot.r * Math.min(width, height);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${hotspot.w})`);
      gradient.addColorStop(0.5, `rgba(255,255,255,${hotspot.w * 0.35})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.03) {
        data[i + 3] = 0;
        continue;
      }

      const t = Math.min(1, alpha * 1.6);
      if (t < 0.33) {
        data[i] = 0;
        data[i + 1] = Math.round(120 + t * 3 * 135);
        data[i + 2] = Math.round(255 - t * 3 * 100);
      } else if (t < 0.66) {
        const u = (t - 0.33) * 3;
        data[i] = Math.round(u * 255);
        data[i + 1] = 255;
        data[i + 2] = Math.round(155 - u * 155);
      } else {
        const u = (t - 0.66) * 3;
        data[i] = 255;
        data[i + 1] = Math.round(255 - u * 200);
        data[i + 2] = 0;
      }
      data[i + 3] = Math.round(t * 255);
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
                  <MockDocument page={activePageIdx} pageCount={pageCount} lessonTitle={lesson.title} />
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
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

// Mock only — production should render actual PDF page/image.
function MockDocument({
  page,
  pageCount,
  lessonTitle,
}: {
  page: number;
  pageCount: number;
  lessonTitle: string;
}) {
  const variant = page % 3;

  return (
    <div className="flex h-full flex-col bg-white px-[8%] py-[9%] text-slate-900">
      <header className="border-b border-slate-200 pb-[4%]">
        <p className="text-[2.2%] font-medium uppercase tracking-wide text-slate-400">GazeEdu Learning Material</p>
        <h2 className="mt-[2%] text-[4.6%] font-semibold leading-tight text-slate-900">{lessonTitle}</h2>
      </header>

      <main className="min-h-0 flex-1 py-[6%]">
        {variant === 0 && <TextPage />}
        {variant === 1 && <FigurePage />}
        {variant === 2 && <TablePage />}
      </main>

      <footer className="flex items-center justify-between border-t border-slate-200 pt-[3%] text-[2.2%] text-slate-400">
        <span>Tài liệu học tập</span>
        <span>
          Trang {page + 1} / {pageCount}
        </span>
      </footer>
    </div>
  );
}

function TextPage() {
  return (
    <div className="space-y-[5%]">
      <div className="h-[2.4%] w-2/3 rounded-sm bg-slate-800" />
      <div className="space-y-[2.2%]">
        {[92, 86, 96, 74, 89].map((width) => (
          <div key={width} className="h-[1.6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="space-y-[2.2%] pt-[2%]">
        {[78, 94, 88, 66].map((width) => (
          <div key={width} className="h-[1.6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="mt-[8%] rounded-md border border-slate-200 p-[4%]">
        <div className="h-[1.8%] w-1/3 rounded-sm bg-slate-300" />
        <div className="mt-[5%] grid grid-cols-2 gap-[4%]">
          <div className="h-[18%] rounded-sm bg-slate-100" />
          <div className="space-y-[8%]">
            {[84, 72, 90].map((width) => (
              <div key={width} className="h-[6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FigurePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[2.4%] w-3/5 rounded-sm bg-slate-800" />
      <div className="mt-[5%] rounded-md border border-slate-200 p-[5%]">
        <div className="grid h-[36%] grid-cols-3 items-end gap-[5%] border-b border-l border-slate-200 px-[4%] pb-[4%]">
          {[58, 86, 42].map((height) => (
            <div key={height} className="rounded-t-sm bg-cyan-100" style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="mt-[5%] space-y-[2.5%]">
          {[88, 72, 95].map((width) => (
            <div key={width} className="h-[1.6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-[6%] space-y-[2.2%]">
        {[96, 82, 90, 68, 76].map((width) => (
          <div key={width} className="h-[1.6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}

function TablePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[2.4%] w-1/2 rounded-sm bg-slate-800" />
      <div className="mt-[5%] overflow-hidden rounded-md border border-slate-200">
        <div className="grid grid-cols-3 bg-slate-100">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-8 border-r border-slate-200 last:border-r-0" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="grid grid-cols-3 border-t border-slate-200">
            {[78, 64, 86].map((width, idx) => (
              <div key={`${row}-${idx}`} className="border-r border-slate-200 p-[5%] last:border-r-0">
                <div className="h-2 rounded-sm bg-slate-200" style={{ width: `${Math.max(28, width - row * 5)}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-[6%] space-y-[2.2%]">
        {[92, 88, 74, 96].map((width) => (
          <div key={width} className="h-[1.6%] rounded-sm bg-slate-200" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}
