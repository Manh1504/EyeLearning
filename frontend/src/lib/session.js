// Helper đọc/ghi session context trong localStorage — giữ đúng key như bản HTML/JS cũ
// để tương thích ngược nếu người dùng còn dữ liệu cũ trong trình duyệt.
export const LESSON_ID = "L001";

export function getSessionContext() {
  return {
    session_id: localStorage.getItem("session_id") || "",
    lesson_id: localStorage.getItem("lesson_id") || LESSON_ID,
    student_code: localStorage.getItem("student_code") || "",
    full_name: localStorage.getItem("full_name") || "",
    role: localStorage.getItem("role") || "student",
  };
}

export function getRole() {
  return localStorage.getItem("role") || "student";
}

export function setSessionContext(partial) {
  Object.entries(partial).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    localStorage.setItem(key, String(value));
  });
}
