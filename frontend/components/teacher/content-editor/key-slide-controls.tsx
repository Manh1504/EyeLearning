"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { useLessonSlidesAdmin } from "@/hooks/use-teacher";
import { deleteSlide, rebuildLessonAois, setSlideKey } from "@/lib/api/teacher";
import { cn } from "@/lib/utils";

export function KeySlideControls({
  lessonId,
  courseId,
  canDelete,
}: {
  lessonId: string;
  courseId: string;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: slides = [], isLoading, isError } = useLessonSlidesAdmin(lessonId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [slideToDelete, setSlideToDelete] = useState<{ id: string; orderIndex: number } | null>(null);
  const [toggleError, setToggleError] = useState("");
  const [aoiMessage, setAoiMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const sourceLabel = (source: string) =>
    source === "pdf" ? "PDF gốc" : source === "grid" ? "Lưới dự phòng" : "Chưa xác định";

  const rebuildAois = async () => {
    setRebuilding(true);
    setAoiMessage(null);
    try {
      const result = await rebuildLessonAois(lessonId);
      if (result.slides === 0) {
        setAoiMessage({ tone: "err", text: "Bài học chưa có slide để tạo AOI." });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teacher", "lesson-slides", lessonId] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "heatmap", lessonId] }),
      ]);
      setAoiMessage({ tone: "ok", text: `Đã tạo lại và lưu AOI cho ${result.slides} trang.` });
    } catch (error) {
      setAoiMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "Không tạo lại được AOI.",
      });
    } finally {
      setRebuilding(false);
    }
  };

  const toggle = async (slideId: string, isKey: boolean) => {
    setPendingId(slideId);
    setToggleError("");
    try {
      await setSlideKey(slideId, !isKey);
      await queryClient.invalidateQueries({ queryKey: ["teacher", "lesson-slides", lessonId] });
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : "Không cập nhật được slide trọng tâm.");
    } finally {
      setPendingId(null);
    }
  };

  const removeSlide = async () => {
    if (!slideToDelete) return;
    const slide = slideToDelete;
    setPendingId(slide.id);
    setToggleError("");
    try {
      await deleteSlide(slide.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teacher", "lesson-slides", lessonId] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "course-tree"] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] }),
      ]);
      setSlideToDelete(null);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : "Không xóa được slide.");
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <p className="mt-3 text-sm text-muted-foreground">Đang tải danh sách slide…</p>;
  if (isError)
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        Không tải được thiết lập slide trọng tâm.
      </p>
    );
  if (slides.length === 0) return null;

  return (
    <>
      <section className="mt-8 border-t border-black/10 pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h5 className="text-sm font-semibold text-black">Vùng nội dung (AOI)</h5>
            <p className="mt-1 text-sm leading-6 text-black/45">
              Kiểm tra vùng đo trên từng trang. AOI được tạo và lưu từ PDF nguồn.
            </p>
          </div>
          <Button variant="outline" className="rounded-full border-black/10" onClick={() => void rebuildAois()} disabled={rebuilding}>
            <Icon name="ri-loader-4-line" className={cn("size-4", !rebuilding && "hidden")} />
            {rebuilding ? "Đang tạo AOI…" : "Tạo lại & lưu AOI"}
          </Button>
        </div>

        {aoiMessage && (
          <Alert
            variant={aoiMessage.tone === "ok" ? "success" : "destructive"}
            className="mt-4"
            title={aoiMessage.text}
          />
        )}

        <div className="mt-5">
          <ul className="grid gap-2 md:grid-cols-2">
            {slides.map((slide) => {
              const aoiReady = slide.aoiCount > 0 && slide.aoiSource !== "none";
              return (
                <li
                  key={slide.id}
                  className="grid gap-4 rounded-[18px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={slide.isKey}
                      disabled={pendingId === slide.id}
                      onChange={() => void toggle(slide.id, slide.isKey)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-black">
                        Trang {slide.orderIndex}
                      </span>
                        <span className="mt-1 block text-xs text-black/40">
                        {slide.isKey ? "Slide trọng tâm" : "Slide thường"} · {slide.aoiCount} AOI
                      </span>
                    </span>
                  </label>
                  <div className="hidden text-xs text-black/45 sm:block">{sourceLabel(slide.aoiSource)}</div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 text-xs font-medium text-black/50",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", aoiReady ? "bg-[#6f8f69]" : "bg-[#dfe9dc]")} />
                    {aoiReady ? "Sẵn sàng" : "Cần tạo lại"}
                  </span>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Button asChild variant="outline" size="sm" className="rounded-full border-black/10 bg-white">
                      <Link
                        href={`/teacher/courses/${courseId}/lessons/${lessonId}/heatmap?from=content&view=aoi&page=${slide.orderIndex}`}
                      >
                        <Icon name="ri-focus-2-line" className="size-4" />
                        Xem AOI
                      </Link>
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pendingId === slide.id}
                        onClick={() => setSlideToDelete({ id: slide.id, orderIndex: slide.orderIndex })}
                        aria-label={`Xóa slide trang ${slide.orderIndex}`}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Icon name="ri-delete-bin-line" className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {toggleError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {toggleError}
          </p>
        )}
      </section>
      <ConfirmDialog
        open={slideToDelete !== null}
        onOpenChange={(open) => !open && setSlideToDelete(null)}
        title={slideToDelete ? `Xóa slide trang ${slideToDelete.orderIndex}?` : "Xóa slide?"}
        description="Slide sẽ bị xóa khỏi bài học. Thao tác có thể thất bại nếu slide đã có dữ liệu theo dõi."
        confirmLabel="Xóa slide"
        destructive
        onConfirm={removeSlide}
      />
    </>
  );
}
