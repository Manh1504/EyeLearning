export function durationText(value) {
  return value ? `${value} phút` : "Chưa đặt thời lượng";
}

export function itemTypeLabel(type) {
  return {
    PDF_LESSON: "Bài học PDF",
    TEST: "Bài kiểm tra",
  }[type] || "Nội dung";
}

export function progressState(progressRatio) {
  const progress = Number(progressRatio || 0);
  if (progress >= 1) return "completed";
  if (progress > 0) return "in_progress";
  return "unstarted";
}

export function progressLabel(progressRatio) {
  const state = progressState(progressRatio);
  if (state === "completed") return "Đã hoàn thành";
  if (state === "in_progress") return `${Math.round(progressRatio * 100)}% đã hoàn thành`;
  return "Chưa bắt đầu";
}

export function primaryCourseCta(progressRatio) {
  const state = progressState(progressRatio);
  if (state === "completed") return "Xem lại khóa học";
  if (state === "in_progress") return "Tiếp tục học";
  return "Bắt đầu học";
}

export function courseVisual(course) {
  const title = `${course?.course_title || ""} ${course?.course_description || ""}`.toLowerCase();
  const nextType = String(course?.items?.[0]?.item_type || "").toUpperCase();

  if (title.includes("mlops") || title.includes("pipeline") || title.includes("machine learning")) {
    return {
      theme: "mlops",
      eyebrow: "MLOps",
      accent: "Chuỗi dữ liệu",
    };
  }
  if (title.includes("pdf") || title.includes("reading") || nextType === "PDF_LESSON") {
    return {
      theme: "reading",
      eyebrow: "Bài học PDF",
      accent: "Tài liệu học tập",
    };
  }
  if (nextType === "TEST") {
    return {
      theme: "data",
      eyebrow: "Bài kiểm tra",
      accent: "Đánh giá độc lập",
    };
  }
  return {
    theme: "general",
    eyebrow: "Khóa học",
    accent: "Nội dung học tập",
  };
}

export function courseMeta(course) {
  const parts = [];
  if (course?.item_count != null) parts.push(`${course.item_count} bài học`);
  if (course?.available_item_count != null) parts.push(`${course.available_item_count} đang mở`);
  return parts;
}
