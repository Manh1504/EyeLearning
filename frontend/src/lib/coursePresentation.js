export function durationText(value) {
  return value ? `${value} phút` : "Chưa đặt thời lượng";
}

export function activityLabel(type) {
  return {
    SLIDE_DECK: "Slide",
    DOCUMENT: "Tài liệu",
    VIDEO: "Video",
    QUIZ: "Câu hỏi",
    TEXT: "Bài đọc",
  }[type] || "Hoạt động";
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
  const nextType = String(course?.next_activity_type || "").toUpperCase();

  if (title.includes("mlops") || title.includes("pipeline") || title.includes("machine learning")) {
    return {
      theme: "mlops",
      eyebrow: "MLOps",
      accent: "Chuỗi dữ liệu",
    };
  }
  if (nextType === "TEXT" || title.includes("đọc") || title.includes("reading")) {
    return {
      theme: "reading",
      eyebrow: "Bài đọc",
      accent: "Tài liệu học",
    };
  }
  if (nextType === "SLIDE_DECK" || title.includes("biểu đồ") || title.includes("data") || title.includes("chart")) {
    return {
      theme: "data",
      eyebrow: "Phân tích dữ liệu",
      accent: "Trực quan hóa",
    };
  }
  if (nextType === "VIDEO") {
    return {
      theme: "video",
      eyebrow: "Bài giảng video",
      accent: "Học theo nhịp xem",
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
  if (course?.instructor_name) parts.push(course.instructor_name);
  if (course?.module_count) parts.push(`${course.module_count} chương`);
  if (course?.lesson_count) parts.push(`${course.lesson_count} bài học`);
  if (course?.activity_count) parts.push(`${course.activity_count} hoạt động`);
  return parts;
}
