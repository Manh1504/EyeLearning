export const LEVEL_LABEL: Record<string, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  archived: "Lưu trữ",
};

export const ENROLL_LABEL: Record<string, string> = {
  active: "Đang học",
  completed: "Hoàn thành",
  dropped: "Đã bỏ",
};

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} giờ ${m > 0 ? `${m} phút` : ""}`.trim() : `${m} phút`;
}

export const ENROLL_STATUS_LABEL = {
  active: "Đang học",
  completed: "Hoàn thành",
  dropped: "Đã dừng",
} as const;
