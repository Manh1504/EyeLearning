// Helper đọc/ghi session context trong localStorage — giữ đúng key như bản HTML/JS cũ
// để tương thích ngược nếu người dùng còn dữ liệu cũ trong trình duyệt.
export const LESSON_ID = "L001";

export function normalizeRole(role) {
  if (role === "instructor") return "teacher";
  if (["student", "teacher", "admin"].includes(role)) return role;
  return "";
}

export function getSessionContext() {
  const role = normalizeRole(localStorage.getItem("role") || "student") || "student";
  return {
    session_id: localStorage.getItem("session_id") || "",
    lesson_id: localStorage.getItem("lesson_id") || LESSON_ID,
    course_id: localStorage.getItem("course_id") || "",
    module_id: localStorage.getItem("module_id") || "",
    activity_id: localStorage.getItem("activity_id") || "",
    content_version_id: localStorage.getItem("content_version_id") || "",
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
