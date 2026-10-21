"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { setDemoEmail, setDemoCookies } from "@/lib/demo";
import type { Role } from "@/lib/api/auth";

interface LinkItem {
  label: string;
  url: string;
  note?: string;
}

const GROUPS: Array<{ role: Role; title: string; icon: string; items: LinkItem[] }> = [
  {
    role: "student",
    title: "Học viên",
    icon: "ri-book-open-line",
    items: [
      { label: "Trang chủ khóa học", url: "/student", note: "danh sách khóa học + tìm kiếm" },
      { label: "Học bài (reader)", url: "/student/courses/course-1", note: "slide + bài giảng" },
      {
        label: "Bài tập trắc nghiệm (trong reader)",
        url: "/student/courses/course-1?lesson=lesson-quiz-1",
        note: "làm bài + chữa bài + chatbot",
      },
      { label: "Hồ sơ học viên", url: "/student/profile" },
      { label: "Kiểm tra camera (preflight)", url: "/student/courses/course-1/prepare" },
      { label: "Calibration 16 điểm", url: "/student/courses/course-1/calibrate" },
    ],
  },
  {
    role: "teacher",
    title: "Giảng viên",
    icon: "ri-dashboard-line",
    items: [
      { label: "Danh sách khóa học", url: "/teacher" },
      {
        label: "Workspace · Nội dung",
        url: "/teacher/courses/course-1?tab=content",
        note: "chương · bài học · bài tập trắc nghiệm",
      },
      { label: "Workspace · Học viên", url: "/teacher/courses/course-1?tab=students" },
      { label: "Tạo khóa học mới", url: "/teacher/courses/c-new?new=1" },
      {
        label: "Heatmap phân tích",
        url: "/teacher/courses/course-1/lessons/lesson-1/heatmap",
      },
      { label: "Hồ sơ giảng viên", url: "/teacher/profile" },
    ],
  },
  {
    role: "admin",
    title: "Quản trị viên",
    icon: "ri-user-follow-line",
    items: [
      { label: "Phân công giảng viên", url: "/admin" },
      { label: "Cấu hình calibration", url: "/admin/settings" },
      { label: "Hồ sơ admin", url: "/admin/profile" },
    ],
  },
  {
    role: "student",
    title: "Chung",
    icon: "ri-global-line",
    items: [
      { label: "Đăng nhập", url: "/account/login" },
      { label: "Demo khách (/try)", url: "/try" },
      { label: "Design system", url: "/design" },
    ],
  },
];

export default function DemoPage() {
  const router = useRouter();

  const claim = (role: Role, url: string) => {
    const email =
      role === "teacher"
        ? "teacher@school.edu.vn"
        : role === "admin"
          ? "admin@school.edu.vn"
          : "student@school.edu.vn";
    setDemoEmail(email);
    setDemoCookies();
    router.push(url);
  };

  return (
    <main className="min-h-dvh bg-[#f5f6f2] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8 rounded-[20px] border border-[#eeeee9] bg-[#fdfdfa] p-5 shadow-xs sm:p-8">
      <header className="rounded-[20px] border border-[#dfe9dc] bg-[#e8f1e6] p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-accent-foreground shadow-xs">
          <Icon name="ri-flask-line" className="size-3.5" />
          Trải nghiệm giao diện
        </span>
        <h1 className="font-display mt-4 text-4xl leading-[1.02] text-foreground sm:text-5xl">
          Chọn màn để xem
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          Dữ liệu là giả lập, không cần backend. Bấm một mục để nhảy thẳng vào màn đó với vai trò
          tương ứng. Bạn cũng có thể dán URL trực tiếp vào trình duyệt.
        </p>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} className="overflow-hidden rounded-[18px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-5">
          <div className="flex items-center gap-2.5 border-b border-[#eeeee9] pb-3">
            <Icon name={group.icon} className="size-4 text-muted-foreground" />
            <h2 className="eyebrow">{group.title}</h2>
          </div>
          <div>
            {group.items.map((item) => (
              <div
                key={item.url}
                className="flex items-center gap-4 border-b border-[#eeeee9] py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-foreground">{item.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{item.url}</p>
                  {item.note && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => claim(group.role, item.url)}
                >
                  Mở
                  <Icon name="ri-arrow-right-line" className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}

       <section className="rounded-[18px] border border-[#dfe9dc] bg-[#e8f1e6] p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Mẹo</p>
        <p className="mt-1 leading-6">
          Đổi vai trò: quay lại trang này và chọn mục ở nhóm khác. URL trực tiếp cũng hoạt động khi{" "}
          <code className="rounded bg-surface px-1">NEXT_PUBLIC_DEMO=1</code> (đã bật trong{" "}
          <code className="rounded bg-surface px-1">.env.local</code>).
        </p>
      </section>
      </div>
    </main>
  );
}
