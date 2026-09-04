'use client';

// components/teacher/workspace/content-tab.tsx — Tab Nội dung
// Tạo mới HOẶC chỉnh sửa khóa học — tất cả mutation gọi thẳng FastAPI:
//   - Khóa học: POST/PATCH/DELETE /teacher/courses
//   - Chương:   POST/DELETE /teacher/courses/{id}/modules, PATCH /teacher/modules/{id}
//   - Bài học:  POST/DELETE /teacher/modules/{id}/lessons, PATCH /teacher/lessons/{id}
//   - PDF:      POST /teacher/lessons/{id}/slides/upload (backend render từng trang ra JPEG)

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ConfirmDialog, EmptyState, INPUT_CLS } from './workspace-ui';
import { useCourseTree, useTeacherCourses } from '@/hooks/use-teacher';
import {
  addCourseStudents,
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  fetchStudentDirectory,
  updateCourse,
  updateLesson,
  updateModule,
  uploadLessonPdf,
} from '@/lib/api/teacher';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, resolveMediaUrl } from '@/lib/api/client';
import { LEVEL_LABEL } from '@/lib/mock/teacher';
import type { CourseStatus, LessonNode, Level, ModuleNode } from '@/lib/types/domain';

// ---- State cho form tạo mới 1 trang (chương → bài → PDF + học viên) ----
interface NewLessonDraft {
  key: number;
  title: string;
  file: File | null;
}

interface NewChapterDraft {
  key: number;
  title: string;
  lessons: NewLessonDraft[];
}

function slideImageUrl(lessonId: string, page: number) {
  return resolveMediaUrl(`/media/lessons/${lessonId}/slide_${String(page).padStart(3, '0')}.jpg`);
}

// Xem trước slide vừa upload: thumbnail từng trang + lightbox phóng to.
// URL ảnh suy từ quy ước backend render PDF (`slide_{NNN}.jpg`), không cần
// endpoint riêng nên giáo viên được phân công cũng xem được.
function SlidePreview({ lessonId, slideCount }: { lessonId: string; slideCount: number }) {
  // Component được remount theo key={lessonId} từ phía cha nên state
  // khởi tạo mới cho mỗi bài học, không cần reset trong effect.
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (preview === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
      if (event.key === 'ArrowLeft') setPreview((v) => (v === null ? v : (v - 1 + slideCount) % slideCount));
      if (event.key === 'ArrowRight') setPreview((v) => (v === null ? v : (v + 1) % slideCount));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, slideCount]);

  if (slideCount === 0) return null;

  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: slideCount }, (_, i) => i + 1).map((page) => {
          const url = slideImageUrl(lessonId, page);
          if (!url || failed[page]) {
            return (
              <div
                key={page}
                className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-card text-xs font-medium tabular-nums text-muted-foreground"
                title={`Trang ${page}`}
              >
                {page}
              </div>
            );
          }
          return (
            <button
              key={page}
              type="button"
              onClick={() => setPreview(page)}
              title={`Xem trước trang ${page}`}
              aria-label={`Xem trước trang ${page}`}
              className="group overflow-hidden rounded-md border border-border bg-white outline-none transition hover:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Trang ${page}`}
                loading="lazy"
                onError={() => setFailed((prev) => ({ ...prev, [page]: true }))}
                className="aspect-[4/3] w-full object-contain transition group-hover:scale-[1.02]"
              />
            </button>
          );
        })}
      </div>

      {preview !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Đóng xem trước"
            className="absolute inset-0 cursor-default bg-brand-dark/70"
            onClick={() => setPreview(null)}
          />
          <div className="relative flex max-h-full w-full max-w-4xl flex-col rounded-xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                Trang {preview} / {slideCount}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Đóng xem trước"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Icon name="ri-close-line" className="text-lg" />
              </button>
            </div>
            {(() => {
              const url = slideImageUrl(lessonId, preview);
              return url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={preview}
                  src={url}
                  alt={`Trang ${preview}`}
                  className="mt-3 max-h-[70dvh] w-full rounded-lg bg-white object-contain"
                />
              ) : (
                <p className="mt-3 rounded-lg bg-muted px-3 py-8 text-center text-sm text-muted-foreground">
                  Không tải được ảnh trang {preview}.
                </p>
              );
            })()}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview((v) => (v === null ? v : (v - 2 + slideCount) % slideCount + 1))}
                disabled={slideCount <= 1}
              >
                <Icon name="ri-arrow-left-line" data-icon="inline-start" />
                Trang trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview((v) => (v === null ? v : (v % slideCount) + 1))}
                disabled={slideCount <= 1}
              >
                Trang sau
                <Icon name="ri-arrow-right-line" data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type Selection =
  | { type: 'module'; id: string }
  | { type: 'lesson'; id: string }
  | null;

type StructureMenuKey = { type: 'module' | 'lesson'; id: string } | null;

type StructureMenuAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  separated?: boolean;
};

function sameMenu(a: StructureMenuKey, b: Exclude<StructureMenuKey, null>) {
  return a?.type === b.type && a.id === b.id;
}

function StructureMenu({
  menu,
  openMenu,
  setOpenMenu,
  label,
  actions,
  widthClass = 'w-40',
}: {
  menu: Exclude<StructureMenuKey, null>;
  openMenu: StructureMenuKey;
  setOpenMenu: (menu: StructureMenuKey) => void;
  label: string;
  actions: StructureMenuAction[];
  widthClass?: string;
}) {
  const isOpen = sameMenu(openMenu, menu);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const closeMenu = useCallback(() => {
    setOpenMenu(null);
  }, [setOpenMenu]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const content = menuRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = content?.offsetWidth ?? (widthClass === 'w-36' ? 144 : 160);
    const menuHeight = content?.offsetHeight ?? 128;
    const gap = 8;
    const margin = 8;
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - gap - menuHeight;
    const top =
      belowTop + menuHeight <= window.innerHeight - margin
        ? belowTop
        : Math.max(margin, aboveTop);
    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      window.innerWidth - menuWidth - margin,
    );

    setPosition({ top, left });
  }, [widthClass]);

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
      }
    };
    const onReposition = () => closeMenu();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [closeMenu, isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title="Thao tác"
        onClick={(event) => {
          event.stopPropagation();
          setOpenMenu(isOpen ? null : menu);
        }}
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Icon name="ri-more-2-fill" className="text-lg" aria-hidden />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`fixed z-[80] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg ${widthClass}`}
            style={{ top: position.top, left: position.left }}
          >
            {actions.map((action) => (
              <div key={action.label}>
                {action.separated && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm outline-none transition hover:bg-muted focus-visible:bg-muted ${
                    action.destructive ? 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10' : 'text-foreground'
                  }`}
                  onClick={() => {
                    closeMenu();
                    action.onSelect();
                  }}
                >
                  {action.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function ContentTab({ isNew, embed = false }: { isNew: boolean; embed?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const courseIdFromUrl = String(params?.courseId ?? '');
  const { data: courses = [] } = useTeacherCourses();
  const course = useMemo(
    () => courses.find((c) => c.id === courseIdFromUrl),
    [courses, courseIdFromUrl],
  );
  const validCourseId = course?.id ?? courseIdFromUrl;
  const isOwner = isNew || (course?.isOwner ?? true);
  const { data: tree = [], isFetching: treeFetching } = useCourseTree(validCourseId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<Level>('beginner');
  // Form tạo mới 1 trang: danh sách chương, mỗi chương có bài + file PDF.
  const [newChapters, setNewChapters] = useState<NewChapterDraft[]>([
    { key: 0, title: '', lessons: [{ key: 0, title: '', file: null }] },
  ]);
  const [draftKey, setDraftKey] = useState(1);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<string | null>(null);

  const { data: studentDirectory = [] } = useQuery({
    queryKey: ['teacher', 'student-directory'],
    queryFn: () => fetchStudentDirectory(),
    enabled: isNew,
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ type: 'module' | 'lesson'; id: string } | null>(null);
  const [openMenu, setOpenMenu] = useState<StructureMenuKey>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LessonNode | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<ModuleNode | null>(null);
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [dragOverZone, setDragOverZone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const statusTimer = useRef<number>(0);

  useEffect(() => {
    if (isNew || hydratedRef.current || !course) return;
    hydratedRef.current = true;
    setTitle(course.title);
    setDescription(course.description);
  }, [isNew, course]);

  const flash = useCallback((tone: 'ok' | 'err', text: string) => {
    setStatusMsg({ tone, text });
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatusMsg(null), 6000);
  }, []);

  const refreshTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['teacher', 'courses'] });
    if (validCourseId) {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-tree', validCourseId] });
    }
  }, [queryClient, validCourseId]);

  const errText = (e: unknown) =>
    e instanceof Error ? e.message : 'Lỗi không xác định';

  // ---- Chọn tự động bài/chương đầu tiên khi tree tải xong (render-phase adjust) ----
  if (!isNew && !selection && tree.length > 0) {
    const firstLesson = tree[0]?.lessons[0] ?? null;
    setSelection(
      firstLesson
        ? { type: 'lesson', id: firstLesson.id }
        : { type: 'module', id: tree[0].id },
    );
  }

  const selectedModule =
    selection?.type === 'module' ? tree.find((m) => m.id === selection.id) ?? null : null;

  let selectedLessonContext: { module: ModuleNode; lesson: LessonNode } | null = null;
  if (selection?.type === 'lesson') {
    for (const m of tree) {
      const lesson = m.lessons.find((l) => l.id === selection.id);
      if (lesson) {
        selectedLessonContext = { module: m, lesson };
        break;
      }
    }
  }

  const selectedLesson = selectedLessonContext?.lesson ?? null;
  const selectedModuleForAdd = selectedModule ?? selectedLessonContext?.module ?? tree[0] ?? null;

  const totalLessons = tree.flatMap((m) => m.lessons).length;
  const totalSlides = tree
    .flatMap((m) => m.lessons)
    .reduce((sum, lesson) => sum + lesson.slides, 0);
  const canPublish =
    title.trim().length > 0 &&
    tree.length > 0 &&
    totalLessons > 0 &&
    totalSlides > 0;

  // ---- Khóa học: tạo mới / lưu đổi / xóa ----
  const saveCourse = async (status: CourseStatus) => {
    if (!title.trim()) {
      flash('err', 'Cần nhập tên khóa học trước khi lưu.');
      return;
    }
    if (status === 'published' && !canPublish) {
      flash('err', 'Cần có tên, mô tả, chương, bài học và slide trước khi xuất bản.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createCourse({
          title: title.trim(),
          description: description.trim() || undefined,
          level,
          status,
        });
        router.replace(`/teacher/courses/${created.id}?tab=content`);
        return;
      }
      const saved = await updateCourse(validCourseId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
      });
      refreshTree();
      flash('ok', `Đã ${status === 'published' ? 'xuất bản' : 'lưu nháp'} "${saved.title}".`);
    } catch (e) {
      flash('err', `Không lưu được khóa học: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async () => {
    try {
      await deleteCourse(validCourseId);
      router.push('/teacher/courses');
      router.refresh();
    } catch (e) {
      flash('err', `Không xóa được khóa học: ${errText(e)}`);
      setConfirmDeleteCourse(false);
    }
  };

  // ---- Form tạo mới 1 trang: chương → bài → PDF + học viên ----
  const patchNewChapter = (key: number, patch: Partial<NewChapterDraft>) => {
    setNewChapters((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const addNewChapter = () => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) => [
      ...prev,
      { key, title: '', lessons: [{ key: 0, title: '', file: null }] },
    ]);
  };

  const removeNewChapter = (key: number) => {
    setNewChapters((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)));
  };

  const addNewLesson = (chapterKey: number) => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey
          ? { ...c, lessons: [...c.lessons, { key, title: '', file: null }] }
          : c,
      ),
    );
  };

  const patchNewLesson = (chapterKey: number, lessonKey: number, patch: Partial<NewLessonDraft>) => {
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey
          ? {
              ...c,
              lessons: c.lessons.map((l) => (l.key === lessonKey ? { ...l, ...patch } : l)),
            }
          : c,
      ),
    );
  };

  const removeNewLesson = (chapterKey: number, lessonKey: number) => {
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey && c.lessons.length > 1
          ? { ...c, lessons: c.lessons.filter((l) => l.key !== lessonKey) }
          : c,
      ),
    );
  };

  const toggleNewStudent = (id: string) => {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  // Validate toàn form: tên khóa học + mỗi chương có tên & ≥1 bài có tên & mỗi bài có PDF.
  const newFormIssues = useMemo(() => {
    const issues: string[] = [];
    if (!title.trim()) issues.push('Tên khóa học');
    if (newChapters.length === 0 || newChapters.some((c) => !c.title.trim())) {
      issues.push('Tên từng chương');
    }
    if (newChapters.some((c) => c.lessons.length === 0 || c.lessons.some((l) => !l.title.trim()))) {
      issues.push('Tên từng bài học');
    }
    if (newChapters.some((c) => c.lessons.some((l) => !l.file))) {
      issues.push('File PDF cho từng bài học');
    }
    return issues;
  }, [title, newChapters]);

  const filteredDirectory = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return studentDirectory;
    return studentDirectory.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [studentDirectory, studentQuery]);

  // Tạo tất cả trong 1 lần bấm: khóa học → chương → bài → PDF → học viên → xuất bản.
  const createFullCourse = async () => {
    if (newFormIssues.length > 0) {
      flash('err', `Còn thiếu: ${newFormIssues.join(', ')}.`);
      return;
    }
    setCreating(true);
    setCreateStep(null);
    try {
      setCreateStep('Đang tạo khóa học…');
      const created = await createCourse({
        title: title.trim(),
        description: description.trim() || undefined,
        level,
        status: 'draft',
      });
      for (const chapter of newChapters) {
        setCreateStep(`Đang tạo chương "${chapter.title.trim()}"…`);
        const mod = await createModule(created.id, chapter.title.trim());
        for (const lesson of chapter.lessons) {
          setCreateStep(`Đang tải PDF cho bài "${lesson.title.trim()}"…`);
          const createdLesson = await createLesson(mod.id, lesson.title.trim());
          const pdf = lesson.file as File;
          if (pdf.size > MAX_UPLOAD_BYTES) {
            throw new Error(`File "${pdf.name}" vượt quá ${MAX_UPLOAD_LABEL} cho phép.`);
          }
          await uploadLessonPdf(createdLesson.id, pdf, pdf.name);
        }
      }
      if (selectedStudents.length > 0) {
        setCreateStep('Đang thêm học viên…');
        await addCourseStudents(created.id, selectedStudents);
      }
      setCreateStep('Đang xuất bản…');
      await updateCourse(created.id, { status: 'published' });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'courses'] });
      router.replace(`/teacher/courses/${created.id}?tab=content`);
    } catch (e) {
      flash('err', `Không tạo được khóa học: ${errText(e)}`);
      setCreating(false);
      setCreateStep(null);
    }
  };

  // ---- Chương ----
  const addModule = async () => {
    if (!validCourseId) return;
    setSaving(true);
    try {
      await createModule(validCourseId, `Chương ${tree.length + 1}: Chưa đặt tên`);
      refreshTree();
      flash('ok', 'Đã thêm chương.');
    } catch (e) {
      flash('err', `Không thêm được chương: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const commitRenameModule = async (id: string, value = '') => {
    const clean = (renaming?.type === 'module' && renaming.id === id ? value : '')
      .trim();
    setRenaming(null);
    if (!clean) return;
    try {
      await updateModule(id, clean);
      refreshTree();
    } catch (e) {
      flash('err', `Không đổi tên được: ${errText(e)}`);
    }
  };

  const handleDeleteModule = async () => {
    if (!moduleToDelete) return;
    const target = moduleToDelete;
    setModuleToDelete(null);
    try {
      await deleteModule(target.id);
      setSelection(null);
      refreshTree();
      flash('ok', `Đã xóa chương "${target.title}".`);
    } catch (e) {
      flash('err', `Không xóa được chương: ${errText(e)}`);
    }
  };

  // ---- Bài học ----
  const addLesson = async (moduleId: string) => {
    if (!validCourseId) return;
    setSaving(true);
    try {
      const created = await createLesson(moduleId, 'Bài học mới');
      setSelection({ type: 'lesson', id: created.id });
      setExpanded((prev) => ({ ...prev, [moduleId]: true }));
      refreshTree();
      flash('ok', 'Đã thêm bài học.');
    } catch (e) {
      flash('err', `Không thêm được bài học: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const commitRenameLesson = async (id: string, value = '') => {
    const clean = (renaming?.type === 'lesson' && renaming.id === id ? value : '')
      .trim();
    setRenaming(null);
    if (!clean) return;
    try {
      await updateLesson(id, clean);
      refreshTree();
    } catch (e) {
      flash('err', `Không đổi tên được: ${errText(e)}`);
    }
  };

  const handleDeleteLesson = async () => {
    if (!lessonToDelete) return;
    const target = lessonToDelete;
    setLessonToDelete(null);
    try {
      await deleteLesson(target.id);
      if (selection?.type === 'lesson' && selection.id === target.id) setSelection(null);
      refreshTree();
      flash('ok', `Đã xóa bài "${target.title}".`);
    } catch (e) {
      flash('err', `Không xóa được bài học: ${errText(e)}`);
    }
  };

  // ---- PDF → slide ----
  const handleFiles = async (files: FileList | File[]) => {
    if (!selectedLesson) return;
    const list = Array.from(files);
    const pdf = list.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) {
      flash('err', 'Vui lòng chọn file PDF.');
      return;
    }
    if (pdf.size > MAX_UPLOAD_BYTES) {
      flash('err', `File PDF "${pdf.name}" có kích thước ${(pdf.size / (1024 * 1024)).toFixed(1)}MB, vượt quá ${MAX_UPLOAD_LABEL} cho phép.`);
      return;
    }
    setUploading(true);
    try {
      await uploadLessonPdf(selectedLesson.id, pdf, pdf.name);
      refreshTree();
      flash('ok', `Đã render ${'slide'} từ "${pdf.name}".`);
    } catch (e) {
      flash('err', `Không upload được PDF: ${errText(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const currentStatus: CourseStatus = course?.status ?? 'draft';
  const currentStatusLabel =
    currentStatus === 'published'
      ? 'Đã xuất bản'
      : currentStatus === 'archived'
        ? 'Lưu trữ'
        : 'Bản nháp';
  const currentStatusClass =
    currentStatus === 'published'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : currentStatus === 'archived'
        ? 'border-border bg-muted text-muted-foreground'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  if (isNew) {
    // Luồng tạo mới 1 trang: điền toàn bộ tên khóa học → chương → bài → PDF
    // (+ học viên tùy chọn) rồi bấm 1 nút duy nhất để tạo và xuất bản.
    return (
      <div className="mx-auto max-w-4xl py-8 sm:py-12">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                Khóa học mới
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">Tạo khóa học mới</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Điền đầy đủ thông tin trong cùng một trang rồi bấm “Tạo và xuất bản”.
                Trường có dấu <span className="font-semibold text-destructive">*</span> là bắt buộc.
              </p>
            </div>
            <span className="inline-flex w-fit rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              Bản nháp
            </span>
          </div>

          {/* 1. Thông tin khóa học */}
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-foreground">1. Thông tin khóa học</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div>
                <label htmlFor="new-course-title" className="mb-1.5 block text-sm font-medium text-foreground">
                  Tên khóa học <span className="text-destructive">*</span>
                </label>
                <input
                  id="new-course-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Lập trình Python cơ bản"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label htmlFor="new-course-level" className="mb-1.5 block text-sm font-medium text-foreground">
                  Trình độ
                </label>
                <select
                  id="new-course-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Level)}
                  className={INPUT_CLS}
                >
                  {(Object.keys(LEVEL_LABEL) as Level[]).map((lv) => (
                    <option key={lv} value={lv}>{LEVEL_LABEL[lv]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="new-course-description" className="mb-1.5 block text-sm font-medium text-foreground">
                Mô tả
              </label>
              <textarea
                id="new-course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Tóm tắt nội dung, mục tiêu khóa học..."
                className={`${INPUT_CLS} min-h-28 resize-y`}
              />
            </div>
          </section>

          {/* 2. Chương + bài + PDF */}
          <section className="mt-8 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">2. Chương, bài học và slide</h3>
              <Button type="button" variant="outline" size="sm" onClick={addNewChapter} disabled={creating}>
                <Icon name="ri-add-line" data-icon="inline-start" />
                Thêm chương
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {newChapters.map((chapter, ci) => (
                <div key={chapter.key} className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                      {String(ci + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`new-chapter-${chapter.key}`}
                        className="mb-1.5 block text-sm font-medium text-foreground"
                      >
                        Tên chương <span className="text-destructive">*</span>
                      </label>
                      <input
                        id={`new-chapter-${chapter.key}`}
                        value={chapter.title}
                        onChange={(e) => patchNewChapter(chapter.key, { title: e.target.value })}
                        placeholder={`Chương ${ci + 1}: nhập tên chương`}
                        disabled={creating}
                        className={INPUT_CLS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNewChapter(chapter.key)}
                      disabled={creating || newChapters.length <= 1}
                      title="Xóa chương"
                      aria-label={`Xóa chương ${ci + 1}`}
                      className="mt-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="ri-delete-bin-line" />
                    </button>
                  </div>

                  <div className="ml-0 mt-4 space-y-3 border-l-2 border-border pl-3 sm:ml-4">
                    {chapter.lessons.map((lesson, li) => (
                      <div key={lesson.key} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`new-lesson-${chapter.key}-${lesson.key}`}
                              className="mb-1.5 block text-sm font-medium text-foreground"
                            >
                              Tên bài <span className="text-destructive">*</span>
                            </label>
                            <input
                              id={`new-lesson-${chapter.key}-${lesson.key}`}
                              value={lesson.title}
                              onChange={(e) => patchNewLesson(chapter.key, lesson.key, { title: e.target.value })}
                              placeholder={`Bài ${li + 1}: nhập tên bài`}
                              disabled={creating}
                              className={INPUT_CLS}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeNewLesson(chapter.key, lesson.key)}
                            disabled={creating || chapter.lessons.length <= 1}
                            title="Xóa bài"
                            aria-label={`Xóa bài ${li + 1}`}
                            className="mt-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Icon name="ri-delete-bin-line" />
                          </button>
                        </div>
                        <div className="mt-3">
                          <label
                            htmlFor={`new-pdf-${chapter.key}-${lesson.key}`}
                            className="mb-1.5 block text-sm font-medium text-foreground"
                          >
                            File PDF slide <span className="text-destructive">*</span>
                          </label>
                          <input
                            id={`new-pdf-${chapter.key}-${lesson.key}`}
                            type="file"
                            accept="application/pdf"
                            disabled={creating}
                            onChange={(e) => patchNewLesson(chapter.key, lesson.key, {
                              file: e.target.files?.[0] ?? null,
                            })}
                            className="block w-full cursor-pointer rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {lesson.file
                              ? `${lesson.file.name} (${(lesson.file.size / (1024 * 1024)).toFixed(1)}MB · tối đa ${MAX_UPLOAD_LABEL})`
                              : `PDF · tối đa ${MAX_UPLOAD_LABEL} — mỗi trang PDF thành 1 slide.`}
                          </p>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addNewLesson(chapter.key)}
                      disabled={creating}
                      className="w-full justify-start text-muted-foreground"
                    >
                      <Icon name="ri-add-line" data-icon="inline-start" />
                      Thêm bài học vào chương này
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Học viên (tùy chọn) */}
          <section className="mt-8 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">
              3. Học viên <span className="font-normal text-muted-foreground">(tùy chọn{selectedStudents.length > 0 ? ` · đã chọn ${selectedStudents.length}` : ''})</span>
            </h3>
            <input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã sinh viên…"
              disabled={creating}
              className={`${INPUT_CLS} mt-3`}
              aria-label="Tìm học viên"
            />
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-border">
              {filteredDirectory.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {studentDirectory.length === 0 ? 'Chưa có học viên trong danh mục.' : 'Không tìm thấy học viên phù hợp.'}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredDirectory.slice(0, 50).map((s) => {
                    const checked = selectedStudents.includes(s.id);
                    return (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-muted/60">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={creating}
                            onChange={() => toggleNewStudent(s.id)}
                            className="h-4 w-4 shrink-0 accent-brand-cyan"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">{s.code}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {newFormIssues.length > 0 && (
            <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              Còn thiếu để xuất bản: {newFormIssues.join(' · ')}.
            </p>
          )}
          {createStep && (
            <p aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {createStep}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={creating || saving || !title.trim()}
              onClick={() => saveCourse('draft')}
            >
              {saving ? 'Đang lưu…' : 'Lưu nháp (bổ sung sau)'}
            </Button>
            <Button
              type="button"
              size="default"
              disabled={creating || saving || newFormIssues.length > 0}
              title={newFormIssues.length > 0 ? `Còn thiếu: ${newFormIssues.join(', ')}` : undefined}
              onClick={createFullCourse}
            >
              {creating ? 'Đang tạo…' : 'Tạo và xuất bản'}
            </Button>
          </div>
        </div>

        {statusMsg && (
          <p aria-live="polite" className={`mt-4 text-sm ${statusMsg.tone === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
            {statusMsg.text}
          </p>
        )}
      </div>
    );
  }

  const pageFrame = embed
    ? 'flex flex-col'
    : 'flex min-h-0 flex-col lg:h-[calc(100dvh-8rem)] lg:overflow-hidden';
  const gridFrame = embed
    ? 'mt-4 grid rounded-xl border border-border bg-card lg:grid-cols-[minmax(300px,34%)_minmax(0,1fr)]'
    : 'mt-4 grid flex-1 rounded-xl border border-border bg-card lg:grid-cols-[minmax(300px,34%)_minmax(0,1fr)]';

  return (
    <div className={pageFrame}>
      <header
        className={
          embed
            ? 'shrink-0 rounded-xl border border-border bg-card p-4 sm:p-5'
            : 'shrink-0 border-b border-border bg-muted pb-4'
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">{title || course?.title || 'Nội dung khóa học'}</h2>
              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${currentStatusClass}`}>
                {currentStatusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {embed
                ? 'Quản lý thông tin khóa học, cấu trúc chương – bài học và tài liệu PDF.'
                : 'Quản lý cấu trúc bài học và tài liệu PDF của khóa học.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{tree.length} chương</span>
              <span>{totalLessons} bài học</span>
              <span>{totalSlides} trang PDF</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {isOwner && (
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={saving || !title.trim()}
                onClick={() => saveCourse('draft')}
              >
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            )}
            {isOwner && (
              <Button
                type="button"
                size="default"
                disabled={saving || !canPublish}
                title={!canPublish ? 'Cần có tên, chương, bài học và slide trước khi xuất bản' : undefined}
                onClick={() => saveCourse('published')}
              >
                {saving ? 'Đang lưu…' : 'Xuất bản'}
              </Button>
            )}
            {isOwner && !isNew && (
              <Button
                type="button"
                variant="destructive"
                size="default"
                className="border border-destructive/25 bg-card hover:bg-destructive/10 sm:ml-3"
                onClick={() => setConfirmDeleteCourse(true)}
              >
                Xóa khóa học
              </Button>
            )}
          </div>
        </div>

        <section className="mt-5 rounded-lg border border-border bg-muted p-4">
          <div className="grid gap-5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Thông tin khóa học</h3>
              <div className="mt-4 grid w-full gap-4">
                <div>
                  <label htmlFor="course-title" className="mb-1.5 block text-sm font-medium text-foreground">
                    Tên khóa học <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="course-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    readOnly={!isOwner}
                    className={`${INPUT_CLS} ${isOwner ? '' : 'cursor-not-allowed bg-muted text-muted-foreground'}`}
                  />
                </div>
                <div>
                  <label htmlFor="course-description" className="mb-1.5 block text-sm font-medium text-foreground">
                    Mô tả
                  </label>
                  <textarea
                    id="course-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    readOnly={!isOwner}
                    rows={4}
                    className={`${INPUT_CLS} min-h-28 resize-y ${isOwner ? '' : 'cursor-not-allowed bg-muted text-muted-foreground'}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {statusMsg && (
          <p aria-live="polite" className={`mt-3 text-sm ${statusMsg.tone === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
            {statusMsg.text}
          </p>
        )}
      </header>

      <div className={gridFrame}>
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cấu trúc khóa học
                {treeFetching && <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              </p>
            </div>

            {tree.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="py-8"
                  icon={<Icon name="ri-git-branch-line" className="text-2xl text-muted-foreground" />}
                  title="Chưa có chương nào"
                  desc="Tạo chương đầu tiên để bắt đầu xây dựng khóa học."
                >
                  {isOwner ? (
                    <Button type="button" className="mt-4" onClick={addModule} disabled={saving}>
                      Tạo chương đầu tiên
                    </Button>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">Bạn được phân công hỗ trợ khóa học này.</p>
                  )}
                </EmptyState>
              </div>
            ) : (
              <div className="px-2 py-3 lg:overflow-y-auto">
                {tree.map((module, moduleIndex) => {
                  const moduleActive = selection?.type === 'module' && selection.id === module.id;
                  const isExpanded = expanded[module.id] ?? true;

                  return (
                    <section key={module.id} className="mb-3 rounded-lg border border-border bg-card">
                      <div
                        className={`group flex items-center gap-2 rounded-t-lg px-2 py-2 ${
                          moduleActive ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [module.id]: !isExpanded }))}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-card hover:text-foreground"
                          aria-label={isExpanded ? `Thu gọn ${module.title}` : `Mở rộng ${module.title}`}
                          title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                        >
                          <Icon name="ri-arrow-right-s-line" className={`transition ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelection({ type: 'module', id: module.id })}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                            {String(moduleIndex + 1).padStart(2, '0')}
                          </span>
                          {renaming?.type === 'module' && renaming.id === module.id ? (
                            <input
                              autoFocus
                              defaultValue={module.title}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={(event) => {
                                commitRenameModule(module.id, event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                                if (event.key === 'Escape') setRenaming(null);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-ring px-2 py-1 text-sm font-medium outline-none ring-2 ring-ring/25"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={module.title}>{module.title}</span>
                          )}
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {module.lessons.length} bài
                          </span>
                        </button>

                        {isOwner && (
                          <StructureMenu
                            menu={{ type: 'module', id: module.id }}
                            openMenu={openMenu}
                            setOpenMenu={setOpenMenu}
                            label={`Mở menu chương ${module.title}`}
                            actions={[
                              {
                                label: 'Đổi tên',
                                onSelect: () => setRenaming({ type: 'module', id: module.id }),
                              },
                              {
                                label: 'Thêm bài học',
                                onSelect: () => {
                                  void addLesson(module.id);
                                },
                              },
                              {
                                label: 'Xóa chương',
                                destructive: true,
                                separated: true,
                                onSelect: () => setModuleToDelete(module),
                              },
                            ]}
                          />
                        )}
                      </div>

                      {isExpanded && (
                        <div className="ml-10 mt-1 space-y-0.5 border-l border-border pl-2">
                          {module.lessons.length === 0 && (
                            <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
                              Chương này chưa có bài học. Thêm bài đầu tiên để upload PDF.
                            </p>
                          )}
                          {module.lessons.map((lesson, lessonIndex) => {
                            const lessonActive = selection?.type === 'lesson' && selection.id === lesson.id;

                            return (
                              <div key={lesson.id} className="group flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelection({ type: 'lesson', id: lesson.id })}
                                  className={`relative flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                                    lessonActive
                                      ? 'bg-accent font-medium text-primary before:absolute before:-left-[9px] before:top-2 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
                                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                  }`}
                                >
                                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {lessonIndex + 1}
                                  </span>
                                  <Icon name="ri-book-open-line" className="shrink-0 text-sm text-muted-foreground" />
                                  {renaming?.type === 'lesson' && renaming.id === lesson.id ? (
                                    <input
                                      autoFocus
                                      defaultValue={lesson.title}
                                      onClick={(event) => event.stopPropagation()}
                                      onBlur={(event) => {
                                        commitRenameLesson(lesson.id, event.target.value);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                                        if (event.key === 'Escape') setRenaming(null);
                                      }}
                                      className="min-w-0 flex-1 rounded-md border border-ring px-2 py-1 text-sm outline-none ring-2 ring-ring/25"
                                    />
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate" title={lesson.title}>{lesson.title}</span>
                                  )}
                                  {lesson.slides > 0 && (
                                    <span className="shrink-0 text-xs font-normal text-muted-foreground">{lesson.slides} trang</span>
                                  )}
                                </button>

                                {isOwner && (
                                  <StructureMenu
                                    menu={{ type: 'lesson', id: lesson.id }}
                                    openMenu={openMenu}
                                    setOpenMenu={setOpenMenu}
                                    label={`Mở menu bài học ${lesson.title}`}
                                    widthClass="w-36"
                                    actions={[
                                      {
                                        label: 'Đổi tên',
                                        onSelect: () => setRenaming({ type: 'lesson', id: lesson.id }),
                                      },
                                      {
                                        label: 'Xóa bài',
                                        destructive: true,
                                        separated: true,
                                        onSelect: () => setLessonToDelete(lesson),
                                      },
                                    ]}
                                  />
                                )}
                              </div>
                            );
                          })}

{isOwner && selectedModuleForAdd?.id === module.id && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="mt-1 w-full justify-start text-muted-foreground"
                            onClick={() => addLesson(module.id)}
                            disabled={saving}
                          >
                            <Icon name="ri-add-line" data-icon="inline-start" />
                            {module.lessons.length === 0 ? 'Thêm bài học đầu tiên' : 'Thêm bài học'}
                          </Button>
                        )}
                        </div>
                      )}
                    </section>
                  );
                })}

                {isOwner && (
                <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={addModule} disabled={saving}>
                  <Icon name="ri-add-line" data-icon="inline-start" />
                  Thêm chương
                </Button>
              )}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {!selectedLessonContext && !selectedModule && (
            <EmptyState
              className="min-h-[420px] justify-center p-10"
              icon={<Icon name="ri-book-open-line" className="text-2xl text-muted-foreground" />}
              title="Chọn một chương hoặc bài học"
              desc="Chọn nội dung ở danh sách bên trái để bắt đầu chỉnh sửa."
            />
          )}

          {selectedModule && !selectedLessonContext && (
            <div className="mx-auto max-w-2xl p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Chương {String(tree.findIndex((m) => m.id === selectedModule.id) + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{selectedModule.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {selectedModule.lessons.length > 0
                  ? `${selectedModule.lessons.length} bài học trong chương này.`
                  : 'Chương này chưa có bài học.'}
              </p>
              {isOwner && (
                <Button type="button" variant="outline" size="sm" className="mt-5" onClick={() => addLesson(selectedModule.id)} disabled={saving}>
                  <Icon name="ri-add-line" data-icon="inline-start" />
                  Thêm bài học vào chương
                </Button>
              )}
            </div>
          )}

          {selectedLessonContext && (
            <div className="mx-auto max-w-5xl p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bài học / PDF</p>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{selectedLessonContext.lesson.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Chương {tree.findIndex((m) => m.id === selectedLessonContext.module.id) + 1} · {selectedLessonContext.module.title}
              </p>

              <section className="mt-8 border-b border-border pb-8">
                  <h4 className="text-sm font-semibold text-foreground">Thông tin bài học</h4>
                <div className="mt-4">
                  <label htmlFor="lesson-title" className="mb-1.5 block text-sm font-medium text-foreground">
                    Tên bài <span className="text-destructive">*</span>
                  </label>
                  <input
                    key={selectedLessonContext.lesson.id}
                    id="lesson-title"
                    defaultValue={selectedLessonContext.lesson.title}
                    readOnly={!isOwner}
                    className={`${INPUT_CLS} ${isOwner ? '' : 'cursor-not-allowed bg-muted text-muted-foreground'}`}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (!value || value === selectedLessonContext?.lesson.title) return;
                      void updateLesson(selectedLessonContext.lesson.id, value)
                        .then(refreshTree)
                        .catch((e) => flash('err', `Không đổi tên được: ${errText(e)}`));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              </section>

              <section className="py-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-base font-semibold text-foreground">PDF bài học</h4>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      Upload PDF — backend render từng trang thành ảnh slide cho học viên xem.
                      File mới sẽ thay thế toàn bộ slide cũ của bài.
                    </p>
                  </div>
                </div>

                <input
                  ref={fileRef}
                  id="lesson-pdf"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) void handleFiles(event.target.files);
                    event.target.value = '';
                  }}
                />

                {selectedLessonContext.lesson.slides === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverZone(true);
                    }}
                    onDragLeave={() => setDragOverZone(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOverZone(false);
                      void handleFiles(event.dataTransfer.files);
                    }}
                    className={`mt-5 flex min-h-[260px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-8 py-14 text-center transition ${
                      dragOverZone
                        ? 'border-ring bg-accent text-primary'
                        : 'border-border bg-muted/60 text-muted-foreground hover:border-ring hover:bg-accent/50'
                    }`}
                  >
                    <Icon name="ri-upload-cloud-2-line" className="text-4xl" />
                    <p className="mt-4 text-base font-semibold text-foreground">Chưa có PDF</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">Kéo file vào đây hoặc chọn từ máy.</p>
                    <p className="mt-1 text-xs text-muted-foreground">PDF · tối đa {MAX_UPLOAD_LABEL}</p>
                    <span className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
                      {uploading ? 'Đang render slide…' : 'Chọn file PDF'}
                    </span>
                  </button>
                ) : (
                  <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-background p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">PDF bài học</p>
                        <p className="mt-1 text-sm text-muted-foreground">{selectedLessonContext.lesson.slides} trang đã render thành slide</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                          {uploading ? 'Đang render…' : 'Thay file'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 rounded-xl border border-border bg-muted/40 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">Trang trong tài liệu</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{selectedLessonContext.lesson.slides} trang · bấm để xem trước</p>
                  </div>
                  <SlidePreview
                    key={selectedLessonContext.lesson.id}
                    lessonId={selectedLessonContext.lesson.id}
                    slideCount={selectedLessonContext.lesson.slides}
                  />
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={moduleToDelete !== null}
        title={moduleToDelete ? `Xóa chương “${moduleToDelete.title}”?` : 'Xóa chương?'}
        description={moduleToDelete ? (
          moduleToDelete.lessons.length > 0
            ? 'Các bài học thuộc chương này cũng sẽ bị xóa khỏi khóa học.'
            : 'Chương này sẽ bị xóa khỏi khóa học.'
        ) : null}
        confirmLabel="Xóa chương"
        onClose={() => setModuleToDelete(null)}
        onConfirm={handleDeleteModule}
      />

      <ConfirmDialog
        open={lessonToDelete !== null}
        title={lessonToDelete ? `Xóa bài “${lessonToDelete.title}”?` : 'Xóa bài học?'}
        description="Bài học và slide liên quan sẽ bị xóa khỏi khóa học."
        confirmLabel="Xóa bài học"
        onClose={() => setLessonToDelete(null)}
        onConfirm={handleDeleteLesson}
      />

      <ConfirmDialog
        open={confirmDeleteCourse}
        title="Xóa khóa học này?"
        description={
          <>
            Khóa học <span className="font-medium text-foreground">{title || course?.title || 'này'}</span> cùng
            toàn bộ nội dung và đăng ký liên quan sẽ bị xóa. Đây là hành động có mức rủi ro cao và không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa khóa học"
        onClose={() => setConfirmDeleteCourse(false)}
        onConfirm={handleDeleteCourse}
      />
    </div>
  );
}
