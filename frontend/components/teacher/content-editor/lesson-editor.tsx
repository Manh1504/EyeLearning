"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLessonSlidesAdmin } from "@/hooks/use-teacher";
import { MAX_PDF_PAGES, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/api/client";
import { uploadLessonPdf } from "@/lib/api/teacher";
import { cn } from "@/lib/utils";
import type { LessonNode } from "@/lib/types/domain";
import { KeySlideControls } from "./key-slide-controls";
import { SlidePreview } from "./slide-preview";

/** Trạng thái tài liệu: idle → uploading → success | error (giữ file để thử lại). */
type UploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "success"; fileName: string; pages: number }
  | { status: "error"; fileName: string; message: string };

const LIMITS_HINT = `PDF · tối đa ${MAX_UPLOAD_LABEL} · tối đa ${MAX_PDF_PAGES} trang — mỗi trang thành 1 slide.`;

export function LessonEditor({
  lesson,
  courseId,
  canManage,
}: {
  lesson: LessonNode;
  courseId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    data: slides = [],
    isLoading: slidesLoading,
    isError: slidesError,
  } = useLessonSlidesAdmin(lesson.id);

  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploading = upload.status === "uploading";
  const slideCount = Math.max(lesson.slides, slides.length);
  const hasSlides = slideCount > 0;

  const validate = (file: File): string | null => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return `"${file.name}" không phải file PDF. Hãy chọn file .pdf.`;
    if (file.size > MAX_UPLOAD_BYTES)
      return `File PDF "${file.name}" vượt quá ${MAX_UPLOAD_LABEL} cho phép.`;
    return null;
  };

  const startUpload = async (file: File) => {
    setLastFile(file);
    setUpload({ status: "uploading", fileName: file.name });
    try {
      const result = await uploadLessonPdf(lesson.id, file, file.name);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teacher", "lesson-slides", lesson.id] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "course-tree", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] }),
      ]);
      setUpload({
        status: "success",
        fileName: file.name,
        pages: result.slides ?? 0,
      });
    } catch (error) {
      setUpload({
        status: "error",
        fileName: file.name,
        message: error instanceof Error ? error.message : "Không tải được PDF lên hệ thống.",
      });
    }
  };

  const chooseFile = (files: FileList | File[] | null) => {
    const file = files ? Array.from(files)[0] : null;
    if (!file) return;
    const problem = validate(file);
    if (problem) {
      setLastFile(file);
      setUpload({ status: "error", fileName: file.name, message: problem });
      return;
    }
    // Bài đã có slide: thay PDF sẽ xoá toàn bộ slide cũ → xác nhận trước.
    if (hasSlides) {
      setPendingReplace(file);
      return;
    }
    setLastFile(file);
    setUpload({ status: "idle" });
    void startUpload(file);
  };

  const openFileDialog = () => fileRef.current?.click();

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-label={`Chọn PDF cho ${lesson.title}`}
        onChange={(event) => {
          if (event.target.files) chooseFile(event.target.files);
          event.target.value = "";
        }}
      />

      {/* 1) Tài liệu: tải PDF → 2) kiểm tra tài liệu (lưới trang + xem trước). */}
      <section className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-black">Tài liệu bài giảng</h3>
            <p className="mt-1 text-sm leading-6 text-black/65">
              {hasSlides
                ? `Đang dùng ${slideCount} trang slide. Tải PDF mới để tạo lại toàn bộ.`
                : "Tải PDF lên để tạo slide cho bài giảng này."}
            </p>
            <p className="mt-1 text-xs leading-5 text-black/55">{LIMITS_HINT}</p>
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full border-black/10 bg-white"
              onClick={openFileDialog}
              disabled={uploading}
            >
              <Icon
                name={uploading ? "ri-loader-4-line" : "ri-upload-cloud-2-line"}
                className={cn("size-4", uploading && "animate-spin")}
              />
              {uploading ? "Đang xử lý…" : hasSlides ? "Thay PDF" : "Chọn PDF"}
            </Button>
          )}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openFileDialog}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              chooseFile(event.dataTransfer.files);
            }}
            className={cn(
              "mt-4 flex w-full flex-col items-center justify-center gap-1 rounded-[18px] border border-dashed px-4 py-6 text-center transition",
              uploading
                ? "border-[#cfdcca] bg-[#e8f1e6]/70"
                : "border-[#cfdcca] bg-[#e8f1e6]/55 hover:bg-[#e8f1e6]",
              dragOver && "border-[#6f8f69] bg-[#e8f1e6]",
            )}
          >
            {upload.status === "uploading" ? (
              <>
                <Icon name="ri-loader-4-line" className="size-6 animate-spin text-[#52704f]" />
                <span className="mt-1 text-sm font-medium text-black">
                  Đang tải và xử lý “{upload.fileName}”…
                </span>
                <span className="text-xs text-black/60">
                  File nhiều trang có thể mất 1–2 phút. Vui lòng không đóng trang.
                </span>
              </>
            ) : (
              <>
                <Icon name="ri-file-text-line" className="size-6 text-muted-foreground" />
                <span className="mt-1 text-sm font-medium text-black">
                  {hasSlides ? "Kéo PDF mới vào đây hoặc bấm để chọn" : "Kéo PDF vào đây hoặc bấm để chọn"}
                </span>
                <span className="text-xs text-black/55">{LIMITS_HINT}</span>
              </>
            )}
          </button>
        )}

        {upload.status === "success" && (
          <Alert
            variant="success"
            className="mt-3"
            title={`Đã tạo ${upload.pages} trang slide từ "${upload.fileName}".`}
          >
            Kiểm tra lưới trang bên dưới trước khi giao bài cho học viên.
          </Alert>
        )}

        {upload.status === "error" && (
          <Alert variant="destructive" className="mt-3" title="Không tải được tài liệu">
            <p>{upload.message}</p>
            <p className="mt-1 text-xs text-black/60">
              File “{upload.fileName}” vẫn được giữ — bạn có thể thử lại hoặc chọn file khác.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lastFile && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-black/10 bg-white"
                  onClick={() => {
                    const problem = validate(lastFile);
                    if (problem) {
                      setUpload({ status: "error", fileName: lastFile.name, message: problem });
                      return;
                    }
                    if (hasSlides) setPendingReplace(lastFile);
                    else void startUpload(lastFile);
                  }}
                >
                  <Icon name="ri-refresh-line" className="size-4" />
                  Thử lại
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={openFileDialog}
              >
                Chọn file khác
              </Button>
            </div>
          </Alert>
        )}

        {slidesError && (
          <Alert variant="destructive" className="mt-3" title="Không tải được danh sách trang">
            Kiểm tra kết nối rồi thử lại; nếu vừa tải PDF xong, hãy tải lại trang.
          </Alert>
        )}
      </section>

      {/* Kiểm tra tài liệu */}
      {slides.length > 0 && (
        <section className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-black">Kiểm tra tài liệu</h3>
            <span className="text-xs font-medium text-black/60">
              {slides.length} trang · bấm một trang để xem trước
            </span>
          </div>
          <SlidePreview slides={slides} />
        </section>
      )}

      {/* Ít dùng → gập lại, không lồng thêm accordion nào khác. */}
      {slides.length > 0 && (
        <details className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold text-black">
            Cài đặt nâng cao (trang trọng tâm, vùng nội dung AOI)
          </summary>
          <p className="mt-2 text-xs leading-5 text-black/60">
            Đánh dấu trang trọng tâm và kiểm tra vùng đo trên từng trang. Những thiết lập này ảnh
            hưởng tới cách tính mức độ hoàn thành của học viên.
          </p>
          <p className="mt-1 text-xs leading-5 text-black/60">
            Còn việc cho học viên thấy chấm điểm nhìn là thiết lập cấp khóa học —{" "}
            <Link
              href={`/teacher/courses/${courseId}?tab=settings`}
              className="font-medium text-[#3f573c] underline underline-offset-4"
            >
              mở tab Cài đặt
            </Link>
            .
          </p>
          <div className="mt-1">
            <KeySlideControls
              lessonId={lesson.id}
              courseId={courseId}
              canDelete={canManage}
              slides={slides}
            />
          </div>
        </details>
      )}

      {slidesLoading && slides.length === 0 && (
        <p className="text-sm text-black/55">Đang tải tài liệu bài giảng…</p>
      )}

      <ConfirmDialog
        open={pendingReplace !== null}
        onOpenChange={(open) => !open && setPendingReplace(null)}
        title="Thay tài liệu của bài giảng?"
        description={
          `Tải "${pendingReplace?.name ?? ""}" sẽ XÓA toàn bộ ${slideCount} trang slide hiện có và ` +
          "tạo lại slide + vùng nội dung AOI từ file mới. Nếu bài học đã có dữ liệu điểm nhìn của " +
          "học viên, hệ thống sẽ từ chối thay để không phá dữ liệu phân tích."
        }
        confirmLabel="Thay tài liệu"
        destructive
        onConfirm={() => {
          const file = pendingReplace;
          setPendingReplace(null);
          if (file) void startUpload(file);
        }}
      />
    </div>
  );
}
