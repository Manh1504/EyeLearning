'use client';

// components/teacher/workspace/content-tab.tsx — Tab Nội dung
// Tạo mới HOẶC chỉnh sửa khóa học (mock/local state hiện tại): cấu trúc chương → bài, PDF bài học, lưu nháp và xuất bản.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ConfirmDialog, EmptyState, INPUT_CLS } from './workspace-ui';
import { useCourseTree, useTeacherCourses } from '@/hooks/use-teacher';
import type { ModuleNode } from '@/lib/types/domain';

interface UndoPayload {
  label: string;
  restore: () => void;
}

type Selection =
  | { type: 'module'; id: string }
  | { type: 'lesson'; id: string }
  | null;

interface LessonFile {
  name: string;
  pages: number;
}

export function ContentTab({ isNew }: { isNew: boolean }) {
  const params = useParams();
  const courseId = String(params?.courseId ?? 'c1');

  const { data: courses = [] } = useTeacherCourses();
  const course = useMemo(
    () => courses.find((c) => c.id === courseId),
    [courses, courseId],
  );
  const { data: tree = [] } = useCourseTree(isNew ? '' : courseId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [slides, setSlides] = useState<number[]>([]);
  const [lessonFiles, setLessonFiles] = useState<Record<string, LessonFile>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [dragOverZone, setDragOverZone] = useState(false);
  const [renaming, setRenaming] = useState<{ type: 'module' | 'lesson'; id: string } | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<{ id: string; title: string } | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<ModuleNode | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ lessonId: string; title: string } | null>(null);
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [undo, setUndo] = useState<UndoPayload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hiện thực dữ liệu backend một lần khi tải xong (chỉ khi đang chỉnh sửa khóa học thật).
  // Điều chỉnh state ngay trong render (pattern «adjusting state when props change»).
  if (!isNew && !hydrated && (course || tree.length > 0)) {
    setHydrated(true);
    if (course) {
      setTitle(course.title);
      setDescription(course.description);
    }
    if (tree.length > 0) {
      setModules(tree);
      setExpanded(Object.fromEntries(tree.map((module) => [module.id, true])));
      const firstLesson = tree[0]?.lessons[0] ?? null;
      if (firstLesson) {
        setSelection({ type: 'lesson', id: firstLesson.id });
        setSlides(Array.from({ length: firstLesson.slides }, (_, i) => i));
        setLessonFiles({
          [firstLesson.id]: { name: `${firstLesson.title}.pdf`, pages: firstLesson.slides },
        });
      }
    }
  }

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(timer);
  }, [undo]);

  const selectedModule = useMemo(() => {
    if (selection?.type !== 'module') return null;
    return modules.find((module) => module.id === selection.id) ?? null;
  }, [modules, selection]);

  const selectedLessonContext = selection?.type === 'lesson'
    ? modules.reduce<{ module: ModuleNode; lesson: ModuleNode['lessons'][number] } | null>((found, chapter) => {
      if (found) return found;
      const lesson = chapter.lessons.find((item) => item.id === selection.id);
      return lesson ? { module: chapter, lesson } : null;
    }, null)
    : null;

  const selectedLesson = selectedLessonContext?.lesson ?? null;
  const selectedModuleForAdd = selectedModule ?? selectedLessonContext?.module ?? modules[0] ?? null;
  const selectedFile = selectedLesson ? lessonFiles[selectedLesson.id] : null;

  const totalLessons = modules.flatMap((module) => module.lessons).length;
  const totalSlides = modules.flatMap((module) => module.lessons).reduce((sum, lesson) => sum + lesson.slides, 0);
  const canPublish =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    modules.length > 0 &&
    totalLessons > 0 &&
    totalSlides > 0;

  const saveDraft = () => {
    setSaveStatus('saving');
    window.setTimeout(() => setSaveStatus('saved'), 450);
  };

  const selectModule = (moduleId: string) => {
    setSelection({ type: 'module', id: moduleId });
    setRenaming(null);
  };

  const selectLesson = (moduleId: string, lessonId: string, pageCount: number) => {
    setExpanded((prev) => ({ ...prev, [moduleId]: true }));
    setSelection({ type: 'lesson', id: lessonId });
    setSlides(Array.from({ length: pageCount }, (_, i) => i));
    setRenaming(null);
  };

  const patchSelectedLesson = (fn: (lesson: ModuleNode['lessons'][number]) => ModuleNode['lessons'][number]) => {
    if (selection?.type !== 'lesson') return;
    setModules((prev) => prev.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => (lesson.id === selection.id ? fn(lesson) : lesson)),
    })));
  };

  const renameModule = (id: string, nextTitle: string) => {
    const clean = nextTitle.trim();
    if (!clean) return;
    setModules((prev) => prev.map((module) => (module.id === id ? { ...module, title: clean } : module)));
  };

  const renameLesson = (id: string, nextTitle: string) => {
    const clean = nextTitle.trim();
    if (!clean) return;
    setModules((prev) => prev.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => (lesson.id === id ? { ...lesson, title: clean } : lesson)),
    })));
    setLessonFiles((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, name: `${clean}.pdf` } };
    });
  };

  const addModule = () => {
    const id = `m-new-${Date.now()}`;
    setModules((prev) => [...prev, { id, title: `Chương ${prev.length + 1}: Chưa đặt tên`, lessons: [] }]);
    setExpanded((prev) => ({ ...prev, [id]: true }));
    setSelection({ type: 'module', id });
  };

  const addLesson = (moduleId: string) => {
    const id = `l-new-${Date.now()}`;
    setModules((prev) => prev.map((module) =>
      module.id === moduleId
        ? { ...module, lessons: [...module.lessons, { id, title: 'Bài học mới', slides: 0, completion: 0, attention: null }] }
        : module,
    ));
    selectLesson(moduleId, id, 0);
  };

  const confirmRemoveModule = () => {
    if (!moduleToDelete) return;
    const target = moduleToDelete;
    const index = modules.findIndex((module) => module.id === target.id);
    const lessonIds = target.lessons.map((lesson) => lesson.id);
    const deletedFiles = Object.fromEntries(
      lessonIds.map((id) => [id, lessonFiles[id]]).filter(([, file]) => Boolean(file)),
    ) as Record<string, LessonFile>;

    setModules((prev) => prev.filter((module) => module.id !== target.id));
    setLessonFiles((prev) => {
      const next = { ...prev };
      lessonIds.forEach((id) => delete next[id]);
      return next;
    });
    if (selection && (selection.id === target.id || lessonIds.includes(selection.id))) {
      setSelection(null);
      setSlides([]);
    }
    setModuleToDelete(null);
    setUndo({
      label: `Đã xóa chương "${target.title}"`,
      restore: () => {
        setModules((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, target);
          return next;
        });
        setLessonFiles((prev) => ({ ...prev, ...deletedFiles }));
      },
    });
  };

  const removeLesson = (lessonId: string) => {
    let removedModuleId = '';
    let removedIndex = -1;
    let removedLesson: ModuleNode['lessons'][number] | null = null;
    const removedFile = lessonFiles[lessonId];

    setModules((prev) => prev.map((module) => {
      const idx = module.lessons.findIndex((lesson) => lesson.id === lessonId);
      if (idx === -1) return module;
      removedModuleId = module.id;
      removedIndex = idx;
      removedLesson = module.lessons[idx];
      return { ...module, lessons: module.lessons.filter((lesson) => lesson.id !== lessonId) };
    }));
    setLessonFiles((prev) => {
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });

    if (selection?.type === 'lesson' && selection.id === lessonId) {
      setSelection(null);
      setSlides([]);
    }

    const lessonSnapshot = removedLesson as ModuleNode['lessons'][number] | null;
    if (lessonSnapshot) {
      setUndo({
        label: `Đã xóa bài "${lessonSnapshot.title}"`,
        restore: () => {
          setModules((prev) => prev.map((module) => {
            if (module.id !== removedModuleId) return module;
            const lessons = [...module.lessons];
            lessons.splice(Math.min(removedIndex, lessons.length), 0, lessonSnapshot);
            return { ...module, lessons };
          }));
          if (removedFile) setLessonFiles((prev) => ({ ...prev, [lessonId]: removedFile }));
        },
      });
    }
  };

  const addPages = (lessonId: string, file: File, pageCount: number) => {
    setSlides(Array.from({ length: pageCount }, (_, i) => i));
    setLessonFiles((prev) => ({ ...prev, [lessonId]: { name: file.name, pages: pageCount } }));
    patchSelectedLesson((lesson) => ({ ...lesson, slides: pageCount }));
  };

  const handleFiles = (files: FileList | File[]) => {
    if (!selectedLesson) return;
    const list = Array.from(files);
    const pdf = list.find((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) return;
    addPages(selectedLesson.id, pdf, 12); // Mock only: prod should read rendered PDF page count from backend.
  };

  const onZoneDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOverZone(false);
    handleFiles(event.dataTransfer.files);
  };

  const removeFile = () => {
    if (!fileToDelete) return;
    setLessonFiles((prev) => {
      const next = { ...prev };
      delete next[fileToDelete.lessonId];
      return next;
    });
    if (selectedLesson?.id === fileToDelete.lessonId) setSlides([]);
    setModules((prev) => prev.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => (
        lesson.id === fileToDelete.lessonId ? { ...lesson, slides: 0 } : lesson
      )),
    })));
    setFileToDelete(null);
  };

  return (
    <div className="flex min-h-0 flex-col lg:h-[calc(100dvh-8rem)] lg:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-slate-50 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isNew ? 'Soạn khóa học mới' : 'Nội dung khóa học'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Quản lý cấu trúc bài học và tài liệu của khóa học.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isNew && (
              <Button
                type="button"
                variant="destructive"
                size="default"
                onClick={() => setConfirmDeleteCourse(true)}
              >
                Xóa
              </Button>
            )}
            <Button type="button" variant="outline" size="default" onClick={saveDraft}>
              {saveStatus === 'saving' ? 'Đang lưu...' : saveStatus === 'saved' ? 'Đã lưu' : 'Lưu nháp'}
            </Button>
            <Button
              type="button"
              size="default"
              disabled={!canPublish}
              title={!canPublish ? 'Cần có tên, mô tả, chương, bài học và PDF trước khi xuất bản' : undefined}
              onClick={saveDraft}
            >
              Xuất bản
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-4 grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[350px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cấu trúc khóa học</p>
              <Button type="button" variant="ghost" size="xs" onClick={addModule}>
                <Icon name="ri-add-line" data-icon="inline-start" />
                Thêm chương
              </Button>
            </div>

            {modules.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="py-8"
                  icon={<Icon name="ri-git-branch-line" className="text-2xl text-slate-400" />}
                  title="Chưa có chương nào"
                  desc="Tạo chương đầu tiên để bắt đầu xây dựng khóa học."
                >
                  <Button type="button" className="mt-4" onClick={addModule}>
                    Tạo chương đầu tiên
                  </Button>
                </EmptyState>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                {modules.map((module, moduleIndex) => {
                  const moduleActive = selection?.type === 'module' && selection.id === module.id;
                  const isExpanded = expanded[module.id] ?? true;

                  return (
                    <section key={module.id} className="mb-3">
                      <div
                        className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${
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
                          onClick={() => selectModule(module.id)}
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
                                renameModule(module.id, event.target.value);
                                setRenaming(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                                if (event.key === 'Escape') setRenaming(null);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-cyan-300 px-2 py-1 text-sm font-medium outline-none ring-2 ring-cyan-100"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{module.title}</span>
                          )}
                        </button>

                        <details className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
                          <summary
                            className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-muted hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden"
                            aria-label="Thao tác với chương"
                            title="Thao tác"
                          >
                            <Icon name="ri-more-2-fill" className="text-lg" />
                          </summary>
                          <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onClick={(event) => {
                                event.currentTarget.closest('details')?.removeAttribute('open');
                                setRenaming({ type: 'module', id: module.id });
                              }}
                            >
                              Đổi tên
                            </button>
                            <button
                              type="button"
                              className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onClick={(event) => {
                                event.currentTarget.closest('details')?.removeAttribute('open');
                                addLesson(module.id);
                              }}
                            >
                              Thêm bài học
                            </button>
                            <div className="my-1 border-t border-border" />
                            <button
                              type="button"
                              className="flex w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                              onClick={(event) => {
                                event.currentTarget.closest('details')?.removeAttribute('open');
                                setModuleToDelete(module);
                              }}
                            >
                              Xóa chương
                            </button>
                          </div>
                        </details>
                      </div>

                      {isExpanded && (
                        <div className="ml-10 mt-1 space-y-0.5 border-l border-slate-100 pl-2">
                          {module.lessons.map((lesson) => {
                            const lessonActive = selection?.type === 'lesson' && selection.id === lesson.id;

                            return (
                              <div key={lesson.id} className="group flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => selectLesson(module.id, lesson.id, lesson.slides)}
                                  className={`relative flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                                    lessonActive
                                      ? 'bg-cyan-50 font-medium text-cyan-700 before:absolute before:-left-[9px] before:top-2 before:h-5 before:w-0.5 before:rounded-full before:bg-cyan-700'
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                  }`}
                                >
                                  <Icon name="ri-book-open-line" className="shrink-0 text-sm text-slate-400" />
                                  {renaming?.type === 'lesson' && renaming.id === lesson.id ? (
                                    <input
                                      autoFocus
                                      defaultValue={lesson.title}
                                      onClick={(event) => event.stopPropagation()}
                                      onBlur={(event) => {
                                        renameLesson(lesson.id, event.target.value);
                                        setRenaming(null);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                                        if (event.key === 'Escape') setRenaming(null);
                                      }}
                                      className="min-w-0 flex-1 rounded-md border border-cyan-300 px-2 py-1 text-sm outline-none ring-2 ring-cyan-100"
                                    />
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                                  )}
                                  {lesson.slides > 0 && (
                                    <span className="shrink-0 text-xs font-normal text-slate-400">{lesson.slides}</span>
                                  )}
                                </button>

                                <details className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
                                  <summary
                                    className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-muted hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden"
                                    aria-label="Thao tác với bài học"
                                    title="Thao tác"
                                  >
                                    <Icon name="ri-more-2-fill" className="text-lg" />
                                  </summary>
                                  <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg">
                                    <button
                                      type="button"
                                      className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                      onClick={(event) => {
                                        event.currentTarget.closest('details')?.removeAttribute('open');
                                        setRenaming({ type: 'lesson', id: lesson.id });
                                      }}
                                    >
                                      Đổi tên
                                    </button>
                                    <div className="my-1 border-t border-border" />
                                    <button
                                      type="button"
                                      className="flex w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                      onClick={(event) => {
                                        event.currentTarget.closest('details')?.removeAttribute('open');
                                        setLessonToDelete({ id: lesson.id, title: lesson.title });
                                      }}
                                    >
                                      Xóa bài
                                    </button>
                                  </div>
                                </details>
                              </div>
                            );
                          })}

                          {selectedModuleForAdd?.id === module.id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="mt-1 w-full justify-start text-slate-500"
                              onClick={() => addLesson(module.id)}
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

                <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={addModule}>
                  <Icon name="ri-add-line" data-icon="inline-start" />
                  Thêm chương
                </Button>
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {!selection && (
            <EmptyState
              className="min-h-[420px] justify-center p-10"
              icon={<Icon name="ri-book-open-line" className="text-2xl text-slate-400" />}
              title="Chọn một chương hoặc bài học"
              desc="Chọn nội dung ở danh sách bên trái để bắt đầu chỉnh sửa."
            />
          )}

          {selectedModule && (
            <div className="mx-auto max-w-2xl p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Chương {String(modules.findIndex((module) => module.id === selectedModule.id) + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedModule.title}</h3>

              <section className="mt-8">
                <label htmlFor="module-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tên chương
                </label>
                <input
                  id="module-title"
                  value={selectedModule.title}
                  onChange={(event) => renameModule(selectedModule.id, event.target.value)}
                  className={INPUT_CLS}
                />
              </section>

              <div className="mt-6 flex justify-end">
                <Button type="button" onClick={saveDraft}>Lưu thay đổi</Button>
              </div>
            </div>
          )}

          {selectedLessonContext && (
            <div className="mx-auto max-w-5xl p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bài học</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedLessonContext.lesson.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Chương {modules.findIndex((module) => module.id === selectedLessonContext.module.id) + 1} · {selectedLessonContext.module.title}
              </p>

              <section className="mt-8 border-b border-border pb-8">
                <h4 className="text-sm font-semibold text-slate-900">Thông tin bài học</h4>
                <div className="mt-4">
                  <label htmlFor="lesson-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Tên bài
                  </label>
                  <input
                    id="lesson-title"
                    value={selectedLessonContext.lesson.title}
                    onChange={(event) => renameLesson(selectedLessonContext.lesson.id, event.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </section>

              <section className="py-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-base font-semibold text-slate-900">
                      {selectedFile ? 'PDF bài học' : 'Tài liệu bài học'}
                    </h4>
                    <p className="mt-1.5 text-sm leading-6 text-slate-500">
                      Upload hoặc thay PDF dùng làm tài liệu chính của bài học.
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
                    if (event.target.files) handleFiles(event.target.files);
                    event.target.value = '';
                  }}
                />

                {!selectedFile ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverZone(true);
                    }}
                    onDragLeave={() => setDragOverZone(false)}
                    onDrop={onZoneDrop}
                    className={`mt-5 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-8 py-14 text-center transition ${
                      dragOverZone
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-border bg-muted/60 text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/40'
                    }`}
                  >
                    <Icon name="ri-upload-cloud-2-line" className="text-4xl" />
                    <p className="mt-4 text-base font-semibold text-slate-800">Upload PDF</p>
                    <p className="mt-1.5 text-sm text-slate-500">Kéo file vào đây hoặc chọn từ máy.</p>
                    <p className="mt-1 text-xs text-slate-400">PDF</p>
                    <Button type="button" size="lg" className="mt-6" onClick={() => fileRef.current?.click()}>
                      Chọn file PDF
                    </Button>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-background p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon name="ri-slideshow-3-line" className="text-xl" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{selectedFile.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{selectedFile.pages} trang</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                        Thay file
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setFileToDelete({ lessonId: selectedLessonContext.lesson.id, title: selectedFile.name })}
                      >
                        Xóa file
                      </Button>
                    </div>
                  </div>
                )}

                {slides.length > 0 && (
                  <div className="mt-5 rounded-xl border border-border bg-muted/40 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700">Trang trong tài liệu</p>
                      <p className="text-xs tabular-nums text-slate-500">{slides.length} trang</p>
                    </div>
                    <div className="mt-4 grid grid-cols-6 gap-2.5 sm:grid-cols-8 md:grid-cols-10 xl:grid-cols-12">
                      {slides.map((page, index) => (
                        <div
                          key={page}
                          className="flex h-10 items-center justify-center rounded-md border border-border bg-white text-xs font-medium tabular-nums text-slate-500"
                          title={`Trang ${index + 1}`}
                        >
                          {index + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
            ? 'Các bài học thuộc chương này cũng sẽ bị xóa khỏi cấu trúc khóa học.'
            : 'Chương này sẽ bị xóa khỏi cấu trúc khóa học.'
        ) : null}
        confirmLabel="Xóa chương"
        onClose={() => setModuleToDelete(null)}
        onConfirm={confirmRemoveModule}
      />

      <ConfirmDialog
        open={lessonToDelete !== null}
        title={lessonToDelete ? `Xóa bài “${lessonToDelete.title}”?` : 'Xóa bài học?'}
        description="Bài học và tài liệu liên quan sẽ bị xóa khỏi khóa học."
        confirmLabel="Xóa bài học"
        onClose={() => setLessonToDelete(null)}
        onConfirm={() => {
          if (lessonToDelete) removeLesson(lessonToDelete.id);
        }}
      />

      <ConfirmDialog
        open={fileToDelete !== null}
        title={fileToDelete ? `Xóa file “${fileToDelete.title}”?` : 'Xóa file PDF?'}
        description="File PDF này sẽ bị gỡ khỏi bài học hiện tại."
        confirmLabel="Xóa file"
        onClose={() => setFileToDelete(null)}
        onConfirm={removeFile}
      />

      <ConfirmDialog
        open={confirmDeleteCourse}
        title="Xóa khóa học này?"
        description={
          <>
            Khóa học <span className="font-medium text-slate-700">{title || course?.title || 'này'}</span> cùng toàn bộ nội dung và đăng ký liên quan sẽ bị xóa. Đây là hành động có mức rủi ro cao và không thể hoàn tác từ giao diện.
          </>
        }
        confirmLabel="Xóa khóa học"
        onClose={() => setConfirmDeleteCourse(false)}
        onConfirm={() => {
          // TODO(prod): gọi API xóa khóa học rồi điều hướng về /teacher/courses.
          setConfirmDeleteCourse(false);
        }}
      />

      {undo && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
            <span>{undo.label}</span>
            <button
              type="button"
              onClick={() => {
                undo.restore();
                setUndo(null);
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold text-cyan-300 transition hover:bg-white/20"
            >
              Hoàn tác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
