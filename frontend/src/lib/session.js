export function normalizeRole(role) {
  if (role === "instructor") return "teacher";
  if (["student", "teacher", "admin"].includes(role)) return role;
  return "";
}

const SESSION_KEYS = [
  "session_id",
  "lesson_id",
  "course_id",
  "course_item_id",
  "pdf_lesson_id",
  "pdf_document_version",
  "test_id",
  "module_id",
  "activity_id",
  "content_version_id",
  "session_type",
  "student_code",
  "full_name",
  "role",
  "calibration_ready",
  "calibration_profile_id",
  "calibration_viewport_w",
  "calibration_viewport_h",
  "calibration_is_fullscreen",
  "calibration_completed_at",
];

export function getSessionContext() {
  const role = normalizeRole(localStorage.getItem("role") || "student") || "student";
  return {
    session_id: localStorage.getItem("session_id") || "",
    lesson_id: localStorage.getItem("lesson_id") || "",
    course_id: localStorage.getItem("course_id") || "",
    course_item_id: localStorage.getItem("course_item_id") || "",
    pdf_lesson_id: localStorage.getItem("pdf_lesson_id") || "",
    pdf_document_version: localStorage.getItem("pdf_document_version") || "",
    test_id: localStorage.getItem("test_id") || "",
    module_id: localStorage.getItem("module_id") || "",
    activity_id: localStorage.getItem("activity_id") || "",
    content_version_id: localStorage.getItem("content_version_id") || "",
    session_type: localStorage.getItem("session_type") || "",
    student_code: localStorage.getItem("student_code") || "",
    full_name: localStorage.getItem("full_name") || "",
    role,
  };
}

export function getRole() {
  return normalizeRole(localStorage.getItem("role") || "student") || "student";
}

export function setSessionContext(partial) {
  Object.entries(partial).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    localStorage.setItem(key, key === "role" ? normalizeRole(String(value)) || String(value) : String(value));
  });
}

export function clearSessionContext({ preserveIdentity = false } = {}) {
  SESSION_KEYS.forEach((key) => {
    if (preserveIdentity && ["student_code", "full_name", "role"].includes(key)) return;
    localStorage.removeItem(key);
  });
}
