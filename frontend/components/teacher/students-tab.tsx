"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCourseStudents, useCourseTree, useStudentDirectory } from "@/hooks/use-teacher";
import { addCourseStudents, removeCourseStudent } from "@/lib/api/teacher";
import { ENROLL_LABEL } from "@/lib/constants";
import type { EnrollStatus, StudentRow } from "@/lib/types/domain";
import { initialsOf } from "@/lib/utils";

type StatusFilter = "all" | EnrollStatus;
type SortMode = "recent" | "progress" | "name";

function relativeMinutes(value: string) {
  const text = value.toLowerCase();
  if (text.includes("vừa")) return 0;
  const amount = Number(text.match(/\d+/)?.[0] ?? 999999);
  if (text.includes("phút")) return amount;
  if (text.includes("giờ")) return amount * 60;
  if (text.includes("ngày")) return amount * 60 * 24;
  if (text.includes("tuần")) return amount * 60 * 24 * 7;
  return 999999;
}

export function StudentsTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data: students = [], isLoading, isError, error } = useCourseStudents(courseId);
  const { data: tree = [] } = useCourseTree(courseId);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [studentToRemove, setStudentToRemove] = useState<StudentRow | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = students.filter((s) => {
      const matchesQuery =
        !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === "progress") return b.progress - a.progress;
      if (sortMode === "name") return a.name.localeCompare(b.name, "vi");
      return relativeMinutes(a.lastActive) - relativeMinutes(b.lastActive);
    });
  }, [students, query, statusFilter, sortMode]);

  const activeCount = students.filter((s) => s.status === "active").length;
  const completedCount = students.filter((s) => s.status === "completed").length;
  const hasActiveSearch = query.trim().length > 0 || statusFilter !== "all";
  const openStudent = students.find((student) => student.id === openId) ?? null;
  const courseLessons = tree.flatMap((module) => module.lessons);
  const lessonTitle = (lessonId: string) =>
    courseLessons.find((lesson) => lesson.id === lessonId)?.title ?? lessonId;
  const openLessonProgress = openStudent
    ? [
        ...courseLessons.map((lesson) =>
          openStudent.lessons.find((progress) => progress.lessonId === lesson.id) ?? {
            lessonId: lesson.id,
            viewed: 0,
            total: lesson.slides,
            attention: null,
          },
        ),
        ...openStudent.lessons.filter(
          (progress) => !courseLessons.some((lesson) => lesson.id === progress.lessonId),
        ),
      ]
    : [];
  const removeStudent = async (id: string) => {
    try {
      await removeCourseStudent(courseId, id);
      queryClient.invalidateQueries({ queryKey: ["teacher", "course-students", courseId] });
      queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    } catch {
      setAddError("Không gỡ được học viên khỏi khóa học");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 border-b border-black/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Danh sách lớp</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-black sm:text-4xl">
            Học viên
          </h2>
          <p className="mt-3 text-sm text-black/45">
            {students.length === 0
              ? "Chưa có học viên nào trong khóa học."
              : `${students.length} học viên · ${activeCount} đang học · ${completedCount} hoàn thành`}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="rounded-full bg-black px-5 text-white hover:bg-black/80">
            <Icon name="ri-user-add-line" className="size-4" />
            Thêm học viên
          </Button>
        )}
      </div>

      {addError && (
        <div className="flex items-center gap-3 rounded-[18px] border border-[#eeeee9] bg-white px-4 py-3 text-sm text-black shadow-xs">
          <Icon name="ri-error-warning-line" className="size-4" />
          <span className="flex-1">{addError}</span>
          <button type="button" onClick={() => setAddError(null)} aria-label="Đóng" className="rounded-md p-1">
            <Icon name="ri-close-line" className="size-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon="ri-error-warning-line"
          title="Không tải được danh sách học viên"
          description={error instanceof Error ? error.message : "Vui lòng thử lại sau."}
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon="ri-group-line"
          title="Chưa có học viên"
          description={
            canManage
              ? "Thêm học viên vào khóa học để bắt đầu theo dõi tiến độ."
              : "Bạn chưa có quyền quản lý danh sách học viên của khóa học này."
          }
          action={
            canManage ? (
              <Button className="rounded-full bg-black text-white hover:bg-black/80" onClick={() => setShowAdd(true)}>
                <Icon name="ri-user-add-line" className="size-4" />
                Thêm học viên
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-[20px] border border-[#eeeee9] bg-white p-2 shadow-xs lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Icon
                name="ri-search-line"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc mã sinh viên"
                className="h-11 rounded-2xl border border-[#eeeee9] bg-[#fdfdfa] pl-10 shadow-none"
                aria-label="Tìm học viên"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Lọc trạng thái"
                className="h-11 rounded-full border border-[#eeeee9] bg-[#fdfdfa] px-4 text-sm text-black focus-visible:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang học</option>
                <option value="completed">Hoàn thành</option>
                <option value="dropped">Đã gỡ</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sắp xếp"
                className="h-11 rounded-full border border-[#eeeee9] bg-[#fdfdfa] px-4 text-sm text-black focus-visible:outline-none"
              >
                <option value="recent">Hoạt động gần nhất</option>
                <option value="progress">Tiến độ cao → thấp</option>
                <option value="name">Tên A → Z</option>
              </select>
              {hasActiveSearch && (
                <Button
                  variant="ghost"
                  className="col-span-2 rounded-full sm:col-span-1"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Xóa lọc
                </Button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon="ri-search-line" title="Không tìm thấy học viên phù hợp" description="Thử đổi từ khóa hoặc bộ lọc." />
          ) : (
            <div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((student) => {
                  return (
                  <div key={student.id} className="group flex min-h-56 flex-col rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-black/10 hover:shadow-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="size-11 bg-white">
                        {student.avatarUrl ? <AvatarImage src={student.avatarUrl} alt={student.name} /> : null}
                        <AvatarFallback>{initialsOf(student.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-black">{student.name}</p>
                        <p className="mt-0.5 text-xs text-black/40">{student.code}</p>
                      </div>
                      <span className="ml-auto rounded-full bg-[#e8f1e6] px-2.5 py-1 text-[10px] font-medium text-[#52704f]">
                        {student.status === "dropped" ? "Đã gỡ" : ENROLL_LABEL[student.status]}
                      </span>
                    </div>
                    <div className="mt-auto pt-8">
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-3xl font-semibold tracking-[-0.04em] text-black">{student.progress}%</span>
                        <span className="pb-1 text-xs text-black/40">{student.lastActive || "—"}</span>
                      </div>
                      <Progress value={student.progress} className="mt-3 h-1.5 bg-[#e8f1e6]" indicatorClassName="bg-[#6f8f69]" />
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="flex-1 rounded-full border-black/10 bg-white" onClick={() => setOpenId(student.id)}>
                        Xem tiến độ &amp; heatmap
                        <Icon name="ri-arrow-right-line" className="size-3.5" />
                      </Button>
                      {canManage && student.status !== "dropped" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setStudentToRemove(student)}
                          aria-label={`Gỡ ${student.name}`}
                           className="rounded-full border border-[#eeeee9] bg-[#fdfdfa] text-black/45 hover:text-destructive"
                        >
                          <Icon name="ri-delete-bin-line" className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={studentToRemove !== null}
        onOpenChange={(o) => !o && setStudentToRemove(null)}
        title={studentToRemove ? `Gỡ ${studentToRemove.name} khỏi khóa học?` : "Gỡ học viên?"}
        description="Học viên sẽ không còn trong danh sách đang học. Lịch sử học và dữ liệu đã ghi nhận vẫn được giữ lại."
        confirmLabel="Gỡ học viên"
        destructive
        onConfirm={() => {
          if (studentToRemove) void removeStudent(studentToRemove.id);
          setStudentToRemove(null);
        }}
      />

      <AddStudentDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        courseId={courseId}
        enrolledIds={new Set(students.map((s) => s.id))}
        onAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["teacher", "course-students", courseId] });
          queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
        }}
        onError={setAddError}
      />

      <Sheet open={openStudent !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent side="right" className="overflow-hidden">
          {openStudent && (
            <>
              <SheetHeader className="border-b border-[#eeeee9] p-6 pr-12">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    {openStudent.avatarUrl ? <AvatarImage src={openStudent.avatarUrl} alt={openStudent.name} /> : null}
                    <AvatarFallback>{initialsOf(openStudent.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{openStudent.name}</SheetTitle>
                    <SheetDescription>{openStudent.code} · {openStudent.lastActive || "—"}</SheetDescription>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-black/10 rounded-[18px] bg-[#e8f1e6] py-3">
                  <div className="px-2 text-center"><p className="text-[10px] text-black/40">Tiến độ</p><p className="mt-1 text-sm font-semibold">{openStudent.progress}%</p></div>
                  <div className="px-2 text-center"><p className="text-[10px] text-black/40">Quan sát</p><p className="mt-1 text-sm font-semibold">{openStudent.attention === null ? "—" : `${openStudent.attention}%`}</p></div>
                  <div className="px-2 text-center"><p className="text-[10px] text-black/40">Trạng thái</p><p className="mt-1 truncate text-sm font-semibold">{openStudent.status === "dropped" ? "Đã gỡ" : ENROLL_LABEL[openStudent.status]}</p></div>
                </div>
              </SheetHeader>
              <SheetBody className="p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-black">Tiến độ từng bài</h3>
                  <p className="mt-1 text-xs text-black/40">Chọn một bài để mở heatmap của học viên.</p>
                </div>
                {openLessonProgress.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#eeeee9] px-4 py-8 text-center text-sm text-black/40">Khóa học chưa có bài học.</div>
                ) : (
                  <ul className="space-y-2">
                    {openLessonProgress.map((lesson) => {
                      const percent = lesson.total > 0 ? Math.round((lesson.viewed / lesson.total) * 100) : 0;
                      return (
                        <li key={lesson.lessonId}>
                          <Link
                            href={`/teacher/courses/${courseId}/lessons/${lesson.lessonId}/heatmap?student=${openStudent.id}&from=students`}
                            className="group block rounded-[18px] border border-[#eeeee9] bg-white p-4 shadow-xs transition hover:border-black/10 hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 truncate text-sm font-medium text-black">{lessonTitle(lesson.lessonId)}</p>
                              <span className="shrink-0 text-xs font-semibold tabular-nums text-black/45">{percent}%</span>
                            </div>
                            <Progress value={percent} className="mt-3 h-1.5 bg-[#e8f1e6]" indicatorClassName="bg-[#6f8f69]" />
                            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-black/40">
                              <span>{lesson.viewed}/{lesson.total} trang</span>
                              <span>Quan sát {lesson.attention === null ? "—" : `${lesson.attention}%`}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-[#52704f]">
                              Xem heatmap <Icon name="ri-arrow-right-line" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}

function AddStudentDialog({
  open,
  onOpenChange,
  courseId,
  enrolledIds,
  onAdded,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  enrolledIds: Set<string>;
  onAdded: () => void;
  onError: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const { data: directory = [], isLoading, isError } = useStudentDirectory(open, q);
  const [adding, setAdding] = useState<string | null>(null);

  const candidates = useMemo(() => {
    return directory.filter((candidate) => !enrolledIds.has(candidate.id));
  }, [directory, enrolledIds]);

  const add = async (id: string) => {
    setAdding(id);
    try {
      await addCourseStudents(courseId, [id]);
      onAdded();
      onOpenChange(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Không thêm được học viên");
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(680px,calc(100dvh-2rem))] flex-col rounded-[20px] border-[#eeeee9] bg-white shadow-2xl">
        <DialogHeader>
          <DialogTitle>Thêm học viên vào khóa học</DialogTitle>
          <DialogDescription>
            Tìm học viên theo tên hoặc mã sinh viên rồi thêm vào khóa học.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          <div className="relative">
            <Icon
              name="ri-search-line"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nhập tên hoặc mã sinh viên"
              className="rounded-xl border border-[#eeeee9] bg-[#fdfdfa] pl-9 shadow-none"
              aria-label="Tìm học viên để thêm"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <p className="px-4 py-10 text-center text-sm text-destructive">Không tải được danh mục học viên.</p>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Không tìm thấy sinh viên phù hợp.
            </p>
          ) : (
            <ul>
              {candidates.slice(0, 50).map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-[#e8f1e6]/55"
                >
                  <Avatar className="size-9">
                    <AvatarFallback>{initialsOf(candidate.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{candidate.name}</p>
                    <p className="text-xs text-muted-foreground">{candidate.code}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full border-black/10" disabled={adding === candidate.id} onClick={() => add(candidate.id)}>
                    {adding === candidate.id ? "Đang thêm…" : "Thêm"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
