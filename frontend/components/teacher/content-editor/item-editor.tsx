"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { LessonNode } from "@/lib/types/domain";
import { KIND_LABEL } from "./content-outline";
import { LessonEditor } from "./lesson-editor";
import { LessonQuizEditor } from "./lesson-quiz-editor";

/**
 * Khung bên phải của tab Nội dung: soạn đúng MỘT mục đang chọn.
 *
 * Tên bài giảng sửa tại đây (lưu khi rời ô / Enter — autosave đáng tin cậy của
 * backend). Bài tập trắc nghiệm có ô tên riêng trong trình soạn câu hỏi nên ở đây
 * chỉ hiển thị — tránh hai chỗ sửa cùng một dữ liệu.
 *
 * Cha truyền `key={lesson.id}` để state cục bộ tự nạp lại khi đổi mục.
 */
export function ItemEditor({
  lesson,
  moduleTitle,
  courseId,
  canManage,
  focusTitleToken,
  onRenameTitle,
  onChanged,
  onOpenOutline,
}: {
  lesson: LessonNode | null;
  moduleTitle: string | null;
  courseId: string;
  canManage: boolean;
  focusTitleToken: number;
  onRenameTitle: (lessonId: string, title: string) => Promise<void>;
  onChanged: () => void;
  onOpenOutline: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(lesson?.title ?? "");
  const [savingTitle, setSavingTitle] = useState(false);
  const isQuiz = lesson?.kind === "quiz";

  // "Đổi tên" từ menu mục lục → đưa con trỏ vào ô tên (bài giảng) — với bài tập,
  // LessonQuizEditor tự xử lý cùng token.
  useEffect(() => {
    if (focusTitleToken === 0 || !titleRef.current) return;
    titleRef.current.focus();
    titleRef.current.select();
  }, [focusTitleToken]);

  const commitTitle = async () => {
    if (!lesson || !canManage || isQuiz) return;
    const clean = draftTitle.trim();
    if (!clean || clean === lesson.title) {
      setDraftTitle(lesson.title);
      return;
    }
    setDraftTitle(clean);
    setSavingTitle(true);
    try {
      await onRenameTitle(lesson.id, clean);
    } finally {
      setSavingTitle(false);
    }
  };

  if (!lesson) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-black/10 bg-white lg:hidden"
          onClick={onOpenOutline}
        >
          <Icon name="ri-layout-left-line" className="size-4" />
          Mở mục lục
        </Button>
        <EmptyState
          icon="ri-layout-left-line"
          title="Chọn một mục để soạn"
          description="Mục lục liệt kê chương, bài giảng và bài tập. Chọn một mục để soạn nội dung ở đây."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-black/10 bg-white"
          onClick={onOpenOutline}
        >
          <Icon name="ri-layout-left-line" className="size-4" />
          Mục lục
        </Button>
      </div>

      <header className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-black/60">
          <Icon name={isQuiz ? "ri-question-line" : "ri-book-open-line"} className="size-3.5" />
          <span className="rounded-full border border-black/10 bg-black/5 px-2 py-0.5 font-semibold text-black/75">
            {KIND_LABEL[lesson.kind] ?? "Nội dung"}
          </span>
          {moduleTitle && <span className="truncate">· {moduleTitle}</span>}
        </p>

        {isQuiz ? (
          <div className="mt-2 flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-black">{lesson.title}</h2>
            <p className="text-xs text-black/60">
              Đổi tên ở ô “Tên bài tập” trong phần soạn bên dưới.
            </p>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Tên bài giảng</span>
              <input
                ref={titleRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setDraftTitle(lesson.title);
                }}
                readOnly={!canManage}
                aria-label="Tên bài giảng"
                className={cn(
                  "w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-[-0.02em] text-black transition-colors",
                  canManage
                    ? "hover:border-black/10 focus-visible:border-black/20 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8f1e6]"
                    : "cursor-default",
                )}
              />
            </label>
            <span className="shrink-0 text-xs text-black/60">
              {!canManage
                ? "Bạn chỉ có quyền xem"
                : savingTitle
                  ? "Đang lưu tên…"
                  : "Sửa tên rồi nhấn Enter để lưu"}
            </span>
          </div>
        )}
      </header>

      {isQuiz ? (
        lesson.quizId ? (
          <LessonQuizEditor
            key={lesson.id}
            quizId={lesson.quizId}
            canManage={canManage}
            onChanged={onChanged}
            focusTitleToken={focusTitleToken}
          />
        ) : (
          <p className="rounded-[20px] border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            Bài tập chưa sẵn sàng — hãy tải lại trang, hoặc xóa và tạo lại bài tập này.
          </p>
        )
      ) : (
        <LessonEditor key={lesson.id} lesson={lesson} courseId={courseId} canManage={canManage} />
      )}
    </div>
  );
}
