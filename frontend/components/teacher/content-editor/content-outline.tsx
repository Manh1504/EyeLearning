"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INPUT_CLS } from "@/components/teacher/workspace-ui";
import { cn } from "@/lib/utils";
import type { LessonNode, ModuleNode } from "@/lib/types/domain";
import { DragHandle, SortableRow } from "./sortable-row";

/** Nhãn loại nội dung dùng xuyên suốt trình soạn. */
export const KIND_LABEL: Record<string, string> = {
  lesson: "Bài giảng",
  quiz: "Trắc nghiệm",
};

type Tone = "ok" | "missing" | "draft" | "muted";

const TONE_CLS: Record<Tone, string> = {
  ok: "border-[#cfe0ca] bg-[#e8f1e6] text-[#3f573c]",
  missing: "border-destructive/25 bg-destructive/8 text-destructive",
  draft: "border-black/10 bg-black/5 text-black/60",
  muted: "border-black/10 bg-black/5 text-black/60",
};

/** Nhãn trạng thái nội dung: đủ/thiếu tài liệu, bản nháp, số câu… */
function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLS[tone],
      )}
    >
      {children}
    </span>
  );
}

function itemStatus(lesson: LessonNode) {
  if (lesson.kind === "quiz") {
    const count = lesson.questionCount ?? 0;
    if (count === 0) return <StatusPill tone="missing">Chưa có câu hỏi</StatusPill>;
    if (lesson.quizStatus === "draft") return <StatusPill tone="draft">Bản nháp · {count} câu</StatusPill>;
    if (lesson.quizStatus === "closed") return <StatusPill tone="muted">Đã đóng · {count} câu</StatusPill>;
    return <StatusPill tone="ok">Đã giao · {count} câu</StatusPill>;
  }
  return lesson.slides > 0 ? (
    <StatusPill tone="ok">{lesson.slides} trang</StatusPill>
  ) : (
    <StatusPill tone="missing">Chưa có PDF</StatusPill>
  );
}

/** Ô nhập tên dùng cho "Đổi tên chương" trong menu phụ. */
function InlineTitleInput({
  value,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  value: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== value) onCommit(draft);
        else onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          onCancel();
        }
      }}
      aria-label={ariaLabel}
      className={cn(INPUT_CLS, "h-9 min-w-0 flex-1")}
    />
  );
}

export function ContentOutline({
  tree,
  courseId,
  canManage,
  selection,
  onSelect,
  expanded,
  onToggleModule,
  onAddModule,
  onAddLesson,
  onAddQuiz,
  onRenameLesson,
  onRenameModule,
  onDeleteLesson,  onDeleteModule,
  onReorder,
  busy,
}: {
  tree: ModuleNode[];
  courseId: string;
  canManage: boolean;
  selection: string | null;
  onSelect: (lessonId: string) => void;
  expanded: Record<string, boolean>;
  onToggleModule: (moduleId: string) => void;
  onAddModule: () => void;
  onAddLesson: (moduleId: string) => void;
  onAddQuiz: (moduleId: string) => void;
  onRenameLesson: (lesson: LessonNode) => void;
  onRenameModule: (moduleId: string, title: string) => void;
  onDeleteLesson: (lesson: LessonNode) => void;
  onDeleteModule: (module: ModuleNode) => void;
  onReorder: (module: ModuleNode, next: LessonNode[]) => void;
  busy: boolean;
}) {
  const [activeLesson, setActiveLesson] = useState<LessonNode | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  // Tiêu đề dùng cho thông báo aria-live: đọc qua ref để không phụ thuộc vào
  // việc re-render kịp hay không trong lúc kéo.
  const activeTitleRef = useRef("");

  const sensors = useSensors(
    // Khoảng cách 6px để cú bấm vào tay kéo vẫn không bị nhầm thành kéo thả.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (module: ModuleNode, event: DragEndEvent) => {
    setActiveLesson(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = module.lessons.findIndex((item) => item.id === active.id);
    const to = module.lessons.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(module, arrayMove(module.lessons, from, to));
  };

  if (tree.length === 0) {
    return (
      <EmptyState
        icon="ri-git-branch-line"
        title="Chưa có chương"
        description="Tạo chương đầu tiên rồi thêm bài giảng (PDF) hoặc bài tập trắc nghiệm."
        action={
          canManage ? (
            <Button className="rounded-full" onClick={onAddModule} disabled={busy}>
              Tạo chương đầu tiên
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {tree.map((module, moduleIndex) => {
        const isOpen = expanded[module.id] ?? true;
        const itemCount = module.lessons.length;
        const active = module.lessons.some((lesson) => lesson.id === selection);
        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-[20px] border border-[#eeeee9] bg-white shadow-xs"
          >
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-3",
                active && !isOpen && "bg-[#e8f1e6]/45",
              )}
            >
              <button
                type="button"
                onClick={() => onToggleModule(module.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? `Thu gọn ${module.title}` : `Mở ${module.title}`}
                title={isOpen ? "Thu gọn chương" : "Mở chương"}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f] transition hover:bg-[#dbe8d6]"
              >
                <Icon
                  name="ri-arrow-right-s-line"
                  className={cn("size-5 transition-transform", isOpen && "rotate-90")}
                />
              </button>

              <span className="font-mono text-xs font-semibold tabular-nums text-black/45">
                {String(moduleIndex + 1).padStart(2, "0")}
              </span>

              {renamingModuleId === module.id ? (
                <InlineTitleInput
                  value={module.title}
                  ariaLabel={`Đổi tên ${module.title}`}
                  onCommit={(value) => {
                    setRenamingModuleId(null);
                    onRenameModule(module.id, value);
                  }}
                  onCancel={() => setRenamingModuleId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleModule(module.id)}
                  onDoubleClick={() => canManage && setRenamingModuleId(module.id)}
                  className="min-w-0 flex-1 truncate rounded-md px-1 text-left text-sm font-semibold text-black transition-colors hover:bg-[#e8f1e6]/55"
                  title={module.title}
                >
                  {module.title}
                </button>
              )}

              <span className="shrink-0 text-[11px] font-medium text-black/45">{itemCount} mục</span>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Thao tác chương ${module.title}`}
                      title="Thao tác chương"
                      className="text-muted-foreground"
                    >
                      <Icon name="ri-more-2-fill" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenamingModuleId(module.id)}>
                      <Icon name="ri-edit-line" />
                      Đổi tên chương
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => onDeleteModule(module)}>
                      <Icon name="ri-delete-bin-line" />
                      Xóa chương
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isOpen && (
              <div className="space-y-2 px-2 pb-3">
                {itemCount === 0 && (
                  <p className="rounded-[18px] border border-dashed border-black/10 bg-[#fdfdfa] px-4 py-4 text-center text-sm text-black/55">
                    Chương này chưa có mục nào. Thêm bài giảng hoặc trắc nghiệm bên dưới.
                  </p>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                  onDragStart={(event: DragStartEvent) => {
                    const lesson = module.lessons.find((item) => item.id === event.active.id);
                    if (lesson) {
                      activeTitleRef.current = lesson.title;
                      setActiveLesson(lesson);
                    }
                  }}
                  onDragEnd={(event) => handleDragEnd(module, event)}
                  onDragCancel={() => setActiveLesson(null)}
                  accessibility={{
                    announcements: {
                      onDragStart: () =>
                        `Đã nhặt "${activeTitleRef.current}". Dùng phím mũi tên lên/xuống để di chuyển, Enter để thả, Esc để huỷ.`,
                      onDragOver: ({ over }) => {
                        if (!over) return "Đang ở ngoài danh sách.";
                        const index = module.lessons.findIndex((item) => item.id === over.id);
                        return index < 0
                          ? "Đang di chuyển."
                          : `Đang ở vị trí ${index + 1}/${module.lessons.length}.`;
                      },
                      onDragEnd: () => `Đã thả "${activeTitleRef.current}".`,
                      onDragCancel: () => `Đã huỷ sắp xếp "${activeTitleRef.current}".`,
                    } satisfies Announcements,
                    screenReaderInstructions: {
                      draggable:
                        "Nhấn Space hoặc Enter để nhặt, dùng phím mũi tên để di chuyển, nhấn Space hoặc Enter lần nữa để thả, nhấn Esc để huỷ.",
                    },
                  }}
                >
                  <SortableContext
                    items={module.lessons.map((lesson) => lesson.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {module.lessons.map((lesson, lessonIndex) => {
                      const isQuiz = lesson.kind === "quiz";
                      const isSelected = selection === lesson.id;
                      return (
                        <SortableRow
                          key={lesson.id}
                          id={lesson.id}
                          disabled={!canManage || busy}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-2 rounded-[18px] border px-2.5 py-2.5 transition",
                              isSelected
                                ? "border-[#6f8f69] bg-[#e8f1e6]/60 shadow-xs"
                                : "border-[#eeeee9] bg-[#fdfdfa] hover:border-black/15",
                            )}
                          >
                            {canManage && <DragHandle label={`Kéo để sắp xếp ${lesson.title}`} />}

                            <button
                              type="button"
                              onClick={() => onSelect(lesson.id)}
                              aria-current={isSelected ? "true" : undefined}
                              aria-label={`Mở ${lesson.title}`}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span
                                className={cn(
                                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                                  isQuiz ? "bg-black text-white" : "bg-[#e8f1e6] text-[#52704f]",
                                )}
                              >
                                {isQuiz ? (
                                  <Icon name="ri-file-text-line" className="size-4" />
                                ) : (
                                  lessonIndex + 1
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    "block truncate text-sm",
                                    isSelected ? "font-semibold text-black" : "font-medium text-black",
                                  )}
                                  title={lesson.title}
                                >
                                  {lesson.title}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-black/50">
                                    {KIND_LABEL[lesson.kind] ?? "Nội dung"}
                                  </span>
                                  {itemStatus(lesson)}
                                </span>
                              </span>
                            </button>

                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Thao tác ${lesson.title}`}
                                    title="Thao tác"
                                    className="shrink-0 text-muted-foreground"
                                  >
                                    <Icon name="ri-more-2-fill" className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => onRenameLesson(lesson)}>
                                    <Icon name="ri-edit-line" />
                                    Đổi tên
                                  </DropdownMenuItem>
                                  {!isQuiz && (
                                    <DropdownMenuItem asChild>
                                      <Link
                                        href={`/teacher/courses/${courseId}/lessons/${lesson.id}/heatmap`}
                                      >
                                        <Icon name="ri-fire-line" />
                                        Xem heatmap
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem destructive onSelect={() => onDeleteLesson(lesson)}>
                                    <Icon name="ri-delete-bin-line" />
                                    Xóa
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </SortableRow>
                      );
                    })}
                  </SortableContext>
                  <DragOverlay>
                    {activeLesson ? (
                      <div className="flex items-center gap-3 rounded-[18px] border border-[#6f8f69] bg-white px-3 py-3 shadow-xl">
                        <Icon name="ri-draggable" className="size-4 shrink-0 text-[#52704f]" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-black">{activeLesson.title}</p>
                          <p className="mt-0.5 text-xs text-black/50">
                            {KIND_LABEL[activeLesson.kind] ?? "Nội dung"}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-black/10 bg-white"
                      onClick={() => onAddLesson(module.id)}
                      disabled={busy}
                    >
                      <Icon name="ri-book-open-line" className="size-4" />
                      Thêm bài giảng
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-black/10 bg-white"
                      onClick={() => onAddQuiz(module.id)}
                      disabled={busy}
                    >
                      <Icon name="ri-question-line" className="size-4" />
                      Thêm trắc nghiệm
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {canManage && (
        <Button
          variant="ghost"
          className="w-full justify-start rounded-full text-black/60"
          onClick={onAddModule}
          disabled={busy}
        >
          <Icon name="ri-add-line" className="size-4" />
          Thêm chương
        </Button>
      )}
    </div>
  );
}
