"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedGuard } from "@/components/teacher/unsaved-guard";
import { useCourseTree } from "@/hooks/use-teacher";
import {
  createLesson,
  createModule,
  createModuleQuizItem,
  deleteLesson,
  deleteModule,
  reorderModuleItems,
  updateLesson,
  updateModule,
} from "@/lib/api/teacher";
import { cn } from "@/lib/utils";
import type { LessonNode, ModuleNode } from "@/lib/types/domain";
import { ContentOutline } from "./content-outline";
import { ItemEditor } from "./item-editor";
import { NewCourseForm } from "./new-course-form";
import { PublishChecklistDialog, publishReport } from "./publish-checklist";

/**
 * Tab "Nội dung": mục lục (trái) + trình soạn mục đang chọn (phải).
 *
 * Luồng lưu giữ nguyên như trước: tên chương/bài lưu ngay khi rời ô, thêm mục thì
 * tạo bản nháp trên server rồi mở luôn để soạn, PDF tải ngay khi chọn (có xác nhận
 * khi thay), còn bài tập trắc nghiệm lưu theo nút "Lưu bài tập nháp"/"Giao bài".
 */
export function ContentEditor({
  courseId,
  isNew,
  canManage,
  onCreated,
  courseTitle = "",
}: {
  courseId: string;
  isNew: boolean;
  canManage: boolean;
  onCreated: (id: string) => void;
  courseTitle?: string;
}) {
  const queryClient = useQueryClient();
  const guard = useUnsavedGuard();
  const { data: tree = [], isFetching: treeFetching } = useCourseTree(isNew ? "" : courseId);

  const [selection, setSelection] = useState<string | null>(null);
  const [focusTitleToken, setFocusTitleToken] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<LessonNode | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<ModuleNode | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const flash = useCallback((tone: "ok" | "err", text: string) => {
    setStatusMsg({ tone, text });
    window.setTimeout(() => setStatusMsg(null), 6000);
  }, []);

  const errText = (e: unknown) => (e instanceof Error ? e.message : "Lỗi không xác định");

  const refreshTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    if (courseId) queryClient.invalidateQueries({ queryKey: ["teacher", "course-tree", courseId] });
  }, [queryClient, courseId]);

  // Mục đang mở: lựa chọn rõ ràng, hoặc mặc định mục đầu tiên (không cần effect).
  const firstItemId = tree[0]?.lessons[0]?.id ?? null;
  const activeId = selection ?? firstItemId;

  let selectedLesson: LessonNode | null = null;
  let selectedModule: ModuleNode | null = null;
  for (const mod of tree) {
    const lesson = mod.lessons.find((item) => item.id === activeId);
    if (lesson) {
      selectedLesson = lesson;
      selectedModule = mod;
      break;
    }
  }

  const totalLessons = tree.flatMap((m) => m.lessons).filter((l) => l.kind === "lesson").length;
  const totalQuizzes = tree.flatMap((m) => m.lessons).filter((l) => l.kind === "quiz").length;
  const totalSlides = tree.flatMap((m) => m.lessons).reduce((sum, l) => sum + l.slides, 0);
  const totalItems = totalLessons + totalQuizzes;

  const report = useMemo(() => publishReport(courseTitle, tree), [courseTitle, tree]);

  const openModuleOf = (lessonId: string) => {
    const owner = tree.find((module) => module.lessons.some((item) => item.id === lessonId));
    if (owner) setExpanded((prev) => ({ ...prev, [owner.id]: true }));
  };

  /** Chọn mục — có cảnh báo nếu trình soạn đang có thay đổi chưa lưu. */
  const selectItem = (lessonId: string, options?: { focusTitle?: boolean }) => {
    if (lessonId === activeId) {
      if (options?.focusTitle) setFocusTitleToken((token) => token + 1);
      return;
    }
    const proceed = () => {
      setSelection(lessonId);
      setOutlineOpen(false);
      openModuleOf(lessonId);
      if (options?.focusTitle) setFocusTitleToken((token) => token + 1);
    };
    if (guard) guard.confirmLeave(proceed);
    else proceed();
  };

  const addModule = async () => {
    setSaving(true);
    try {
      const created = await createModule(courseId, `Chương ${tree.length + 1}: Chưa đặt tên`);
      setExpanded((prev) => ({ ...prev, [created.id]: true }));
      refreshTree();
      flash("ok", "Đã thêm chương. Đổi tên chương ở menu “Thao tác chương”.");
    } catch (e) {
      flash("err", `Không thêm được chương: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addLesson = async (moduleId: string) => {
    setSaving(true);
    try {
      const created = await createLesson(moduleId, "Bài giảng mới");
      setSelection(created.id);
      setExpanded((prev) => ({ ...prev, [moduleId]: true }));
      setFocusTitleToken((token) => token + 1);
      refreshTree();
      flash("ok", "Đã thêm bài giảng — tải PDF lên để sinh viên học được.");
    } catch (e) {
      flash("err", `Không thêm được bài giảng: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addQuiz = async (moduleId: string) => {
    setSaving(true);
    try {
      const created = await createModuleQuizItem(moduleId, { title: "Bài tập mới" });
      setSelection(created.id);
      setExpanded((prev) => ({ ...prev, [moduleId]: true }));
      refreshTree();
      flash("ok", "Đã thêm bài tập — soạn câu hỏi ở khung bên phải.");
    } catch (e) {
      flash("err", `Không thêm được bài tập: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // Kéo thả: gửi lại toàn bộ thứ tự item của chương (backend yêu cầu danh sách
  // đầy đủ). Cập nhật lạc quan trước để thao tác mượt, lỗi thì khôi phục.
  const persistOrder = async (module: ModuleNode, next: LessonNode[]) => {
    const key = ["teacher", "course-tree", courseId];
    const previous = queryClient.getQueryData<ModuleNode[]>(key);
    queryClient.setQueryData<ModuleNode[]>(key, (modules) =>
      modules?.map((item) => (item.id === module.id ? { ...item, lessons: next } : item)),
    );
    setReordering(true);
    try {
      await reorderModuleItems(
        module.id,
        next.map((lesson) => ({ kind: lesson.kind, id: lesson.id })),
      );
      refreshTree();
    } catch (e) {
      if (previous) queryClient.setQueryData(key, previous);
      flash("err", `Không sắp xếp được: ${errText(e)}`);
    } finally {
      setReordering(false);
    }
  };

  const commitRenameModule = async (moduleId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    try {
      await updateModule(moduleId, clean);
      refreshTree();
      flash("ok", "Đã đổi tên chương.");
    } catch (e) {
      flash("err", `Không đổi tên được chương: ${errText(e)}`);
    }
  };

  const commitRenameLesson = async (lessonId: string, value: string) => {
    try {
      await updateLesson(lessonId, { title: value });
      refreshTree();
      flash("ok", "Đã lưu tên mục.");
    } catch (e) {
      flash("err", `Không lưu được tên: ${errText(e)}`);
    }
  };

  if (isNew) {
    return <NewCourseForm onCreated={onCreated} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
            Nội dung khóa học
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-black">
            Chương, bài giảng và bài tập
          </h2>
          <p className="mt-2 text-sm text-black/60">
            {tree.length} chương · {totalLessons} bài giảng · {totalQuizzes} bài tập · {totalSlides} trang
            {treeFetching && <span className="ml-2 text-black/45">· đang cập nhật…</span>}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full border-black/10 bg-white"
              onClick={() => setChecklistOpen(true)}
            >
              <Icon name="ri-list-check-3" className="size-4" />
              Kiểm tra nội dung
            </Button>
            <Button className="rounded-full" onClick={() => void addModule()} disabled={saving}>
              <Icon name="ri-add-line" className="size-4" />
              Thêm chương
            </Button>
          </div>
        )}
      </div>

      {statusMsg && (
        <Alert
          variant={statusMsg.tone === "ok" ? "success" : "destructive"}
          title={statusMsg.text}
        />
      )}

      {totalItems > 0 && report.issues.length > 0 && (
        <button
          type="button"
          onClick={() => setChecklistOpen(true)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[16px] border px-4 py-3 text-left text-sm transition",
            report.blocking
              ? "border-destructive/25 bg-destructive/5 hover:bg-destructive/8"
              : "border-warning/30 bg-warning/8 hover:bg-warning/12",
          )}
        >
          <Icon
            name={report.blocking ? "ri-error-warning-line" : "ri-information-line"}
            className={cn("size-4 shrink-0", report.blocking ? "text-destructive" : "text-warning")}
          />
          <span className="text-black">
            {report.issues.length} mục cần hoàn thiện trước khi xuất bản
            {report.blocking ? "" : " (chỉ là cảnh báo)"} — xem danh sách
          </span>
        </button>
      )}

      <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div
          className={cn(
            "mb-4 lg:mb-0 lg:sticky lg:top-28",
            !outlineOpen && "hidden lg:block",
          )}
        >
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <h3 className="text-sm font-semibold text-black">Mục lục</h3>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setOutlineOpen(false)}
            >
              Đóng
            </Button>
          </div>
          <ContentOutline
            tree={tree}
            courseId={courseId}
            canManage={canManage}
            selection={activeId}
            onSelect={(lessonId) => selectItem(lessonId)}
            expanded={expanded}
            onToggleModule={(moduleId) =>
              setExpanded((prev) => ({ ...prev, [moduleId]: !(prev[moduleId] ?? true) }))
            }
            onAddModule={() => void addModule()}
            onAddLesson={(moduleId) => void addLesson(moduleId)}
            onAddQuiz={(moduleId) => void addQuiz(moduleId)}
            onRenameLesson={(lesson) => selectItem(lesson.id, { focusTitle: true })}
            onRenameModule={(moduleId, title) => void commitRenameModule(moduleId, title)}
            onDeleteLesson={setLessonToDelete}
            onDeleteModule={setModuleToDelete}
            onReorder={(module, next) => void persistOrder(module, next)}
            busy={saving || reordering}
          />
        </div>

        <div className="min-w-0">
          <ItemEditor
            key={selectedLesson?.id ?? "empty"}
            lesson={selectedLesson}
            moduleTitle={selectedModule?.title ?? null}
            courseId={courseId}
            canManage={canManage}
            focusTitleToken={focusTitleToken}
            onRenameTitle={commitRenameLesson}
            onChanged={refreshTree}
            onOpenOutline={() => setOutlineOpen(true)}
          />
        </div>
      </div>

      <PublishChecklistDialog
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        report={report}
        onOpenItem={(lessonId) => {
          setChecklistOpen(false);
          selectItem(lessonId);
        }}
      />

      <ConfirmDialog
        open={moduleToDelete !== null}
        onOpenChange={(open) => !open && setModuleToDelete(null)}
        title={moduleToDelete ? `Xóa chương "${moduleToDelete.title}"?` : "Xóa chương?"}
        description={
          moduleToDelete && moduleToDelete.lessons.length > 0
            ? `Chương này còn ${moduleToDelete.lessons.length} mục — tất cả bài giảng, bài tập và slide bên trong cũng bị xóa.`
            : "Chương này sẽ bị xóa khỏi khóa học."
        }
        confirmLabel="Xóa chương"
        destructive
        onConfirm={async () => {
          if (!moduleToDelete) return;
          const target = moduleToDelete;
          setModuleToDelete(null);
          try {
            await deleteModule(target.id);
            setSelection(null);
            refreshTree();
            flash("ok", `Đã xóa chương "${target.title}".`);
          } catch (e) {
            flash("err", `Không xóa được chương: ${errText(e)}`);
          }
        }}
      />

      <ConfirmDialog
        open={lessonToDelete !== null}
        onOpenChange={(open) => !open && setLessonToDelete(null)}
        title={
          lessonToDelete
            ? `Xóa ${lessonToDelete.kind === "quiz" ? "bài tập" : "bài giảng"} "${lessonToDelete.title}"?`
            : "Xóa mục?"
        }
        description={
          lessonToDelete?.kind === "quiz"
            ? "Bài tập, toàn bộ câu hỏi và kết quả làm bài của học viên sẽ bị xóa."
            : "Bài giảng, toàn bộ slide và dữ liệu điểm nhìn liên quan sẽ bị xóa."
        }
        confirmLabel="Xóa"
        destructive
        onConfirm={async () => {
          if (!lessonToDelete) return;
          const target = lessonToDelete;
          setLessonToDelete(null);
          try {
            await deleteLesson(target.id);
            if (selection === target.id) setSelection(null);
            refreshTree();
            flash("ok", `Đã xóa "${target.title}".`);
          } catch (e) {
            flash("err", `Không xóa được mục: ${errText(e)}`);
          }
        }}
      />
    </div>
  );
}
