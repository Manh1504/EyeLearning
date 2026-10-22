"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { FullPageSpinner } from "@/components/ui/spinner";
import { CourseGazeDotToggle } from "@/components/teacher/gaze-dot-toggle";
import { useTeacherCourses } from "@/hooks/use-teacher";
import { setCourseGazeDot } from "@/lib/api/teacher";
import type { TeacherCourse } from "@/lib/types/domain";

/**
 * Tab "Cài đặt": những thiết lập ít dùng nhưng áp cho CẢ khóa học.
 *
 * Hiện chỉ có "Hiển thị điểm nhìn cho sinh viên" — thiết lập dành cho việc kiểm
 * tra/hiệu chỉnh độ chính xác của hệ thống đo mắt (không phải để dạy học).
 */
export function CourseSettingsTab({
  courseId,
  canManage,
}: {
  courseId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: courses = [], isLoading } = useTeacherCourses();
  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);

  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [showGazeDot, setShowGazeDot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (course && hydratedId !== course.id) {
    setHydratedId(course.id);
    setShowGazeDot(Boolean(course.showGazeDot));
  }

  const toggle = async (value: boolean) => {
    const key = ["teacher", "courses"];
    const previous = queryClient.getQueryData<TeacherCourse[]>(key);
    setShowGazeDot(value);
    setBusy(true);
    setMessage(null);
    queryClient.setQueryData<TeacherCourse[]>(key, (list) =>
      list?.map((item) => (item.id === courseId ? { ...item, showGazeDot: value } : item)),
    );
    try {
      await setCourseGazeDot(courseId, value);
      setMessage({
        tone: "ok",
        text: value
          ? "Đã bật: sinh viên thấy chấm điểm nhìn ở mọi bài giảng và bài tập."
          : "Đã tắt chấm điểm nhìn cho sinh viên.",
      });
    } catch (error) {
      setShowGazeDot(!value);
      if (previous) queryClient.setQueryData(key, previous);
      setMessage({
        tone: "err",
        text: `Không đổi được thiết lập: ${error instanceof Error ? error.message : "lỗi không xác định"}`,
      });
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    }
  };

  if (isLoading && !course) return <FullPageSpinner label="Đang tải khóa học…" />;
  if (!course) return <Alert variant="destructive" title="Không tìm thấy khóa học" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-black">Cài đặt khóa học</h2>
        <p className="mt-2 text-sm leading-6 text-black/65">
          Các thiết lập dưới đây áp cho toàn bộ khóa học — không phải từng bài riêng lẻ.
        </p>
      </div>

      <section className="space-y-4 rounded-[20px] border border-[#eeeee9] bg-white p-5 shadow-xs sm:p-7">
        <CourseGazeDotToggle
          checked={showGazeDot}
          disabled={!canManage}
          busy={busy}
          onChange={(value) => void toggle(value)}
        />

        {!canManage && (
          <p className="text-xs text-black/60">
            Bạn chỉ có quyền xem khóa học này — chỉ chủ khóa học hoặc quản trị viên mới đổi được
            thiết lập.
          </p>
        )}

        {message && (
          <Alert variant={message.tone === "ok" ? "success" : "destructive"} title={message.text} />
        )}

        <div className="rounded-[16px] border border-black/10 bg-[#fdfdfa] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-black">
            <Icon name="ri-information-line" className="size-4 text-black/55" />
            Khi bật, điều gì xảy ra?
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-black/70">
            <li>· Sinh viên thấy một chấm tròn tại vị trí họ đang nhìn trong MỌI bài giảng và bài tập của khóa.</li>
            <li>· Học viên cần hiệu chỉnh (calibration) trước; nếu chưa, hệ thống nhắc họ vào trang chuẩn bị.</li>
            <li>· Việc ghi dữ liệu điểm nhìn cho phân tích vẫn diễn ra bình thường dù thiết lập này tắt.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
