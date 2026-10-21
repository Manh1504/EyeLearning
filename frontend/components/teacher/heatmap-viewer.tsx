"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCourseStudents, useCourseTree, useHeatmap } from "@/hooks/use-teacher";
import { useLessonSlides } from "@/hooks/use-student";
import { resolveMediaUrl } from "@/lib/api/client";
import { buildHeatLegendGradient } from "@/lib/heatmap-colors";
import { ENROLL_LABEL } from "@/lib/constants";
import { drawKdeHeatmap, HEATMAP_DEFAULT_OPACITY } from "@/components/heatmap/heatmap-canvas";
import { cn } from "@/lib/utils";

type Scope = "class" | string;

const SELECT_CLS =
  "h-9 w-full rounded-full border border-[#e8e8e3] bg-[#fdfdfa] px-3 text-xs font-medium text-foreground outline-none transition focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/15";

const DEFAULT_SLIDE_ASPECT_RATIO = 16 / 9;

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${secs}s`;
}

const SCATTER_RADIUS = 2;

export function HeatmapViewer({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope: Scope = searchParams.get("student") ?? "class";
  const isAoiInspection = searchParams.get("view") === "aoi";
  const requestedPage = Number(searchParams.get("page"));

  const [pageIdx, setPageIdx] = useState(
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0,
  );
  const [opacity, setOpacity] = useState(HEATMAP_DEFAULT_OPACITY);
  const [showHeatmap, setShowHeatmap] = useState(!isAoiInspection);
  const [showScatter, setShowScatter] = useState(false);
  const [showAois, setShowAois] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [slideAspectRatio, setSlideAspectRatio] = useState(DEFAULT_SLIDE_ASPECT_RATIO);
  const [imgFailed, setImgFailed] = useState(false);

  const { data: modules = [] } = useCourseTree(courseId);
  const { data: students = [] } = useCourseStudents(courseId);

  const lessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const lesson =
    lessons.find((l) => l.id === lessonId) ??
    lessons[0] ?? { id: "", title: "", slides: 1, attention: null };
  const moduleTitle = modules.find((m) => m.lessons.some((l) => l.id === lesson.id))?.title ?? "";

  const student = scope === "class" ? null : students.find((s) => s.id === scope) ?? null;
  const noConsent = student !== null && student.attention === null;

  const { data: stats = [], isLoading: statsLoading, isError: statsError, refetch } = useHeatmap(
    lesson.id,
    lesson.slides,
    scope === "class" ? "class" : scope,
  );
  const { data: slides = [] } = useLessonSlides(lesson.id);
  const pageCount = stats.length || slides.length || lesson.slides || 1;
  const activePageIdx = Math.min(pageCount - 1, Math.max(0, pageIdx));
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
        aois: [],
      },
    [activePageIdx, stats],
  );
  const lowestOnPage = useMemo(() => [...stats].sort((a, b) => a.onSlide - b.onSlide)[0], [stats]);
  const legendGradient = useMemo(() => buildHeatLegendGradient(260, 8), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const fittedStageSize = useMemo(() => {
    if (viewerSize.width <= 0 || viewerSize.height <= 0) return null;
    const width = Math.min(viewerSize.width, viewerSize.height * slideAspectRatio);
    return { width, height: width / slideAspectRatio };
  }, [slideAspectRatio, viewerSize]);

  const requestedReturnTab = searchParams.get("from");
  const returnTab =
    requestedReturnTab === "students" || requestedReturnTab === "content"
      ? requestedReturnTab
      : searchParams.has("student")
        ? "students"
        : "content";
  const backHref = `/teacher/courses/${courseId}?tab=${returnTab}`;
  const studentsHref = `/teacher/courses/${courseId}?tab=students`;

  const heatmapHref = useCallback(
    (nextLessonId: string, nextScope: Scope) => {
      const query = new URLSearchParams(searchParams.toString());
      if (nextScope === "class") query.delete("student");
      else query.set("student", nextScope);
      const suffix = query.toString();
      return `/teacher/courses/${courseId}/lessons/${nextLessonId}/heatmap${suffix ? `?${suffix}` : ""}`;
    },
    [courseId, searchParams],
  );

  const switchLesson = (id: string) => {
    setPageIdx(0);
    setImgFailed(false);
    setSlideAspectRatio(DEFAULT_SLIDE_ASPECT_RATIO);
    router.replace(heatmapHref(id, scope), { scroll: false });
  };

  const switchScope = (nextScope: Scope) => {
    router.replace(heatmapHref(lessonId, nextScope), { scroll: false });
  };

  const go = useCallback(
    (delta: number) => {
      setPageIdx((idx) => Math.min(pageCount - 1, Math.max(0, idx + delta)));
    },
    [pageCount],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, button")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const updateSize = () => setViewerSize({ width: viewer.clientWidth, height: viewer.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
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
      const points = (current.points ?? []).filter(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
      drawKdeHeatmap(canvas, width, height, points);
    } else {
      const ctx = canvas.getContext("2d");
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
      const ctx = canvas.getContext("2d");
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
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Bộ điều khiển</p>
        <span className="size-1.5 rounded-full bg-success" title="Dữ liệu sẵn sàng" />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
          <label htmlFor="heatmap-lesson" className="text-[11px] font-semibold text-muted-foreground">
            Bài học
          </label>
          <select
            id="heatmap-lesson"
            value={lessonId}
            onChange={(e) => switchLesson(e.target.value)}
            className={cn(SELECT_CLS, "mt-2")}
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

        {student && (
          <section className="rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] p-3.5 text-foreground shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{student.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{student.code}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold">
                {ENROLL_LABEL[student.status]}
              </span>
            </div>
            <div className="mt-4">
              <div className="rounded-xl bg-white p-2.5">
                <p className="text-[9px] text-muted-foreground">Mức quan sát</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {student.attention === null ? "—" : `${student.attention}%`}
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-foreground/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold">Bài học</p>
                <span className="text-[9px] text-muted-foreground">Chọn để đổi heatmap</span>
              </div>
              {student.lessons.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {student.lessons.map((item) => {
                    const itemTitle = lessons.find((entry) => entry.id === item.lessonId)?.title ?? item.lessonId;
                    const active = item.lessonId === lesson.id;
                    return (
                      <button
                        key={item.lessonId}
                        type="button"
                        onClick={() => switchLesson(item.lessonId)}
                        className={cn(
                          "w-full rounded-xl p-2.5 text-left transition",
                          active ? "bg-white text-foreground shadow-xs" : "bg-white/60 hover:bg-white",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] font-semibold">{itemTitle}</span>
                          <span className="text-[9px] text-muted-foreground">
                            Quan sát {item.attention === null ? "—" : `${item.attention}%`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-muted-foreground">Học viên chưa có dữ liệu bài học.</p>
              )}
            </div>
          </section>
        )}

        <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-muted-foreground">Trang phân tích</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => go(-1)} disabled={activePageIdx === 0} aria-label="Trang trước">
              <Icon name="ri-arrow-left-s-line" className="size-4" />
            </Button>
            <span className="min-w-0 flex-1 text-center font-mono text-xs font-semibold tabular-nums text-foreground">
              {String(activePageIdx + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => go(1)}
              disabled={activePageIdx === pageCount - 1}
              aria-label="Trang sau"
            >
              <Icon name="ri-arrow-right-s-line" className="size-4" />
            </Button>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
          <label htmlFor="heatmap-scope" className="text-[11px] font-semibold text-muted-foreground">
            Đối tượng
          </label>
          <select id="heatmap-scope" value={scope} onChange={(e) => switchScope(e.target.value)} className={cn(SELECT_CLS, "mt-2")}>
            <option value="class">Toàn lớp ({students.length} học viên)</option>
            {students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.attention === null ? " (không ghi nhận)" : ""}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-muted-foreground">Lớp dữ liệu</p>
          <div className="mt-2 space-y-2">
            <ToggleRow label="Bản nhiệt" checked={showHeatmap} onChange={setShowHeatmap} />
            <ToggleRow label="Điểm nhìn" checked={showScatter} onChange={setShowScatter} />
            <ToggleRow label="Vùng nội dung" checked={showAois} onChange={setShowAois} />
          </div>
          <label className="mt-4 block border-t border-border/70 pt-3 text-[11px] font-medium text-muted-foreground">
            Độ đậm nhạt của heatmap
            <span className="ml-1 font-semibold tabular-nums text-foreground">{Math.round(opacity * 100)}%</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              disabled={!showHeatmap && !showScatter}
              className="mt-2 h-1.5 w-full cursor-pointer accent-primary disabled:opacity-40"
            />
          </label>
        </section>

        <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Chỉ số trang</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <DataRow label="Mẫu gaze" value={String(Math.max(0, current.fixations * 4))} />
            <DataRow label="Số học viên" value={String(scope === "class" ? students.length : 1)} />
            <DataRow label="Thời gian quan sát" value={formatDuration(current.viewSec)} />
            <DataRow label="Tỷ lệ gaze trên trang" value={`${current.onSlide}%`} />
            <DataRow label="Vùng tập trung" value={String((current.hotspots ?? []).length)} />
            <DataRow label="Vùng nội dung" value={String((current.aois ?? []).length)} />
          </dl>
        </section>

        {isAoiInspection && (
          <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">AOI trang này</p>
              <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                {(current.aois ?? []).length}
              </span>
            </div>
            {(current.aois ?? []).length > 0 ? (
              <ol className="mt-2 space-y-2">
                {current.aois.map((region, index) => (
                  <li key={region.id} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{region.name || `Vùng ${index + 1}`}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs leading-5 text-destructive">
                Trang này chưa có AOI. Quay lại nội dung bài học để tạo lại.
              </p>
            )}
          </section>
        )}

        {lowestOnPage && (
          <Button
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal rounded-2xl px-3.5 py-3 text-left"
            onClick={() => setPageIdx(lowestOnPage.idx)}
          >
            <Icon name="ri-information-line" className="size-4 shrink-0" />
            <span className="text-xs leading-5">
              Trang có tỷ lệ gaze thấp nhất: trang {lowestOnPage.idx + 1} ({lowestOnPage.onSlide}%)
            </span>
          </Button>
        )}

        {showHeatmap && (
          <section className="rounded-[18px] border border-[#eeeee9] bg-white p-3.5 shadow-xs">
            <p className="text-xs font-medium text-muted-foreground">Mức tập trung</p>
            {/* Generated from the same palette as the canvas; the server cannot create this data URI. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={legendGradient || undefined}
              alt="Thang màu mức tập trung"
              className="mt-2 h-2 w-full rounded-full object-cover"
              suppressHydrationWarning
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
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f5f6f2] text-foreground">
      <header className="m-2 mb-0 flex h-16 shrink-0 items-center justify-between gap-3 rounded-[18px] border border-[#eeeee9] bg-white px-3 shadow-xs sm:mx-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Quay lại khóa học">
            <Link href={backHref}>
              <Icon name="ri-arrow-left-line" className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="shrink-0 text-sm font-bold tracking-[-0.01em] text-foreground">
                {isAoiInspection ? "Kiểm tra vùng nội dung" : "Phân tích điểm nhìn"}
              </h1>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <p className="hidden truncate text-sm text-muted-foreground sm:block">{lesson.title}</p>
            </div>
            <p className="truncate text-xs text-muted-foreground sm:hidden">{lesson.title}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-border/70" onClick={() => setIsFullscreen((v) => !v)}>
          <Icon name="ri-layout-left-line" className="size-4" />
          {isFullscreen ? "Hiện bộ lọc" : "Toàn màn hình"}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!isFullscreen && (
          <aside className="m-2 max-h-[42dvh] min-h-0 shrink-0 overflow-hidden rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] shadow-xs sm:mx-3 lg:mr-0 lg:max-h-none lg:w-[292px]">
            {Controls}
          </aside>
        )}

        <main className="m-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] shadow-xs sm:mx-3 lg:ml-2">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#eeeee9] bg-white px-4 lg:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{lesson.title}</p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{moduleTitle}</p>
            </div>
            <p className="shrink-0 rounded-full bg-muted px-3 py-1 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
              PAGE {String(activePageIdx + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#fdfdfa] p-3 sm:p-5 lg:p-7">
            {statsLoading && !statsError ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Icon name="ri-loader-4-line" className="size-7 animate-spin text-primary" />
                <p className="text-sm">Đang tải dữ liệu phân tích...</p>
              </div>
            ) : statsError ? (
              <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-destructive/25 bg-destructive/5 p-8 text-center">
                <Icon name="ri-error-warning-line" className="size-8 text-destructive" />
                <h2 className="mt-4 text-sm font-semibold text-foreground">Không tải được dữ liệu heatmap</h2>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                  Thử lại
                </Button>
              </div>
            ) : noConsent ? (
              <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-surface p-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                  <Icon name="ri-eye-off-line" className="size-6" />
                </div>
                <h2 className="mt-4 text-sm font-semibold text-foreground">Không có dữ liệu điểm nhìn</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {student?.name} không bật ghi nhận điểm nhìn trong các phiên học tương ứng.
                </p>
                <Button asChild className="mt-5">
                  <Link href={studentsHref}>Xem danh sách học viên</Link>
                </Button>
              </div>
            ) : (
              <div ref={viewerRef} className="flex h-full w-full items-center justify-center">
                <div
                  ref={stageRef}
                  className="relative max-h-full max-w-full overflow-hidden rounded-[18px] border border-black/20 bg-[#181a17] shadow-xl shadow-black/10"
                  style={fittedStageSize ?? { width: "100%", aspectRatio: DEFAULT_SLIDE_ASPECT_RATIO }}
                >
                  {slideImageUrl && !imgFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={slideImageUrl}
                      src={slideImageUrl}
                      alt={slides[activePageIdx]?.title ?? `Trang ${activePageIdx + 1}`}
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                          setSlideAspectRatio(image.naturalWidth / image.naturalHeight);
                        }
                        setImgFailed(false);
                      }}
                      onError={() => setImgFailed(true)}
                      className="absolute inset-0 h-full w-full object-fill"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-[8%] text-center">
                      <Icon name="ri-image-line" className="mb-2 size-7 text-muted-foreground" />
                      <p className="text-sm font-semibold leading-6 text-foreground">{lesson.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Trang {activePageIdx + 1}</p>
                    </div>
                  )}

                  {showAois && (current.aois ?? []).length > 0 && (
                    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
                      {current.aois.map((region, index) => (
                        <div
                          key={region.id}
                          title={region.name}
                          className="absolute border-2 border-primary bg-primary/10"
                          style={{
                            left: `${region.xMin * 100}%`,
                            top: `${region.yMin * 100}%`,
                            width: `${(region.xMax - region.xMin) * 100}%`,
                            height: `${(region.yMax - region.yMin) * 100}%`,
                          }}
                        >
                          {isAoiInspection ? (
                            <span className="absolute left-0 top-0 flex size-6 items-center justify-center rounded-br-md bg-primary font-mono text-xs font-semibold text-primary-foreground">
                              {index + 1}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                    style={{ opacity }}
                  />
                </div>
              </div>
            )}
          </div>

          {!noConsent && !statsLoading && (
            <div className="flex h-16 shrink-0 items-center justify-center gap-3 border-t border-[#eeeee9] bg-white px-4">
              <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={activePageIdx === 0}>
                <Icon name="ri-arrow-left-line" className="size-4" />
                Trang trước
              </Button>
              <span className="min-w-24 text-center text-sm font-medium tabular-nums text-muted-foreground">
                Trang {activePageIdx + 1} / {pageCount}
              </span>
              <Button variant="outline" size="sm" onClick={() => go(1)} disabled={activePageIdx === pageCount - 1}>
                Trang sau
                <Icon name="ri-arrow-right-line" className="size-4" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/70">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 rounded-full bg-muted transition peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-border/60 pt-2 first:border-0 first:pt-0 even:border-0 even:pt-0">
      <dt className="truncate text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
