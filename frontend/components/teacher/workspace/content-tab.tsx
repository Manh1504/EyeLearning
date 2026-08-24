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
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ConfirmDialog, EmptyState, INPUT_CLS } from './workspace-ui';
import { useCourseTree, useTeacherCourses } from '@/hooks/use-teacher';
import {
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  updateCourse,
  updateLesson,
  updateModule,
  uploadLessonPdf,
} from '@/lib/api/teacher';
import type { CourseStatus, LessonNode, ModuleNode } from '@/lib/types/domain';

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
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-muted hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Icon name="ri-more-2-fill" className="text-lg" aria-hidden />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`fixed z-[80] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg ${widthClass}`}
            style={{ top: position.top, left: position.left }}
          >
            {actions.map((action) => (
              <div key={action.label}>
                {action.separated && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm outline-none transition hover:bg-slate-50 focus-visible:bg-slate-50 ${
                    action.destructive ? 'text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50' : 'text-slate-700'
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
          level: 'beginner',
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
        ? 'border-slate-200 bg-slate-100 text-slate-600'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  if (isNew) {
    // Luồng tạo mới: nhập thông tin → lưu → chuyển sang workspace thật (id real).
    return (
      <div className="mx-auto max-w-3xl py-8 sm:py-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">
                Khóa học mới
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Tạo khóa học mới</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Nhập thông tin cơ bản rồi lưu khóa học trước khi thêm chương, bài học và PDF.
              </p>
            </div>
            <span className="inline-flex w-fit rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              Bản nháp
            </span>
          </div>

          <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="new-course-title" className="mb-1.5 block text-sm font-medium text-slate-700">
              Tên khóa học <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-course-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Lập trình Python cơ bản"
              className={INPUT_CLS}
            />
            <p className="mt-1.5 text-xs text-slate-400">Tên này sẽ hiển thị với học viên sau khi khóa học được xuất bản.</p>
          </div>

          <div>
            <label htmlFor="new-course-description" className="mb-1.5 block text-sm font-medium text-slate-700">
              Mô tả
            </label>
            <textarea
              id="new-course-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Tóm tắt nội dung, mục tiêu khóa học..."
              className={`${INPUT_CLS} min-h-32 resize-y`}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={saving || !title.trim()}
              onClick={() => saveCourse('draft')}
            >
              {saving ? 'Đang lưu…' : 'Lưu nháp'}
            </Button>
            <Button
              type="button"
              size="default"
              disabled={saving || !title.trim()}
              onClick={() => saveCourse('published')}
            >
              Tạo và xuất bản
            </Button>
          </div>
          </div>
        </div>

        {statusMsg && (
          <p aria-live="polite" className={`mt-4 text-sm ${statusMsg.tone === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
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
            ? 'shrink-0 rounded-xl border border-border bg-white p-4 sm:p-5'
            : 'shrink-0 border-b border-border bg-slate-50 pb-4'
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-950">{title || course?.title || 'Nội dung khóa học'}</h2>
              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${currentStatusClass}`}>
                {currentStatusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {embed
                ? 'Quản lý thông tin khóa học, cấu trúc chương – bài học và tài liệu PDF.'
                : 'Quản lý cấu trúc bài học và tài liệu PDF của khóa học.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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
                className="border border-rose-200 bg-white hover:bg-rose-50 sm:ml-3"
                onClick={() => setConfirmDeleteCourse(true)}
              >
                Xóa khóa học
              </Button>
            )}
          </div>
        </div>

        <section className="mt-5 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
          <div className="grid gap-5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Thông tin khóa học</h3>
              <div className="mt-4 grid w-full gap-4">
                <div>
                  <label htmlFor="course-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Tên khóa học <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="course-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    readOnly={!isOwner}
                    className={`${INPUT_CLS} ${isOwner ? '' : 'cursor-not-allowed bg-slate-50 text-slate-500'}`}
                  />
                </div>
                <div>
                  <label htmlFor="course-description" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Mô tả
                  </label>
                  <textarea
                    id="course-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    readOnly={!isOwner}
                    rows={4}
                    className={`${INPUT_CLS} min-h-28 resize-y ${isOwner ? '' : 'cursor-not-allowed bg-slate-50 text-slate-500'}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {statusMsg && (
          <p aria-live="polite" className={`mt-3 text-sm ${statusMsg.tone === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {statusMsg.text}
          </p>
        )}
      </header>

      <div className={gridFrame}>
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cấu trúc khóa học
                {treeFetching && <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />}
              </p>
            </div>

            {tree.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="py-8"
                  icon={<Icon name="ri-git-branch-line" className="text-2xl text-slate-400" />}
                  title="Chưa có chương nào"
                  desc="Tạo chương đầu tiên để bắt đầu xây dựng khóa học."
                >
                  {isOwner ? (
                    <Button type="button" className="mt-4" onClick={addModule} disabled={saving}>
                      Tạo chương đầu tiên
                    </Button>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400">Bạn được phân công hỗ trợ khóa học này.</p>
                  )}
                </EmptyState>
              </div>
            ) : (
              <div className="px-2 py-3 lg:overflow-y-auto">
                {tree.map((module, moduleIndex) => {
                  const moduleActive = selection?.type === 'module' && selection.id === module.id;
                  const isExpanded = expanded[module.id] ?? true;

                  return (
                    <section key={module.id} className="mb-3 rounded-lg border border-slate-100 bg-white">
                      <div
                        className={`group flex items-center gap-2 rounded-t-lg px-2 py-2 ${
                          moduleActive ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [module.id]: !isExpanded }))}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-white hover:text-slate-700"
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
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">
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
                              className="min-w-0 flex-1 rounded-md border border-cyan-300 px-2 py-1 text-sm font-medium outline-none ring-2 ring-cyan-100"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={module.title}>{module.title}</span>
                          )}
                          <span className="shrink-0 text-xs font-normal text-slate-400">
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
                        <div className="ml-10 mt-1 space-y-0.5 border-l border-slate-100 pl-2">
                          {module.lessons.length === 0 && (
                            <p className="px-2 py-3 text-xs leading-5 text-slate-400">
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
                                      ? 'bg-cyan-50 font-medium text-cyan-700 before:absolute before:-left-[9px] before:top-2 before:h-5 before:w-0.5 before:rounded-full before:bg-cyan-700'
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                  }`}
                                >
                                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                                    {lessonIndex + 1}
                                  </span>
                                  <Icon name="ri-book-open-line" className="shrink-0 text-sm text-slate-400" />
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
                                      className="min-w-0 flex-1 rounded-md border border-cyan-300 px-2 py-1 text-sm outline-none ring-2 ring-cyan-100"
                                    />
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate" title={lesson.title}>{lesson.title}</span>
                                  )}
                                  {lesson.slides > 0 && (
                                    <span className="shrink-0 text-xs font-normal text-slate-400">{lesson.slides} trang</span>
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
                            className="mt-1 w-full justify-start text-slate-500"
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
              icon={<Icon name="ri-book-open-line" className="text-2xl text-slate-400" />}
              title="Chọn một chương hoặc bài học"
              desc="Chọn nội dung ở danh sách bên trái để bắt đầu chỉnh sửa."
            />
          )}

          {selectedModule && !selectedLessonContext && (
            <div className="mx-auto max-w-2xl p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Chương {String(tree.findIndex((m) => m.id === selectedModule.id) + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedModule.title}</h3>
              <p className="mt-2 text-sm text-slate-500">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bài học / PDF</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedLessonContext.lesson.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Chương {tree.findIndex((m) => m.id === selectedLessonContext.module.id) + 1} · {selectedLessonContext.module.title}
              </p>

              <section className="mt-8 border-b border-border pb-8">
                  <h4 className="text-sm font-semibold text-slate-900">Thông tin bài học</h4>
                <div className="mt-4">
                  <label htmlFor="lesson-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Tên bài <span className="text-rose-500">*</span>
                  </label>
                  <input
                    key={selectedLessonContext.lesson.id}
                    id="lesson-title"
                    defaultValue={selectedLessonContext.lesson.title}
                    readOnly={!isOwner}
                    className={`${INPUT_CLS} ${isOwner ? '' : 'cursor-not-allowed bg-slate-50 text-slate-500'}`}
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
                    <h4 className="text-base font-semibold text-slate-900">PDF bài học</h4>
                    <p className="mt-1.5 text-sm leading-6 text-slate-500">
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
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-border bg-muted/60 text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/40'
                    }`}
                  >
                    <Icon name="ri-upload-cloud-2-line" className="text-4xl" />
                    <p className="mt-4 text-base font-semibold text-slate-800">Chưa có PDF</p>
                    <p className="mt-1.5 text-sm text-slate-500">Kéo file vào đây hoặc chọn từ máy.</p>
                    <p className="mt-1 text-xs text-slate-400">PDF · tối đa 100MB</p>
                    <span className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
                      {uploading ? 'Đang render slide…' : 'Chọn file PDF'}
                    </span>
                  </button>
                ) : (
                  <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-background p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">PDF bài học</p>
                        <p className="mt-1 text-sm text-slate-500">{selectedLessonContext.lesson.slides} trang đã render thành slide</p>
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
                    <p className="text-sm font-medium text-slate-700">Trang trong tài liệu</p>
                    <p className="text-xs tabular-nums text-slate-500">{selectedLessonContext.lesson.slides} trang</p>
                  </div>
                  <div className="mt-4 grid grid-cols-6 gap-2.5 sm:grid-cols-8 md:grid-cols-10 xl:grid-cols-12">
                    {Array.from({ length: selectedLessonContext.lesson.slides }, (_, i) => i + 1).map((page) => (
                      <div
                        key={page}
                        className="flex h-10 items-center justify-center rounded-md border border-border bg-white text-xs font-medium tabular-nums text-slate-500"
                        title={`Trang ${page}`}
                      >
                        {page}
                      </div>
                    ))}
                  </div>
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
            Khóa học <span className="font-medium text-slate-700">{title || course?.title || 'này'}</span> cùng
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
