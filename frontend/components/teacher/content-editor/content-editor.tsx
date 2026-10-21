"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { INPUT_CLS } from "@/components/teacher/workspace-ui";
import {
  useCourseTree,
  useStudentDirectory,
  useTeacherCourses,
} from "@/hooks/use-teacher";
import {
  addCourseStudents,
  createCourse,
  createLesson,
  createModule,
  createModuleQuizItem,
  deleteCourse,
  deleteLesson,
  deleteModule,
  reorderModuleItems,
  updateCourse,
  updateLesson,
  updateModule,
  uploadLessonPdf,
} from "@/lib/api/teacher";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/api/client";
import { STATUS_LABEL } from "@/lib/constants";
import type { CourseStatus, LessonNode, ModuleNode } from "@/lib/types/domain";
import { cn } from "@/lib/utils";
import { SlidePreview } from "./slide-preview";
import { KeySlideControls } from "./key-slide-controls";
import { RenameInput } from "./rename-input";
import { LessonQuizEditor } from "./lesson-quiz-editor";
import { DragHandle, SortableRow } from "./sortable-row";

interface NewLessonDraft {
  key: number;
  title: string;
  file: File | null;
  showGazeDot: boolean;
}
interface NewChapterDraft {
  key: number;
  title: string;
  lessons: NewLessonDraft[];
}

export function ContentEditor({
  courseId,
  isNew,
  canManage,
  onCreated,
}: {
  courseId: string;
  isNew: boolean;
  canManage: boolean;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: courses = [] } = useTeacherCourses();
  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);
  const { data: tree = [], isFetching: treeFetching } = useCourseTree(isNew ? "" : courseId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CourseStatus>("draft");
  const [newChapters, setNewChapters] = useState<NewChapterDraft[]>([
    { key: 0, title: "", lessons: [{ key: 0, title: "", file: null, showGazeDot: false }] },
  ]);
  const [draftKey, setDraftKey] = useState(1);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<string | null>(null);
  const [recoveryDraftId, setRecoveryDraftId] = useState<string | null>(null);
  const {
    data: studentDirectory = [],
    isLoading: studentsLoading,
    isError: studentsError,
  } = useStudentDirectory(isNew, studentQuery);

  const [selection, setSelection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lessonToDelete, setLessonToDelete] = useState<LessonNode | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<ModuleNode | null>(null);
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Kéo thả sắp xếp bài học/bài tập trong một chương.
  const [reordering, setReordering] = useState(false);
  const [activeLesson, setActiveLesson] = useState<LessonNode | null>(null);
  const activeModuleRef = useRef<ModuleNode | null>(null);
  const activeTitleRef = useRef("");
  const sensors = useSensors(
    // Khoảng cách 6px để cú bấm vào tay kéo vẫn không bị nhầm thành kéo thả.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Thông báo cho trình đọc màn hình khi thao tác bằng bàn phím.
  const dragAnnouncements: Announcements = {
    onDragStart: () =>
      `Đã nhặt "${activeTitleRef.current}". Dùng phím mũi tên lên/xuống để di chuyển, Enter để thả, Esc để huỷ.`,
    onDragOver: ({ over }) => {
      if (!over) return "Đang ở ngoài danh sách.";
      const lessons = activeModuleRef.current?.lessons ?? [];
      const index = lessons.findIndex((lesson) => lesson.id === over.id);
      return index < 0 ? "Đang di chuyển." : `Đang ở vị trí ${index + 1}/${lessons.length}.`;
    },
    onDragEnd: () => `Đã thả "${activeTitleRef.current}".`,
    onDragCancel: () => `Đã huỷ sắp xếp "${activeTitleRef.current}".`,
  };

  // Render-phase hydrate form from loaded course (một lần cho mỗi khóa học).
  if (!isNew && course && hydratedId !== course.id) {
    setHydratedId(course.id);
    setTitle(course.title);
    setDescription(course.description);
    setStatus(course.status);
  }

  const flash = useCallback((tone: "ok" | "err", text: string) => {
    setStatusMsg({ tone, text });
    window.setTimeout(() => setStatusMsg(null), 6000);
  }, []);

  const refreshTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    if (courseId) queryClient.invalidateQueries({ queryKey: ["teacher", "course-tree", courseId] });
  }, [queryClient, courseId]);

  const errText = (e: unknown) => (e instanceof Error ? e.message : "Lỗi không xác định");

  let selectedLesson: LessonNode | null = null;
  for (const m of tree) {
    const lesson = m.lessons.find((l) => l.id === selection);
    if (lesson) {
      selectedLesson = lesson;
      break;
    }
  }

  const totalItems = tree.flatMap((m) => m.lessons).length;
  const totalLessons = tree.flatMap((m) => m.lessons).filter((l) => l.kind === "lesson").length;
  const totalQuizzes = tree.flatMap((m) => m.lessons).filter((l) => l.kind === "quiz").length;
  const totalSlides = tree.flatMap((m) => m.lessons).reduce((sum, l) => sum + l.slides, 0);
  const canPublish = title.trim().length > 0 && tree.length > 0 && totalItems > 0;

  const saveCourse = async (nextStatus: CourseStatus) => {
    if (!title.trim()) {
      flash("err", "Cần nhập tên khóa học trước khi lưu.");
      return;
    }
    if (nextStatus === "published" && !canPublish) {
      flash("err", "Cần có tên, chương, bài học và slide trước khi xuất bản.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createCourse({
          title: title.trim(),
          description: description.trim() || undefined,
          status: nextStatus,
        });
        onCreated(created.id);
        return;
      }
      const saved = await updateCourse(courseId, {
        title: title.trim(),
        description: description.trim(),
        status: nextStatus,
      });
      setStatus(saved.status);
      refreshTree();
      flash("ok", `Đã lưu "${saved.title}".`);
    } catch (e) {
      flash("err", `Không lưu được khóa học: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async () => {
    try {
      await deleteCourse(courseId);
      router.replace("/teacher");
      router.refresh();
    } catch (e) {
      flash("err", `Không xóa được khóa học: ${errText(e)}`);
      setConfirmDeleteCourse(false);
    }
  };

  const addModule = async () => {
    setSaving(true);
    try {
      await createModule(courseId, `Chương ${tree.length + 1}: Chưa đặt tên`);
      refreshTree();
      flash("ok", "Đã thêm chương.");
    } catch (e) {
      flash("err", `Không thêm được chương: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addLesson = async (moduleId: string) => {
    setSaving(true);
    try {
      const created = await createLesson(moduleId, "Bài học mới");
      setSelection(created.id);
      setExpanded((prev) => ({ ...prev, [moduleId]: true }));
      refreshTree();
      flash("ok", "Đã thêm bài học.");
    } catch (e) {
      flash("err", `Không thêm được bài học: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addQuiz = async (moduleId: string, afterId?: string) => {
    setSaving(true);
    try {
      const created = await createModuleQuizItem(moduleId, {
        title: "Bài tập mới",
        afterId,
      });
      setSelection(created.id);
      setExpanded((prev) => ({ ...prev, [moduleId]: true }));
      refreshTree();
      flash("ok", "Đã thêm bài tập. Soạn câu hỏi bên dưới.");
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

  const handleDragStart = (module: ModuleNode, event: DragStartEvent) => {
    const lesson = module.lessons.find((item) => item.id === event.active.id);
    if (!lesson) return;
    activeModuleRef.current = module;
    activeTitleRef.current = lesson.title;
    setActiveLesson(lesson);
  };

  const handleDragEnd = async (module: ModuleNode, event: DragEndEvent) => {
    setActiveLesson(null);
    const { active, over } = event;
    // Kéo ra ngoài danh sách (hoặc thả về đúng chỗ cũ) thì không làm gì.
    if (!over || active.id === over.id) return;
    const from = module.lessons.findIndex((item) => item.id === active.id);
    const to = module.lessons.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    await persistOrder(module, arrayMove(module.lessons, from, to));
  };

  const commitRenameModule = async (id: string, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    try {
      await updateModule(id, clean);
      refreshTree();
    } catch (e) {
      flash("err", `Không đổi tên được: ${errText(e)}`);
    }
  };

  const commitRenameLesson = async (id: string, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    try {
      await updateLesson(id, { title: clean });
      refreshTree();
    } catch (e) {
      flash("err", `Không đổi tên được bài học: ${errText(e)}`);
    }
  };

  // Bật/tắt việc sinh viên thấy chấm điểm nhìn của chính họ (để test).
  // Cập nhật lạc quan vào cache rồi refetch; lỗi thì khôi phục lại.
  const setLessonGazeDot = async (lesson: LessonNode, value: boolean) => {
    const key = ["teacher", "course-tree", courseId];
    const previous = queryClient.getQueryData<ModuleNode[]>(key);
    queryClient.setQueryData<ModuleNode[]>(key, (modules) =>
      modules?.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === lesson.id ? { ...l, showGazeDot: value } : l)),
      })),
    );
    try {
      await updateLesson(lesson.id, { showGazeDot: value });
      refreshTree();
      flash("ok", value ? "Đã bật hiển thị điểm nhìn cho sinh viên." : "Đã tắt hiển thị điểm nhìn.");
    } catch (e) {
      if (previous) queryClient.setQueryData(key, previous);
      flash("err", `Không đổi được chế độ điểm nhìn: ${errText(e)}`);
    }
  };

  const handleFile = async (files: FileList | File[]) => {
    if (!selectedLesson) return;
    const list = Array.from(files);
    const pdf = list.find(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (!pdf) {
      flash("err", "Vui lòng chọn file PDF.");
      return;
    }
    if (pdf.size > MAX_UPLOAD_BYTES) {
      flash("err", `File PDF "${pdf.name}" vượt quá ${MAX_UPLOAD_LABEL} cho phép.`);
      return;
    }
    setUploading(true);
    try {
      await uploadLessonPdf(selectedLesson.id, pdf, pdf.name);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teacher", "lesson-slides", selectedLesson.id] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "course-tree", courseId] }),
        queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] }),
      ]);
      flash("ok", `Đã tạo slide từ "${pdf.name}".`);
    } catch (e) {
      flash("err", `Không upload được PDF: ${errText(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const patchNewChapter = (key: number, patch: Partial<NewChapterDraft>) =>
    setNewChapters((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addNewChapter = () => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) => [
      ...prev,
      { key, title: "", lessons: [{ key: 0, title: "", file: null, showGazeDot: false }] },
    ]);
  };
  const removeNewChapter = (key: number) =>
    setNewChapters((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)));
  const addNewLesson = (chapterKey: number) => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey
          ? {
              ...c,
              lessons: [...c.lessons, { key, title: "", file: null, showGazeDot: false }],
            }
          : c,
      ),
    );
  };
  const patchNewLesson = (chapterKey: number, lessonKey: number, patch: Partial<NewLessonDraft>) =>
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey
          ? { ...c, lessons: c.lessons.map((l) => (l.key === lessonKey ? { ...l, ...patch } : l)) }
          : c,
      ),
    );
  const removeNewLesson = (chapterKey: number, lessonKey: number) =>
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey && c.lessons.length > 1
          ? { ...c, lessons: c.lessons.filter((l) => l.key !== lessonKey) }
          : c,
      ),
    );

  const oversizedPdfs = useMemo(
    () =>
      newChapters.flatMap((chapter) =>
        chapter.lessons.flatMap((lesson) =>
          lesson.file && lesson.file.size > MAX_UPLOAD_BYTES ? [lesson.file.name] : [],
        ),
      ),
    [newChapters],
  );

  const newFormIssues = useMemo(() => {
    const issues: string[] = [];
    if (!title.trim()) issues.push("Tên khóa học");
    if (newChapters.length === 0 || newChapters.some((c) => !c.title.trim())) issues.push("Tên từng chương");
    if (newChapters.some((c) => c.lessons.length === 0 || c.lessons.some((l) => !l.title.trim())))
      issues.push("Tên từng bài học");
    if (newChapters.some((c) => c.lessons.some((l) => !l.file))) issues.push("File PDF cho từng bài học");
    if (oversizedPdfs.length > 0)
      issues.push(`PDF vượt quá ${MAX_UPLOAD_LABEL}: ${oversizedPdfs.join(", ")}`);
    return issues;
  }, [title, newChapters, oversizedPdfs]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };

  const createFullCourse = async () => {
    if (recoveryDraftId) return;
    if (newFormIssues.length > 0) {
      flash("err", `Còn thiếu: ${newFormIssues.join(", ")}.`);
      return;
    }
    setCreating(true);
    setCreateStep("Đang tạo khóa học…");
    let createdDraftId: string | null = null;
    try {
      const created = await createCourse({
        title: title.trim(),
        description: description.trim() || undefined,
        status: "draft",
      });
      createdDraftId = created.id;
      for (const chapter of newChapters) {
        setCreateStep(`Đang tạo chương "${chapter.title.trim()}"…`);
        const mod = await createModule(created.id, chapter.title.trim());
        for (const lesson of chapter.lessons) {
          setCreateStep(`Đang tải và xử lý PDF cho bài "${lesson.title.trim()}"…`);
          const createdLesson = await createLesson(
            mod.id,
            lesson.title.trim(),
            lesson.showGazeDot,
          );
          const pdf = lesson.file as File;
          await uploadLessonPdf(createdLesson.id, pdf, pdf.name);
        }
      }
      if (selectedStudents.length > 0) {
        setCreateStep("Đang thêm học viên…");
        await addCourseStudents(created.id, selectedStudents);
      }
      setCreateStep("Đang xuất bản…");
      await updateCourse(created.id, { status: "published" });
      queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      onCreated(created.id);
    } catch (e) {
      if (createdDraftId) {
        setRecoveryDraftId(createdDraftId);
        await queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      } else {
        flash("err", `Không tạo được khóa học: ${errText(e)}`);
      }
      setCreating(false);
      setCreateStep(null);
    }
  };

  if (isNew) {
    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="max-w-2xl border-b border-black/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Khóa học mới</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-black sm:text-5xl">
            Tạo khóa học mới
          </h2>
          <p className="mt-4 text-sm leading-6 text-black/45">
            Điền thông tin trong cùng một trang rồi bấm “Tạo và xuất bản”.
          </p>
        </div>

        <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">01</span>
            <h3 className="mt-3 text-sm font-semibold text-black">Thông tin khóa học</h3>
          </div>
          <div className="space-y-4 rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
          <div className="space-y-1.5">
            <label htmlFor="new-title" className="block text-sm font-medium text-black">
              Tên khóa học <span className="text-destructive">*</span>
            </label>
            <input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Lập trình Python cơ bản"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-desc" className="block text-sm font-medium text-black">
              Mô tả
            </label>
            <textarea
              id="new-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Tóm tắt nội dung, mục tiêu khóa học..."
              className={cn(INPUT_CLS, "h-auto min-h-24 resize-y py-2")}
            />
          </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">02</span>
            <h3 className="mt-3 text-sm font-semibold text-black">Chương và bài học</h3>
          </div>
          <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-black/45">Mỗi trang PDF sẽ trở thành một slide.</p>
            <Button variant="outline" size="sm" className="rounded-full border-black/10" onClick={addNewChapter} disabled={creating}>
              <Icon name="ri-add-line" className="size-4" />
              Thêm chương
            </Button>
          </div>

          <div className="space-y-4">
            {newChapters.map((chapter, ci) => (
              <div key={chapter.key} className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-5">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 shrink-0 rounded-full bg-[#e8f1e6] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#52704f]">
                    {String(ci + 1).padStart(2, "0")}
                  </span>
                  <input
                    value={chapter.title}
                    onChange={(e) => patchNewChapter(chapter.key, { title: e.target.value })}
                    placeholder={`Chương ${ci + 1}: nhập tên chương`}
                    disabled={creating}
                    className={cn(INPUT_CLS, "min-w-0 flex-1")}
                    aria-label={`Tên chương ${ci + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeNewChapter(chapter.key)}
                    disabled={creating || newChapters.length <= 1}
                    aria-label={`Xóa chương ${ci + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Icon name="ri-delete-bin-line" className="size-4" />
                  </Button>
                </div>

                <div className="mt-4 space-y-2 sm:ml-10">
                  {chapter.lessons.map((lesson, li) => (
                    <div key={lesson.key} className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] p-3">
                      <div className="flex items-start gap-2">
                        <input
                          value={lesson.title}
                          onChange={(e) => patchNewLesson(chapter.key, lesson.key, { title: e.target.value })}
                          placeholder={`Bài ${li + 1}: nhập tên bài`}
                          disabled={creating}
                          className={cn(INPUT_CLS, "min-w-0 flex-1")}
                          aria-label={`Tên bài ${li + 1}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeNewLesson(chapter.key, lesson.key)}
                          disabled={creating || chapter.lessons.length <= 1}
                          aria-label={`Xóa bài ${li + 1}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="ri-delete-bin-line" className="size-4" />
                        </Button>
                      </div>
                      <input
                        type="file"
                        accept="application/pdf"
                        disabled={creating}
                        onChange={(e) =>
                          patchNewLesson(chapter.key, lesson.key, { file: e.target.files?.[0] ?? null })
                        }
                        className="mt-3 block w-full cursor-pointer rounded-xl border border-[#dfe9dc] bg-[#e8f1e6] px-3 py-2 text-sm text-black/45 file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`PDF cho bài ${li + 1}`}
                      />
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#dfe9dc] bg-[#e8f1e6]/45 px-3 py-2">
                        <span className="text-xs text-black/60">
                          Cho sinh viên thấy điểm nhìn (để test)
                        </span>
                        <Switch
                          checked={lesson.showGazeDot}
                          disabled={creating}
                          onCheckedChange={(value) =>
                            patchNewLesson(chapter.key, lesson.key, { showGazeDot: value })
                          }
                          ariaLabel={`Hiển thị điểm nhìn — bài ${li + 1}`}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {lesson.file
                          ? `${lesson.file.name} (${(lesson.file.size / (1024 * 1024)).toFixed(1)}MB)`
                          : `PDF · tối đa ${MAX_UPLOAD_LABEL} — mỗi trang thành 1 slide.`}
                      </p>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addNewLesson(chapter.key)}
                    disabled={creating}
                    className="w-full justify-start rounded-full text-black/45"
                  >
                    <Icon name="ri-add-line" className="size-4" />
                    Thêm bài học vào chương này
                  </Button>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">03</span>
            <h3 className="mt-3 text-sm font-semibold text-black">Học viên</h3>
            <p className="mt-1 text-xs leading-5 text-black/40">Tùy chọn · đã chọn {selectedStudents.length}</p>
          </div>
          <div className="rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
            <div className="relative">
              <Icon name="ri-search-line" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Tìm theo tên hoặc mã sinh viên"
                disabled={creating}
                className={cn(INPUT_CLS, "pl-10")}
                aria-label="Tìm học viên để thêm vào khóa học"
              />
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa]">
              {studentsLoading ? (
                <p className="px-4 py-8 text-center text-sm text-black/40">Đang tải danh mục học viên…</p>
              ) : studentsError ? (
                <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">Không tải được danh mục học viên.</p>
              ) : studentDirectory.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-black/40">
                  {studentQuery.trim() ? "Không tìm thấy học viên phù hợp." : "Chưa có học viên trong danh mục."}
                </p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {studentDirectory.slice(0, 50).map((student) => (
                    <li key={student.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[#e8f1e6]/55">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          disabled={creating}
                          onChange={() => toggleStudent(student.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-black">{student.name}</span>
                          <span className="mt-0.5 block text-xs text-black/40">{student.code}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {newFormIssues.length > 0 && (
          <Alert variant="warning" title={`Còn thiếu: ${newFormIssues.join(" · ")}`} />
        )}
        {statusMsg && (
          <Alert
            variant={statusMsg.tone === "ok" ? "success" : "destructive"}
            title={statusMsg.text}
          />
        )}
        {recoveryDraftId && (
          <Alert
            variant="warning"
            title="Khóa học nháp đã được tạo nhưng chưa hoàn tất"
          >
            <p>Một phần nội dung không thể lưu. Tiếp tục trong bản nháp hiện có để tránh tạo khóa học trùng.</p>
            <Link
              href={`/teacher/courses/${recoveryDraftId}?tab=content`}
              className="mt-2 inline-flex font-medium text-foreground underline underline-offset-4"
            >
              Tiếp tục chỉnh sửa bản nháp
            </Link>
          </Alert>
        )}
        {createStep && (
          <p aria-live="polite" className="flex items-center justify-end gap-2 text-sm text-black/45">
            <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {createStep}
          </p>
        )}

        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-[20px] border border-[#eeeee9] bg-white/90 p-3 shadow-[0_10px_30px_rgba(30,35,25,0.08)] backdrop-blur-xl sm:flex-row sm:justify-end">
          <Button variant="outline" className="rounded-full border-black/10" disabled={creating || saving || !title.trim() || Boolean(recoveryDraftId)} onClick={() => saveCourse("draft")}>
            Lưu nháp (bổ sung sau)
          </Button>
          {recoveryDraftId ? (
            <Button asChild className="rounded-full bg-black px-6 text-white hover:bg-black/80">
              <Link href={`/teacher/courses/${recoveryDraftId}?tab=content`}>Tiếp tục bản nháp</Link>
            </Button>
          ) : (
            <Button className="rounded-full bg-black px-6 text-white hover:bg-black/80"
              disabled={creating || saving || newFormIssues.length > 0}
              onClick={createFullCourse}
            >
              {creating ? "Đang tạo…" : "Tạo và xuất bản"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid items-start gap-10 lg:grid-cols-[310px_minmax(0,1fr)]">
      <section className="space-y-5 rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs lg:sticky lg:top-28">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-black">Thông tin khóa học</h2>
          <span className="rounded-full bg-[#e8f1e6] px-3 py-1 text-[10px] font-semibold text-[#52704f]">
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <label htmlFor="course-title" className="block text-xs font-medium text-black/55">
              Tên khóa học
            </label>
            <input
              id="course-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={!canManage}
              className={cn(INPUT_CLS, "bg-white", !canManage && "cursor-not-allowed text-black/40")}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="course-status" className="block text-xs font-medium text-black/55">
              Trạng thái
            </label>
            <select
              id="course-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CourseStatus)}
              disabled={!canManage}
              className={cn(INPUT_CLS, "bg-white disabled:cursor-not-allowed")}
            >
              <option value="draft">{STATUS_LABEL.draft}</option>
              <option value="published">{STATUS_LABEL.published}</option>
              <option value="archived">{STATUS_LABEL.archived}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="course-desc" className="block text-xs font-medium text-black/55">
              Mô tả
            </label>
            <textarea
              id="course-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!canManage}
              rows={3}
              className={cn(
                INPUT_CLS,
                "h-auto min-h-28 resize-y bg-white py-3",
                !canManage && "cursor-not-allowed text-black/40",
              )}
            />
          </div>
        </div>
        {canManage && (
          <div className="grid gap-2">
            <Button variant="outline" className="rounded-full border-black/10 bg-white" disabled={saving || !title.trim()} onClick={() => saveCourse(status)}>
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
            <Button className="rounded-full bg-black text-white hover:bg-black/80" disabled={saving || !canPublish} onClick={() => saveCourse("published")}>
              Xuất bản
            </Button>
            <Button variant="ghost" className="rounded-full text-black/45 hover:text-destructive" onClick={() => setConfirmDeleteCourse(true)}>
              Xóa khóa học
            </Button>
          </div>
        )}
        {statusMsg && (
          <Alert
            variant={statusMsg.tone === "ok" ? "success" : "destructive"}
            title={statusMsg.text}
          />
        )}
      </section>

      <section className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Nội dung khóa học</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-black">Chương và bài học</h2>
            <p className="mt-2 text-sm text-black/45">
              {tree.length} chương · {totalLessons} bài · {totalQuizzes} bài tập · {totalSlides} trang
            </p>
          </div>
          {canManage && (
            <Button className="rounded-full bg-black text-white hover:bg-black/80" onClick={addModule} disabled={saving}>
              <Icon name="ri-add-line" className="size-4" />
              Thêm chương
            </Button>
          )}
        </div>

        {treeFetching && (
          <p className="text-sm text-muted-foreground">Đang cập nhật cấu trúc…</p>
        )}

        {tree.length === 0 ? (
          <EmptyState
            icon="ri-git-branch-line"
            title="Chưa có chương"
            description="Tạo chương đầu tiên để bắt đầu xây dựng khóa học."
            action={canManage ? <Button className="rounded-full bg-black text-white hover:bg-black/80" onClick={addModule}>Tạo chương đầu tiên</Button> : undefined}
          />
        ) : (
          <div className="space-y-4">
            {tree.map((module, moduleIndex) => {
              const isOpen = expanded[module.id] ?? true;
              return (
                <div key={module.id} className="overflow-hidden rounded-[20px] border border-[#eeeee9] bg-white shadow-xs">
                  <div className="flex items-center gap-2 px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => ({ ...v, [module.id]: !isOpen }))}
                      aria-expanded={isOpen}
                       className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8f1e6] text-[#52704f] hover:text-black"
                      aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
                    >
                      <Icon name="ri-arrow-right-s-line" className={cn("size-5 transition-transform", isOpen && "rotate-90")} />
                    </button>
                    <span className="font-mono text-xs font-semibold tabular-nums text-black/35">
                      {String(moduleIndex + 1).padStart(2, "0")}
                    </span>
                    <RenameInput
                      value={module.title}
                      canEdit={canManage}
                      onCommit={(v) => commitRenameModule(module.id, v)}
                      className="text-base font-semibold text-black"
                    />
                    {canManage && (
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setModuleToDelete(module)}
                          aria-label={`Xóa chương ${module.title}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="ri-delete-bin-line" className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <div className="space-y-1 px-2 pb-2">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                        onDragStart={(event) => handleDragStart(module, event)}
                        onDragEnd={(event) => void handleDragEnd(module, event)}
                        onDragCancel={() => setActiveLesson(null)}
                        accessibility={{
                          announcements: dragAnnouncements,
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
                        const lessonOpen = selection === lesson.id;
                        const isQuiz = lesson.kind === "quiz";
                        return (
                          <SortableRow
                            key={lesson.id}
                            id={lesson.id}
                            disabled={!canManage || reordering || saving}
                          >
                            <div className="flex items-center gap-3 rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-3 py-3 sm:ml-10">
                              {canManage && <DragHandle label={`Kéo để sắp xếp ${lesson.title}`} />}
                              <span
                                className={cn(
                                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                                  isQuiz ? "bg-black text-white" : "bg-[#e8f1e6] text-[#52704f]",
                                )}
                              >
                                {isQuiz ? <Icon name="ri-file-text-line" className="size-4" /> : lessonIndex + 1}
                              </span>
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="min-w-0 flex-1">
                                  {isQuiz ? (
                                    <span className="block w-full text-sm font-medium text-black">{lesson.title}</span>
                                  ) : (
                                    <RenameInput
                                      value={lesson.title}
                                      canEdit={canManage}
                                      onCommit={(value) => commitRenameLesson(lesson.id, value)}
                                      className="block w-full text-sm font-medium text-black"
                                    />
                                  )}
                                  <span className="mt-0.5 block text-xs text-black/40">
                                    {isQuiz
                                      ? `${lesson.questionCount ?? 0} câu · ${lesson.durationMinutes ?? 0} phút`
                                      : lesson.slides > 0
                                        ? `${lesson.slides} trang slide`
                                        : "Chưa có PDF"}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelection(lessonOpen ? null : lesson.id)}
                                  aria-expanded={lessonOpen}
                                  aria-label={lessonOpen ? `Thu gọn ${lesson.title}` : `Mở ${lesson.title}`}
                                  className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-[#e8f1e6]"
                                >
                                  <Icon
                                    name="ri-arrow-down-s-line"
                                    className={cn("size-5 text-muted-foreground transition-transform", lessonOpen && "rotate-180")}
                                  />
                                </button>
                              </div>
                              {canManage && (
                                <div className="flex shrink-0 items-center gap-1">
                                  {!isQuiz && (
                                    <Button
                                      asChild
                                      variant="ghost"
                                      size="icon-sm"
                                      className="text-muted-foreground"
                                    >
                                      <Link
                                        href={`/teacher/courses/${courseId}/lessons/${lesson.id}/heatmap`}
                                        aria-label={`Heatmap ${lesson.title}`}
                                      >
                                        <Icon name="ri-fire-line" className="size-4" />
                                      </Link>
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setLessonToDelete(lesson)}
                                    aria-label={`Xóa ${isQuiz ? "bài tập" : "bài"} ${lesson.title}`}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Icon name="ri-delete-bin-line" className="size-4" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {lessonOpen && (
                              isQuiz ? (
                                <div className="mx-2 mb-2 sm:ml-12">
                                  {lesson.quizId ? (
                                    <LessonQuizEditor
                                      quizId={lesson.quizId}
                                      canManage={canManage}
                                      onChanged={refreshTree}
                                    />
                                  ) : (
                                    <p className="text-sm text-destructive">Bài tập chưa sẵn sàng.</p>
                                  )}
                                </div>
                              ) : (
                              <div className="mx-2 mb-2 rounded-[20px] border border-[#eeeee9] bg-white px-4 py-6 shadow-xs sm:ml-12 sm:px-6">
                                {canManage && (
                                  <div className="mb-6 flex flex-col gap-3 rounded-[16px] border border-[#dfe9dc] bg-[#e8f1e6]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <h4 className="flex items-center gap-2 text-sm font-semibold text-black">
                                        <Icon name="ri-eye-line" className="size-4 text-[#52704f]" />
                                        Hiển thị điểm nhìn cho sinh viên
                                      </h4>
                                      <p className="mt-1 text-xs leading-5 text-black/50">
                                        Bật để sinh viên thấy chấm điểm nhìn của chính mình khi học bài này. Dùng để
                                        kiểm tra/hiệu chỉnh độ chính xác; mặc định tắt.
                                      </p>
                                    </div>
                                    <Switch
                                      checked={Boolean(lesson.showGazeDot)}
                                      disabled={saving}
                                      onCheckedChange={(value) => setLessonGazeDot(lesson, value)}
                                      ariaLabel={`Hiển thị điểm nhìn cho sinh viên — ${lesson.title}`}
                                    />
                                  </div>
                                )}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <h4 className="text-sm font-semibold text-black">Tài liệu bài học</h4>
                                    <p className="mt-1 text-sm text-black/45">
                                      Tải PDF mới để tạo hoặc thay thế toàn bộ slide.
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    className="rounded-full border-black/10"
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                  >
                                    {uploading ? (
                                      <Icon name="ri-loader-4-line" className="size-4 animate-spin" />
                                    ) : (
                                      <Icon name="ri-upload-cloud-2-line" className="size-4" />
                                    )}
                                    {uploading ? "Đang xử lý…" : lesson.slides > 0 ? "Thay PDF" : "Tải PDF"}
                                  </Button>
                                </div>
                                {uploading && (
                                  <p className="mt-2 text-xs text-black/50">
                                    Đang tải lên và xử lý PDF… File nhiều trang có thể mất đến 1–2
                                    phút. Vui lòng không đóng trang.
                                  </p>
                                )}
                                <input
                                  ref={fileRef}
                                  type="file"
                                  accept="application/pdf"
                                  className="sr-only"
                                  onChange={(e) => {
                                    if (e.target.files) void handleFile(e.target.files);
                                    e.target.value = "";
                                  }}
                                />
                                 <button
                                   type="button"
                                   onClick={() => fileRef.current?.click()}
                                   onDragOver={(event) => {
                                     event.preventDefault();
                                     setDragOverUpload(true);
                                   }}
                                   onDragLeave={() => setDragOverUpload(false)}
                                   onDrop={(event) => {
                                     event.preventDefault();
                                     setDragOverUpload(false);
                                     void handleFile(event.dataTransfer.files);
                                   }}
                                   className={cn(
                                     "mt-4 flex min-h-28 w-full items-center justify-center rounded-[18px] border border-dashed border-[#cfdcca] bg-[#e8f1e6]/55 px-4 py-5 text-center transition hover:bg-[#e8f1e6]",
                                     dragOverUpload && "border-[#6f8f69] bg-[#e8f1e6]",
                                   )}
                                 >
                                  <span>
                                    <Icon name="ri-file-text-line" className="mx-auto size-6 text-muted-foreground" />
                                    <span className="mt-2 block text-sm font-medium text-black">
                                      {lesson.slides > 0
                                        ? `${lesson.slides} trang đã sẵn sàng`
                                       : "Kéo PDF vào đây hoặc bấm để chọn"}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                      PDF · tối đa {MAX_UPLOAD_LABEL}
                                    </span>
                                  </span>
                                </button>

                                {lesson.slides > 0 && (
                                  <div className="mt-8 border-t border-black/10 pt-6">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <h4 className="text-sm font-semibold text-foreground">
                                        Trang trong tài liệu
                                      </h4>
                                      <span className="text-xs text-muted-foreground">
                                        Bấm một trang để xem trước
                                      </span>
                                    </div>
                                    <SlidePreview key={lesson.id} lessonId={lesson.id} />
                                    <KeySlideControls
                                      lessonId={lesson.id}
                                      courseId={courseId}
                                      canDelete={canManage}
                                    />
                                  </div>
                                )}
                              </div>
                              )
                            )}
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
                                <p className="mt-0.5 text-xs text-black/40">
                                  {activeLesson.kind === "quiz"
                                    ? `${activeLesson.questionCount ?? 0} câu · ${activeLesson.durationMinutes ?? 0} phút`
                                    : `${activeLesson.slides} trang slide`}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </DragOverlay>
                      </DndContext>

                      {module.lessons.length === 0 && (
                        <p className="mx-2 rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] px-6 py-5 text-sm text-black/45 sm:ml-12">
                          Chương này chưa có bài học.
                        </p>
                      )}
                      {canManage && (
                        <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:pl-12">
                          <Button variant="ghost" className="rounded-full" size="sm" onClick={() => addLesson(module.id)} disabled={saving}>
                            <Icon name="ri-add-line" className="size-4" />
                            Thêm bài học
                          </Button>
                          <Button variant="ghost" className="rounded-full" size="sm" onClick={() => addQuiz(module.id)} disabled={saving}>
                            <Icon name="ri-file-text-line" className="size-4" />
                            Thêm bài tập
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>

      <ConfirmDialog
        open={moduleToDelete !== null}
        onOpenChange={(open) => !open && setModuleToDelete(null)}
        title={moduleToDelete ? `Xóa chương "${moduleToDelete.title}"?` : "Xóa chương?"}
        description={
          moduleToDelete && moduleToDelete.lessons.length > 0
            ? "Các bài học thuộc chương này cũng sẽ bị xóa."
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
        title={lessonToDelete ? `Xóa bài "${lessonToDelete.title}"?` : "Xóa bài học?"}
        description="Bài học và slide liên quan sẽ bị xóa khỏi khóa học."
        confirmLabel="Xóa bài học"
        destructive
        onConfirm={async () => {
          if (!lessonToDelete) return;
          const target = lessonToDelete;
          setLessonToDelete(null);
          try {
            await deleteLesson(target.id);
            if (selection === target.id) setSelection(null);
            refreshTree();
            flash("ok", `Đã xóa bài "${target.title}".`);
          } catch (e) {
            flash("err", `Không xóa được bài học: ${errText(e)}`);
          }
        }}
      />
      <ConfirmDialog
        open={confirmDeleteCourse}
        onOpenChange={setConfirmDeleteCourse}
        title="Xóa khóa học này?"
        description="Khóa học cùng toàn bộ nội dung và đăng ký liên quan sẽ bị xóa. Không thể hoàn tác."
        confirmLabel="Xóa khóa học"
        destructive
        onConfirm={handleDeleteCourse}
      />
    </div>
  );
}
