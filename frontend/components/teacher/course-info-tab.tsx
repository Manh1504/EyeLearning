"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useUnsavedGuard } from "@/components/teacher/unsaved-guard";
import { useCourseTree, useTeacherCourses } from "@/hooks/use-teacher";
import { deleteCourse, updateCourse } from "@/lib/api/teacher";
import { STATUS_LABEL } from "@/lib/constants";
import type { CourseStatus } from "@/lib/types/domain";
import { PublishChecklistDialog, PublishIssueList, publishReport } from "./content-editor/publish-checklist";

const STATUS_TONE: Record<CourseStatus, string> = {
  draft: "border-black/10 bg-black/5 text-black/70",
  published: "border-[#cfe0ca] bg-[#e8f1e6] text-[#3f573c]",
  archived: "border-black/10 bg-black/5 text-black/55",
};

/** Ý nghĩa thật của từng trạng thái với sinh viên (giữ nguyên nghiệp vụ backend). */
const STATUS_HELP: Record<CourseStatus, string> = {
  draft: "Khóa học chỉ mình bạn thấy. Sinh viên chưa xem và chưa đăng ký được.",
  published: "Sinh viên thấy khóa học trong danh sách và đăng ký được. Mọi bài giảng/slide đã tải lên hiện ngay.",
  archived: "Khóa học ẩn khỏi danh sách cho sinh viên mới; sinh viên đã đăng ký vẫn xem được nội dung.",
};

/**
 * Tab "Thông tin khóa học": sửa tên/mô tả, xuất bản hay thu hồi, xóa khóa học.
 *
 * Không có ô "Trạng thái" dạng select nữa — mỗi hành động nói rõ nó làm gì với
 * trạng thái khóa học, và danh sách "cần hoàn thiện" chỉ ra mục còn thiếu.
 */
export function CourseInfoTab({
  courseId,
  canManage,
}: {
  courseId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const guard = useUnsavedGuard();
  const { data: courses = [], isLoading } = useTeacherCourses();
  const { data: tree = [] } = useCourseTree(courseId);
  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);

  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  if (course && hydratedId !== course.id) {
    setHydratedId(course.id);
    setTitle(course.title);
    setDescription(course.description);
    setBaseline(JSON.stringify({ title: course.title, description: course.description }));
  }

  const status = (course?.status ?? "draft") as CourseStatus;
  const snapshot = JSON.stringify({ title, description });
  const dirty = baseline !== "" && snapshot !== baseline;
  const report = useMemo(() => publishReport(title, tree), [title, tree]);

  const flash = useCallback((tone: "ok" | "err", text: string) => {
    setStatusMsg({ tone, text });
    if (tone === "ok") window.setTimeout(() => setStatusMsg(null), 6000);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!title.trim()) {
      flash("err", "Cần nhập tên khóa học trước khi lưu.");
      return false;
    }
    setSaving(true);
    try {
      const saved = await updateCourse(courseId, {
        title: title.trim(),
        description: description.trim(),
      });
      setTitle(saved.title);
      setDescription(saved.description);
      setBaseline(JSON.stringify({ title: saved.title, description: saved.description }));
      await queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      flash("ok", `Đã lưu "${saved.title}".`);
      return true;
    } catch (e) {
      flash("err", `Không lưu được khóa học: ${e instanceof Error ? e.message : "lỗi không xác định"}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [courseId, description, flash, queryClient, title]);

  useEffect(() => {
    if (!guard || !canManage) return;
    return guard.register({ label: "thông tin khóa học", isDirty: () => dirty, save });
  }, [guard, canManage, dirty, save]);

  const changeStatus = async (next: CourseStatus, note: string) => {
    setSaving(true);
    try {
      await updateCourse(courseId, { status: next });
      await queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      flash("ok", note);
    } catch (e) {
      flash("err", `Không đổi được trạng thái: ${e instanceof Error ? e.message : "lỗi không xác định"}`);
    } finally {
      setSaving(false);
    }
  };

  const requestPublish = () => {
    if (report.blocking) {
      setChecklistOpen(true);
      return;
    }
    setConfirmPublish(true);
  };

  if (isLoading && !course) return <FullPageSpinner label="Đang tải khóa học…" />;
  if (!course) return <Alert variant="destructive" title="Không tìm thấy khóa học" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cnBadge(STATUS_TONE[status])}>{STATUS_LABEL[status]}</span>
        <span className="text-sm text-black/60">
          {course.students} học viên · {course.lessonCount ?? 0} mục nội dung
        </span>
      </div>

      <section className="space-y-4 rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
        <div className="space-y-1.5">
          <label htmlFor="course-title" className="block text-sm font-medium text-black">
            Tên khóa học <span className="text-destructive">*</span>
          </label>
          <Input
            id="course-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            readOnly={!canManage}
            placeholder="Ví dụ: Lập trình Python cơ bản"
            aria-invalid={!title.trim()}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="course-desc" className="block text-sm font-medium text-black">
            Mô tả
          </label>
          <Textarea
            id="course-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            readOnly={!canManage}
            rows={4}
            placeholder="Tóm tắt nội dung, mục tiêu khóa học…"
          />
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full border-black/10 bg-white"
              disabled={saving || !title.trim() || !dirty}
              onClick={() => void save()}
            >
              <Icon name="ri-check-line" className="size-4" />
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
            {dirty && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-black/60">
                <span className="size-1.5 rounded-full bg-warning" />
                Có thay đổi chưa lưu
              </span>
            )}
          </div>
        )}

        {statusMsg && (
          <Alert variant={statusMsg.tone === "ok" ? "success" : "destructive"} title={statusMsg.text} />
        )}
      </section>

      <section className="space-y-4 rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
        <div>
          <h3 className="text-base font-semibold text-black">Xuất bản</h3>
          <p className="mt-1 text-sm leading-6 text-black/65">{STATUS_HELP[status]}</p>
        </div>

        {report.issues.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-black">
              {report.blocking ? "Phải sửa trước khi xuất bản" : "Cân nhắc trước khi xuất bản"}
            </p>
            <PublishIssueList issues={report.issues} />
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {status !== "published" && (
              <Button
                className="rounded-full bg-black px-5 text-white hover:bg-black/80"
                disabled={saving}
                onClick={requestPublish}
              >
                <Icon name="ri-rocket-2-line" className="size-4" />
                Xuất bản khóa học
              </Button>
            )}
            {status === "published" && (
              <>
                <Button
                  variant="outline"
                  className="rounded-full border-black/10 bg-white"
                  disabled={saving}
                  onClick={() => void changeStatus("draft", "Đã thu hồi khóa học về bản nháp.")}
                >
                  <Icon name="ri-eye-off-line" className="size-4" />
                  Thu hồi về bản nháp
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full text-black/65"
                  disabled={saving}
                  onClick={() => setConfirmArchive(true)}
                >
                  <Icon name="ri-inbox-line" className="size-4" />
                  Lưu trữ
                </Button>
              </>
            )}
            {status === "archived" && (
              <Button
                variant="outline"
                className="rounded-full border-black/10 bg-white"
                disabled={saving}
                onClick={() => void changeStatus("draft", "Đã mở lại khóa học ở dạng bản nháp.")}
              >
                <Icon name="ri-refresh-line" className="size-4" />
                Mở lại (bản nháp)
              </Button>
            )}
          </div>
        )}
      </section>

      {canManage && (
        <section className="space-y-3 rounded-[20px] border border-destructive/20 bg-destructive/5 p-5 sm:p-7">
          <div>
            <h3 className="text-base font-semibold text-black">Xóa khóa học</h3>
            <p className="mt-1 text-sm leading-6 text-black/65">
              Xóa vĩnh viễn khóa học cùng toàn bộ chương, bài giảng, bài tập, dữ liệu điểm nhìn và
              đăng ký của học viên. Không thể hoàn tác.
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-full"
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="ri-delete-bin-line" className="size-4" />
            Xóa khóa học
          </Button>
        </section>
      )}

      <PublishChecklistDialog
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        report={report}
      />

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Xuất bản khóa học?"
        description="Sinh viên sẽ thấy khóa học trong danh sách và đăng ký được. Mọi bài giảng đã tải lên và bài tập đã giao hiện ngay với học viên."
        confirmLabel="Xuất bản"
        loading={saving}
        onConfirm={async () => {
          setConfirmPublish(false);
          await changeStatus("published", "Đã xuất bản khóa học.");
        }}
      />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Lưu trữ khóa học?"
        description="Khóa học sẽ ẩn khỏi danh sách cho sinh viên mới. Học viên đã đăng ký vẫn xem được nội dung."
        confirmLabel="Lưu trữ"
        loading={saving}
        onConfirm={async () => {
          setConfirmArchive(false);
          await changeStatus("archived", "Đã lưu trữ khóa học.");
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xóa khóa học này?"
        description="Khóa học cùng toàn bộ nội dung và đăng ký liên quan sẽ bị xóa. Không thể hoàn tác."
        confirmLabel="Xóa khóa học"
        destructive
        loading={saving}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await deleteCourse(courseId);
            // Cache danh sách sống 2 phút (staleTime) → phải xoá hẳn entry, nếu
            // không khóa vừa xóa vẫn hiện trong danh sách khi quay về /teacher.
            queryClient.removeQueries({ queryKey: ["teacher", "courses"] });
            queryClient.removeQueries({ queryKey: ["teacher", "course-tree", courseId] });
            router.replace("/teacher");
            router.refresh();
          } catch (e) {
            flash("err", `Không xóa được khóa học: ${e instanceof Error ? e.message : "lỗi"}`);
          }
        }}
      />
    </div>
  );
}

/** Nối class cho nhãn trạng thái (tách ra cho gọn JSX). */
function cnBadge(tone: string) {
  return `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`;
}
