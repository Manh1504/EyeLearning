'use client';

// components/teacher/workspace/content-tab.tsx — Tab Nội dung
// Tạo mới HOẶC chỉnh sửa khóa học — tất cả mutation gọi thẳng FastAPI:
//   - Khóa học: POST/PATCH/DELETE /teacher/courses
//   - Chương:   POST/DELETE /teacher/courses/{id}/modules, PATCH /teacher/modules/{id}
//   - Bài học:  POST/DELETE /teacher/modules/{id}/lessons, PATCH /teacher/lessons/{id}
//   - PDF:      POST /teacher/lessons/{id}/slides/upload (backend render từng trang ra JPEG)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ConfirmDialog, INPUT_CLS } from './workspace-ui';
import { useCourseTree, useLessonSlidesAdmin, useTeacherCourses } from '@/hooks/use-teacher';
import {
  addCourseStudents,
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  deleteSlide,
  fetchStudentDirectory,
  rebuildLessonAois,
  updateCourse,
  updateLesson,
  updateModule,
  uploadLessonPdf,
  setSlideKey,
} from '@/lib/api/teacher';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, resolveMediaUrl } from '@/lib/api/client';
import { LEVEL_LABEL } from '@/lib/mock/teacher';
import type { CourseStatus, LessonNode, Level, ModuleNode } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

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

function SlidePreview({ lessonId }: { lessonId: string }) {
  const { data: slides = [] } = useLessonSlidesAdmin(lessonId);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (preview === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
      if (event.key === 'ArrowLeft') setPreview((value) => (value === null ? value : (value - 1 + slides.length) % slides.length));
      if (event.key === 'ArrowRight') setPreview((value) => (value === null ? value : (value + 1) % slides.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, slides.length]);

  if (slides.length === 0) return null;

  const previewSlide = preview === null ? null : slides[preview];

  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
        {slides.map((slide, index) => {
          const url = resolveMediaUrl(slide.imageUrl);
          if (!url || failed[slide.id]) {
            return (
              <div
                key={slide.id}
                className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-card text-xs font-medium tabular-nums text-muted-foreground"
                title={`Trang ${slide.orderIndex}`}
              >
                {slide.orderIndex}
              </div>
            );
          }
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => setPreview(index)}
              title={`Xem trước trang ${slide.orderIndex}`}
              aria-label={`Xem trước trang ${slide.orderIndex}`}
              className="group overflow-hidden rounded-md border border-border bg-white outline-none transition hover:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Trang ${slide.orderIndex}`}
                loading="lazy"
                onError={() => setFailed((current) => ({ ...current, [slide.id]: true }))}
                className="aspect-[4/3] w-full object-contain transition group-hover:scale-[1.02]"
              />
            </button>
          );
        })}
      </div>

      {previewSlide && (
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
                Trang {previewSlide.orderIndex} / {slides.length}
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
              const url = resolveMediaUrl(previewSlide.imageUrl);
              return url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={previewSlide.id}
                  src={url}
                  alt={`Trang ${previewSlide.orderIndex}`}
                  className="mt-3 max-h-[70dvh] w-full rounded-lg bg-white object-contain"
                />
              ) : (
                <p className="mt-3 rounded-lg bg-muted px-3 py-8 text-center text-sm text-muted-foreground">
                  Không tải được ảnh trang {previewSlide.orderIndex}.
                </p>
              );
            })()}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview((value) => (value === null ? value : (value - 1 + slides.length) % slides.length))}
                disabled={slides.length <= 1}
              >
                <Icon name="ri-arrow-left-line" data-icon="inline-start" />
                Trang trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview((value) => (value === null ? value : (value + 1) % slides.length))}
                disabled={slides.length <= 1}
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

type Selection = { type: 'lesson'; id: string } | null;

function KeySlideControls({
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
  const [toggleError, setToggleError] = useState('');
  const [aoiMessage, setAoiMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const sourceLabel = (source: string) => {
    if (source === 'pdf') return 'PDF gốc';
    if (source === 'grid') return 'Lưới dự phòng';
    return 'Chưa xác định';
  };

  const rebuildAois = async () => {
    setRebuilding(true);
    setAoiMessage(null);
    try {
      const result = await rebuildLessonAois(lessonId);
      if (result.slides === 0) {
        setAoiMessage({
          tone: 'err',
          text: 'Bài học chưa có slide để tạo AOI.',
        });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher', 'lesson-slides', lessonId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'heatmap', lessonId] }),
      ]);
      setAoiMessage({
        tone: 'ok',
        text: `Đã tạo lại và lưu AOI cho ${result.slides} trang.`,
      });
    } catch (error) {
      setAoiMessage({
        tone: 'err',
        text: error instanceof Error ? error.message : 'Không tạo lại được AOI.',
      });
    } finally {
      setRebuilding(false);
    }
  };

  const toggle = async (slideId: string, isKey: boolean) => {
    setPendingId(slideId);
    setToggleError('');
    try {
      await setSlideKey(slideId, !isKey);
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'lesson-slides', lessonId] });
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Không cập nhật được slide trọng tâm.');
    } finally {
      setPendingId(null);
    }
  };

  const removeSlide = async () => {
    if (!slideToDelete) return;
    const slide = slideToDelete;
    setPendingId(slide.id);
    setToggleError('');
    try {
      await deleteSlide(slide.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher', 'lesson-slides', lessonId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'course-tree'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'courses'] }),
      ]);
      setSlideToDelete(null);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Không xóa được slide.');
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <p className="mt-3 text-sm text-muted-foreground">Đang tải danh sách slide…</p>;
  if (isError) return <p role="alert" className="mt-3 text-sm text-destructive">Không tải được thiết lập slide trọng tâm.</p>;
  if (slides.length === 0) return null;

  return (
    <>
    <section aria-labelledby={`lesson-aoi-${lessonId}`} className="mt-6 border-t border-border pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h5 id={`lesson-aoi-${lessonId}`} className="text-sm font-semibold text-foreground">Vùng nội dung (AOI)</h5>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Kiểm tra vùng đo trên từng trang. AOI được tạo và lưu từ PDF nguồn.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void rebuildAois()} disabled={rebuilding}>
          <Icon name="ri-refresh-line" data-icon="inline-start" aria-hidden />
          {rebuilding ? 'Đang tạo AOI…' : 'Tạo lại & lưu AOI'}
        </Button>
      </div>

      {aoiMessage ? (
        <p
          role={aoiMessage.tone === 'err' ? 'alert' : 'status'}
          className={`mt-4 rounded-lg border px-3 py-3 text-sm ${
            aoiMessage.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-destructive/25 bg-destructive/10 text-destructive'
          }`}
        >
          {aoiMessage.text}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_auto] gap-4 border-b border-border bg-muted/60 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid">
          <span>Trang</span>
          <span>Nguồn</span>
          <span>Kiểm tra</span>
          <span className="sr-only">Thao tác</span>
        </div>
        <ul className="divide-y divide-border">
          {slides.map((slide) => {
            const aoiReady = slide.aoiCount > 0 && slide.aoiSource !== 'none';
            return (
              <li
                key={slide.id}
                className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_auto] sm:items-center"
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
                    <span className="block truncate text-sm font-medium text-foreground">Trang {slide.orderIndex}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {slide.isKey ? 'Slide trọng tâm' : 'Slide thường'} · {slide.aoiCount} AOI
                    </span>
                  </span>
                </label>
                <div className="text-sm text-foreground">
                  <span className="mr-2 text-xs text-muted-foreground sm:hidden">Nguồn</span>
                  {sourceLabel(slide.aoiSource)}
                </div>
                <div>
                  <span className="mr-2 text-xs text-muted-foreground sm:hidden">Kiểm tra</span>
                  <span className={`inline-flex items-center gap-2 text-xs font-medium ${aoiReady ? 'text-emerald-700' : 'text-destructive'}`}>
                    <span className={`size-2 rounded-full ${aoiReady ? 'bg-emerald-500' : 'bg-destructive'}`} aria-hidden />
                    {aoiReady ? 'Sẵn sàng' : 'Cần tạo lại'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/teacher/courses/${courseId}/lessons/${lessonId}/heatmap?from=content&view=aoi&page=${slide.orderIndex}`}
                    className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 sm:flex-none')}
                    aria-label={`Xem AOI trang ${slide.orderIndex}`}
                  >
                    <Icon name="ri-focus-3-line" data-icon="inline-start" aria-hidden />
                    Xem AOI
                  </Link>
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      disabled={pendingId === slide.id}
                      onClick={() => setSlideToDelete({ id: slide.id, orderIndex: slide.orderIndex })}
                      aria-label={`Xóa slide trang ${slide.orderIndex}`}
                      title="Xóa slide"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Icon name="ri-delete-bin-line" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {toggleError ? <p role="alert" className="mt-3 text-sm text-destructive">{toggleError}</p> : null}
    </section>
    <ConfirmDialog
      open={slideToDelete !== null}
      title={slideToDelete ? `Xóa slide trang ${slideToDelete.orderIndex}?` : 'Xóa slide?'}
      description="Slide sẽ bị xóa khỏi bài học. Thao tác có thể thất bại nếu slide đã có dữ liệu theo dõi."
      confirmLabel="Xóa slide"
      onClose={() => setSlideToDelete(null)}
      onConfirm={removeSlide}
    />
    </>
  );
}

export function ContentTab({ isNew }: { isNew: boolean; embed?: boolean }) {
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
  const isOwner = isNew || course?.isOwner === true;
  const { data: tree = [], isFetching: treeFetching } = useCourseTree(validCourseId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<Level>('beginner');
  const [status, setStatus] = useState<CourseStatus>('draft');
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
    setLevel(course.level);
    setStatus(course.status);
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
        description: description.trim(),
        level,
        status,
      });
      setStatus(saved.status);
      refreshTree();
      flash('ok', `Đã lưu "${saved.title}".`);
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

  const currentStatus: CourseStatus = status;
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nội dung khóa học</p>
              <span className={`rounded-full border px-2 py-1 text-xs font-medium ${currentStatusClass}`}>{currentStatusLabel}</span>
            </div>
            <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title || course?.title || 'Khóa học'}
            </h1>
            <p className="mt-2 text-base leading-7 text-muted-foreground">Một tài liệu duy nhất cho khóa học, chương, bài học và slide.</p>
            <p className="mt-3 text-sm text-muted-foreground">{tree.length} chương · {totalLessons} bài học · {totalSlides} trang</p>
          </div>
          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={saving || !title.trim()} onClick={() => saveCourse(currentStatus)}>
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
              <Button type="button" disabled={saving || !canPublish} onClick={() => saveCourse('published')}>
                Xuất bản
              </Button>
              <Button type="button" variant="destructive" onClick={() => setConfirmDeleteCourse(true)}>Xóa khóa học</Button>
            </div>
          ) : null}
        </div>
        {statusMsg ? (
          <p aria-live="polite" className={`mt-4 rounded-lg border px-3 py-3 text-sm ${statusMsg.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-destructive/25 bg-destructive/10 text-destructive'}`}>
            {statusMsg.text}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="course-information" className="border-b border-border py-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary"><Icon name="ri-book-2-line" aria-hidden /></span>
          <div>
            <h2 id="course-information" className="text-lg font-semibold text-foreground">Khóa học</h2>
            <p className="text-sm text-muted-foreground">Thông tin hiển thị với học viên.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="course-title" className="mb-2 block text-sm font-medium text-foreground">Tên khóa học</label>
            <input id="course-title" value={title} onChange={(event) => setTitle(event.target.value)} readOnly={!isOwner} className={`${INPUT_CLS} h-11 ${isOwner ? '' : 'cursor-not-allowed bg-muted text-muted-foreground'}`} />
          </div>
          <div>
            <label htmlFor="course-level" className="mb-2 block text-sm font-medium text-foreground">Trình độ</label>
            <select id="course-level" value={level} onChange={(event) => setLevel(event.target.value as Level)} disabled={!isOwner} className={`${INPUT_CLS} h-11 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground`}>
              {(Object.keys(LEVEL_LABEL) as Level[]).map((value) => <option key={value} value={value}>{LEVEL_LABEL[value]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="course-status" className="mb-2 block text-sm font-medium text-foreground">Trạng thái</label>
            <select id="course-status" value={status} onChange={(event) => setStatus(event.target.value as CourseStatus)} disabled={!isOwner} className={`${INPUT_CLS} h-11 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground`}>
              <option value="draft">Bản nháp</option>
              <option value="published">Đã xuất bản</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="course-description" className="mb-2 block text-sm font-medium text-foreground">Mô tả</label>
            <textarea id="course-description" value={description} onChange={(event) => setDescription(event.target.value)} readOnly={!isOwner} rows={3} className={`${INPUT_CLS} min-h-28 resize-y ${isOwner ? '' : 'cursor-not-allowed bg-muted text-muted-foreground'}`} />
          </div>
        </div>
      </section>

      <section aria-labelledby="course-outline" className="py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="course-outline" className="text-lg font-semibold text-foreground">Chương và bài học</h2>
            <p className="mt-1 text-sm text-muted-foreground">Mở một bài học để quản lý PDF, slide trọng tâm và heatmap.</p>
          </div>
          {isOwner ? (
            <Button type="button" variant="outline" onClick={addModule} disabled={saving}>
              <Icon name="ri-add-line" data-icon="inline-start" /> Thêm chương
            </Button>
          ) : null}
        </div>

        {treeFetching ? <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">Đang cập nhật cấu trúc…</p> : null}
        {tree.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <Icon name="ri-git-branch-line" className="mx-auto text-2xl text-muted-foreground" aria-hidden />
            <h3 className="mt-3 text-base font-semibold text-foreground">Chưa có chương</h3>
            <p className="mt-2 text-sm text-muted-foreground">Tạo chương đầu tiên để bắt đầu xây dựng khóa học.</p>
            {isOwner ? <Button type="button" className="mt-4" onClick={addModule}>Tạo chương đầu tiên</Button> : null}
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
            {tree.map((module, moduleIndex) => {
              const moduleExpanded = expanded[module.id] ?? true;
              return (
                <section key={module.id} aria-label={`Chương ${moduleIndex + 1}: ${module.title}`} className="border-b border-border last:border-b-0">
                  <div className="flex min-h-16 items-center gap-2 bg-muted/60 px-3 py-3 sm:px-4">
                    <button type="button" onClick={() => setExpanded((value) => ({ ...value, [module.id]: !moduleExpanded }))} aria-expanded={moduleExpanded} aria-controls={`module-lessons-${module.id}`} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/25" aria-label={moduleExpanded ? `Thu gọn ${module.title}` : `Mở rộng ${module.title}`}>
                      <Icon name="ri-arrow-right-s-line" className={`text-xl transition-transform ${moduleExpanded ? 'rotate-90' : ''}`} aria-hidden />
                    </button>
                    <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">{String(moduleIndex + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      {renaming?.type === 'module' && renaming.id === module.id ? (
                        <input autoFocus defaultValue={module.title} onBlur={(event) => void commitRenameModule(module.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null); }} className={`${INPUT_CLS} h-10 font-semibold`} aria-label="Tên chương" />
                      ) : (
                        <h3 id={`module-${module.id}`} className="truncate text-base font-semibold text-foreground">{module.title}</h3>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">{module.lessons.length} bài học</p>
                    </div>
                    {isOwner ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-lg" onClick={() => setRenaming({ type: 'module', id: module.id })} aria-label={`Đổi tên chương ${module.title}`} title="Đổi tên"><Icon name="ri-edit-line" /></Button>
                        <Button type="button" variant="destructive" size="icon-lg" onClick={() => setModuleToDelete(module)} aria-label={`Xóa chương ${module.title}`} title="Xóa chương"><Icon name="ri-delete-bin-line" /></Button>
                      </div>
                    ) : null}
                  </div>

                  {moduleExpanded ? (
                    <div id={`module-lessons-${module.id}`}>
                      {module.lessons.map((lesson, lessonIndex) => {
                        const lessonExpanded = selection?.id === lesson.id;
                        return (
                          <article key={lesson.id} className="border-t border-border first:border-t-0">
                            <div className="flex min-h-16 items-center gap-3 px-3 py-3 pl-6 sm:px-4 sm:pl-12">
                              {renaming?.type === 'lesson' && renaming.id === lesson.id ? (
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold tabular-nums text-muted-foreground">{lessonIndex + 1}</span>
                                  <input autoFocus defaultValue={lesson.title} onBlur={(event) => void commitRenameLesson(lesson.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null); }} className={`${INPUT_CLS} h-10 min-w-0 flex-1`} aria-label="Tên bài học" />
                                </div>
                              ) : (
                                <button type="button" onClick={() => setSelection(lessonExpanded ? null : { type: 'lesson', id: lesson.id })} aria-expanded={lessonExpanded} aria-controls={`lesson-${lesson.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/25">
                                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold tabular-nums text-muted-foreground">{lessonIndex + 1}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">{lesson.title}</span>
                                    <span className="mt-1 block text-xs text-muted-foreground">{lesson.slides > 0 ? `${lesson.slides} trang slide` : 'Chưa có PDF'}</span>
                                  </span>
                                  <Icon name="ri-arrow-down-s-line" className={`shrink-0 text-xl text-muted-foreground transition-transform ${lessonExpanded ? 'rotate-180' : ''}`} aria-hidden />
                                </button>
                              )}
                              {isOwner ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button type="button" variant="ghost" size="icon-lg" onClick={() => setRenaming({ type: 'lesson', id: lesson.id })} aria-label={`Đổi tên bài ${lesson.title}`} title="Đổi tên"><Icon name="ri-edit-line" /></Button>
                                  <Button type="button" variant="destructive" size="icon-lg" onClick={() => setLessonToDelete(lesson)} aria-label={`Xóa bài ${lesson.title}`} title="Xóa bài"><Icon name="ri-delete-bin-line" /></Button>
                                </div>
                              ) : null}
                            </div>

                            {lessonExpanded ? (
                              <div id={`lesson-${lesson.id}`} className="border-t border-border bg-muted/30 px-4 py-6 sm:px-12">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <h4 className="text-base font-semibold text-foreground">Tài liệu bài học</h4>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">Tải PDF mới để tạo hoặc thay thế toàn bộ slide của bài học.</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                                      <Icon name="ri-upload-cloud-2-line" data-icon="inline-start" />
                                      {uploading ? 'Đang tải…' : lesson.slides > 0 ? 'Thay PDF' : 'Tải PDF'}
                                    </Button>
                                    {lesson.slides > 0 ? (
                                      <Link href={`/teacher/courses/${validCourseId}/lessons/${lesson.id}/heatmap?from=content`} className={cn(buttonVariants({ variant: 'outline' }))}>
                                        <Icon name="ri-fire-line" data-icon="inline-start" /> Xem heatmap
                                      </Link>
                                    ) : null}
                                  </div>
                                </div>
                                <input ref={fileRef} type="file" accept="application/pdf" className="sr-only" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = ''; }} />
                                <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragOverZone(true); }} onDragLeave={() => setDragOverZone(false)} onDrop={(event) => { event.preventDefault(); setDragOverZone(false); void handleFiles(event.dataTransfer.files); }} className={`mt-4 flex min-h-28 w-full items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center outline-none transition focus-visible:ring-3 focus-visible:ring-ring/25 ${dragOverZone ? 'border-ring bg-accent' : 'border-border bg-card hover:border-ring/60'}`}>
                                  <span><Icon name="ri-file-pdf-2-line" className="mx-auto text-2xl text-muted-foreground" aria-hidden /><span className="mt-2 block text-sm font-medium text-foreground">{lesson.slides > 0 ? `${lesson.slides} trang đã sẵn sàng` : 'Kéo PDF vào đây hoặc bấm để chọn'}</span><span className="mt-1 block text-xs text-muted-foreground">PDF · tối đa {MAX_UPLOAD_LABEL}</span></span>
                                </button>
                                {lesson.slides > 0 ? (
                                  <div className="mt-6 border-t border-border pt-6">
                                    <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-foreground">Trang trong tài liệu</h4><span className="text-xs text-muted-foreground">Bấm một trang để xem trước</span></div>
                                    <SlidePreview key={lesson.id} lessonId={lesson.id} />
                                     <KeySlideControls lessonId={lesson.id} courseId={validCourseId} canDelete={isOwner} />
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                      {module.lessons.length === 0 ? <p className="px-6 py-6 text-sm text-muted-foreground sm:px-12">Chương này chưa có bài học.</p> : null}
                      {isOwner ? (
                        <div className="border-t border-border px-4 py-3 sm:pl-12"><Button type="button" variant="ghost" onClick={() => addLesson(module.id)} disabled={saving}><Icon name="ri-add-line" data-icon="inline-start" />Thêm bài học</Button></div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </section>

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
