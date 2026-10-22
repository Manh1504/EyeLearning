"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { INPUT_CLS } from "@/components/teacher/workspace-ui";
import { CourseGazeDotToggle } from "@/components/teacher/gaze-dot-toggle";
import { useUnsavedGuard } from "@/components/teacher/unsaved-guard";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/api/client";
import { useStudentDirectory } from "@/hooks/use-teacher";
import { addCourseStudents, createCourse, createLesson, createModule, updateCourse, uploadLessonPdf } from "@/lib/api/teacher";
import { cn } from "@/lib/utils";

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

/**
 * Trang "Tạo khóa học mới": làm hết trong một trang rồi bấm "Tạo và xuất bản".
 *
 * Toàn bộ khóa học chỉ được lưu khi bấm nút cuối: "Lưu nháp" tạo khóa ở trạng thái
 * draft rồi mở trang chỉnh sửa; "Tạo và xuất bản" tạo chương → bài giảng → tải PDF
 * → thêm học viên → xuất bản. Lỗi giữa đường sẽ trỏ về bản nháp vừa tạo.
 */
export function NewCourseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const guard = useUnsavedGuard();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showGazeDot, setShowGazeDot] = useState(false);
  const [newChapters, setNewChapters] = useState<NewChapterDraft[]>([
    { key: 0, title: "", lessons: [{ key: 0, title: "", file: null }] },
  ]);
  const [draftKey, setDraftKey] = useState(1);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState<string | null>(null);
  const [recoveryDraftId, setRecoveryDraftId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const {
    data: studentDirectory = [],
    isLoading: studentsLoading,
    isError: studentsError,
  } = useStudentDirectory(true, studentQuery);

  const flash = (tone: "ok" | "err", text: string) => {
    setStatusMsg({ tone, text });
    window.setTimeout(() => setStatusMsg(null), 6000);
  };

  const isDirty = useMemo(
    () =>
      Boolean(title.trim() || description.trim()) ||
      newChapters.some(
        (chapter) =>
          chapter.title.trim() ||
          chapter.lessons.some((lesson) => lesson.title.trim() || lesson.file !== null),
      ) ||
      selectedStudents.length > 0,
    [title, description, newChapters, selectedStudents],
  );

  // Trang tạo mới không có nút "lưu" riêng cho từng phần: chỉ cảnh báo, không tự lưu.
  useEffect(() => {
    if (!guard) return;
    return guard.register({ label: "khóa học mới", isDirty: () => isDirty });
  }, [guard, isDirty]);

  const patchNewChapter = (key: number, patch: Partial<NewChapterDraft>) =>
    setNewChapters((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addNewChapter = () => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) => [
      ...prev,
      { key, title: "", lessons: [{ key: 0, title: "", file: null }] },
    ]);
  };
  const removeNewChapter = (key: number) =>
    setNewChapters((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)));
  const addNewLesson = (chapterKey: number) => {
    const key = draftKey;
    setDraftKey((v) => v + 1);
    setNewChapters((prev) =>
      prev.map((c) =>
        c.key === chapterKey ? { ...c, lessons: [...c.lessons, { key, title: "", file: null }] } : c,
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
    if (newChapters.length === 0 || newChapters.some((c) => !c.title.trim()))
      issues.push("Tên từng chương");
    if (newChapters.some((c) => c.lessons.length === 0 || c.lessons.some((l) => !l.title.trim())))
      issues.push("Tên từng bài giảng");
    if (newChapters.some((c) => c.lessons.some((l) => !l.file)))
      issues.push("File PDF cho từng bài giảng");
    if (oversizedPdfs.length > 0)
      issues.push(`PDF vượt quá ${MAX_UPLOAD_LABEL}: ${oversizedPdfs.join(", ")}`);
    return issues;
  }, [title, newChapters, oversizedPdfs]);

  const totalLessons = newChapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };

  const errText = (e: unknown) => (e instanceof Error ? e.message : "Lỗi không xác định");

  const saveDraft = async () => {
    if (recoveryDraftId) return;
    if (!title.trim()) {
      flash("err", "Cần nhập tên khóa học trước khi lưu nháp.");
      return;
    }
    setCreating(true);
    try {
      const created = await createCourse({
        title: title.trim(),
        description: description.trim() || undefined,
        status: "draft",
        showGazeDot,
      });
      queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      onCreated(created.id);
    } catch (e) {
      flash("err", `Không lưu được bản nháp: ${errText(e)}`);
      setCreating(false);
    }
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
        showGazeDot,
      });
      createdDraftId = created.id;
      for (const chapter of newChapters) {
        setCreateStep(`Đang tạo chương "${chapter.title.trim()}"…`);
        const mod = await createModule(created.id, chapter.title.trim());
        for (const lesson of chapter.lessons) {
          setCreateStep(`Đang tải và xử lý PDF cho bài "${lesson.title.trim()}"…`);
          const createdLesson = await createLesson(mod.id, lesson.title.trim());
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

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="max-w-2xl border-b border-black/10 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
          Khóa học mới
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-black sm:text-5xl">
          Tạo khóa học mới
        </h2>
        <p className="mt-4 text-sm leading-6 text-black/60">
          Điền thông tin, thêm chương và bài giảng trong cùng một trang rồi bấm “Tạo và xuất bản”.
          Nếu chưa đủ nội dung, bấm “Lưu nháp” để mở khóa học và bổ sung sau — không mất dữ liệu.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">
            01
          </span>
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
              placeholder="Tóm tắt nội dung, mục tiêu khóa học…"
              className={cn(INPUT_CLS, "h-auto min-h-24 resize-y py-2")}
            />
          </div>
          <CourseGazeDotToggle
            checked={showGazeDot}
            disabled={creating}
            onChange={setShowGazeDot}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">
            02
          </span>
          <h3 className="mt-3 text-sm font-semibold text-black">Chương và bài giảng</h3>
          <p className="mt-1 text-xs leading-5 text-black/55">
            {newChapters.length} chương · {totalLessons} bài giảng
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-black/60">
              Mỗi trang PDF sẽ trở thành một slide. Bài tập trắc nghiệm thêm sau khi tạo khóa học.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-black/10 bg-white"
              onClick={addNewChapter}
              disabled={creating}
            >
              <Icon name="ri-add-line" className="size-4" />
              Thêm chương
            </Button>
          </div>

          <div className="space-y-4">
            {newChapters.map((chapter, ci) => (
              <div
                key={chapter.key}
                className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-5"
              >
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
                    title="Xóa chương"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Icon name="ri-delete-bin-line" className="size-4" />
                  </Button>
                </div>

                <div className="mt-4 space-y-2 sm:ml-10">
                  {chapter.lessons.map((lesson, li) => (
                    <div
                      key={lesson.key}
                      className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          value={lesson.title}
                          onChange={(e) =>
                            patchNewLesson(chapter.key, lesson.key, { title: e.target.value })
                          }
                          placeholder={`Bài ${li + 1}: nhập tên bài giảng`}
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
                          title="Xóa bài giảng"
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
                          patchNewLesson(chapter.key, lesson.key, {
                            file: e.target.files?.[0] ?? null,
                          })
                        }
                        className={cn(
                          "mt-3 block w-full cursor-pointer rounded-xl border px-3 py-2 text-sm text-black/70 file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:opacity-60",
                          lesson.file && lesson.file.size > MAX_UPLOAD_BYTES
                            ? "border-destructive/40 bg-destructive/5"
                            : "border-[#dfe9dc] bg-[#e8f1e6]",
                        )}
                        aria-label={`PDF cho bài ${li + 1}`}
                      />
                      <p className="mt-1.5 text-xs text-black/60">
                        {lesson.file
                          ? `${lesson.file.name} (${(lesson.file.size / (1024 * 1024)).toFixed(1)}MB)`
                          : `Chưa chọn tài liệu · PDF tối đa ${MAX_UPLOAD_LABEL} — mỗi trang thành 1 slide.`}
                      </p>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addNewLesson(chapter.key)}
                    disabled={creating}
                    className="w-full justify-center rounded-full border-black/10 bg-white"
                  >
                    <Icon name="ri-book-open-line" className="size-4" />
                    Thêm bài giảng vào chương này
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f1e6] text-xs font-semibold text-[#52704f]">
            03
          </span>
          <h3 className="mt-3 text-sm font-semibold text-black">Học viên</h3>
          <p className="mt-1 text-xs leading-5 text-black/55">
            Tùy chọn · đã chọn {selectedStudents.length}
          </p>
        </div>
        <div className="rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
          <div className="relative">
            <Icon
              name="ri-search-line"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
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
              <p className="px-4 py-8 text-center text-sm text-black/55">Đang tải danh mục học viên…</p>
            ) : studentsError ? (
              <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">
                Không tải được danh mục học viên.
              </p>
            ) : studentDirectory.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-black/55">
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
                        <span className="block truncate text-sm font-medium text-black">
                          {student.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-black/55">{student.code}</span>
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
        <Alert variant={statusMsg.tone === "ok" ? "success" : "destructive"} title={statusMsg.text} />
      )}
      {recoveryDraftId && (
        <Alert variant="warning" title="Khóa học nháp đã được tạo nhưng chưa hoàn tất">
          <p>
            Một phần nội dung không thể lưu. Tiếp tục trong bản nháp hiện có để tránh tạo khóa học
            trùng.
          </p>
          <Link
            href={`/teacher/courses/${recoveryDraftId}?tab=content`}
            className="mt-2 inline-flex font-medium text-foreground underline underline-offset-4"
          >
            Tiếp tục chỉnh sửa bản nháp
          </Link>
        </Alert>
      )}
      {createStep && (
        <p aria-live="polite" className="flex items-center justify-end gap-2 text-sm text-black/60">
          <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {createStep}
        </p>
      )}

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-[20px] border border-[#eeeee9] bg-white/90 p-3 shadow-[0_10px_30px_rgba(30,35,25,0.08)] backdrop-blur-xl sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="rounded-full border-black/10 bg-white"
          disabled={creating || !title.trim() || Boolean(recoveryDraftId)}
          onClick={() => void saveDraft()}
        >
          Lưu nháp (bổ sung sau)
        </Button>
        {recoveryDraftId ? (
          <Button asChild className="rounded-full bg-black px-6 text-white hover:bg-black/80">
            <Link href={`/teacher/courses/${recoveryDraftId}?tab=content`}>Tiếp tục bản nháp</Link>
          </Button>
        ) : (
          <Button
            className="rounded-full bg-black px-6 text-white hover:bg-black/80"
            disabled={creating || newFormIssues.length > 0}
            onClick={() => void createFullCourse()}
          >
            {creating ? "Đang tạo…" : "Tạo và xuất bản"}
          </Button>
        )}
      </div>
    </div>
  );
}
