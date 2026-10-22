"use client";

import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";

/**
 * Công tắc "Hiển thị điểm nhìn cho sinh viên" — thiết lập cấp KHÓA HỌC.
 * Bật là áp cho mọi bài giảng và bài tập của khóa (một nguồn sự thật duy nhất).
 */
export function CourseGazeDotToggle({
  checked,
  disabled,
  busy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[#dfe9dc] bg-[#e8f1e6]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-black">
          <Icon name="ri-eye-line" className="size-4 text-[#52704f]" />
          Hiển thị điểm nhìn cho sinh viên
        </h4>
        <p className="mt-1 text-xs leading-5 text-black/70">
          Bật để sinh viên thấy chấm điểm nhìn của chính mình ở mọi bài giảng và bài tập của khóa
          học. Dùng để kiểm tra/hiệu chỉnh độ chính xác; mặc định tắt.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {busy && <Icon name="ri-loader-4-line" className="size-4 animate-spin text-[#52704f]" />}
        <Switch
          checked={checked}
          disabled={disabled || busy}
          onCheckedChange={onChange}
          ariaLabel="Hiển thị điểm nhìn cho sinh viên cho cả khóa học"
        />
      </div>
    </div>
  );
}
