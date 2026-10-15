"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { setDemoEmail, setDemoCookies } from "@/lib/demo";

const ROLES = [
  { email: "student@school.edu.vn", label: "Học viên", home: "/student" },
  { email: "teacher@school.edu.vn", label: "Giảng viên", home: "/teacher" },
  { email: "admin@school.edu.vn", label: "Quản trị", home: "/admin" },
];

export function DemoLoginLinks() {
  const router = useRouter();

  const enter = (email: string, home: string) => {
    setDemoEmail(email);
    setDemoCookies();
    router.push(home);
  };

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-dashed border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Icon name="ri-flask-line" className="size-4 text-primary" />
        Chế độ xem giao diện (dữ liệu giả)
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Nhập bất kỳ email/mật khẩu để vào, hoặc chọn nhanh vai trò:
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ROLES.map((r) => (
          <Button
            key={r.email}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => enter(r.email, r.home)}
          >
            {r.label}
          </Button>
        ))}
      </div>
      <Link
        href="/demo"
        className="block text-center text-xs font-medium text-primary hover:underline"
      >
        Xem tất cả màn →
      </Link>
    </div>
  );
}
