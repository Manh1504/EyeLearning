import { apiFetch, apiFetchMultipart } from "./client";
import type {
  TeacherCourse,
  CourseStatus,
  Level,
  ModuleNode,
  StudentRow,
  SlideStat,
  SlideAdmin,
  LessonMastery,
} from "@/lib/types/domain";
import { formatShortDate } from "@/lib/utils";

export interface CourseListQuery {
  status?: CourseStatus;
  q?: string;
}

interface TeacherCourseRaw extends Omit<TeacherCourse, "updatedAt"> {
  updatedAt: string;
}

export function fetchTeacherCourses(query: CourseListQuery = {}): Promise<TeacherCourse[]> {
  const { status, q } = query;
  return apiFetch<TeacherCourseRaw[]>("/api/teacher/courses", {
    params: { status, q },
  }).then((courses) =>
    courses.map((course) => ({ ...course, updatedAt: formatShortDate(course.updatedAt) })),
  );
}

export function fetchCourseTree(courseId: string): Promise<ModuleNode[]> {
  return apiFetch<ModuleNode[]>(`/api/teacher/courses/${courseId}`);
}

export function fetchCourseStudents(courseId: string): Promise<StudentRow[]> {
  return apiFetch<StudentRow[]>(`/api/teacher/courses/${courseId}/students`);
}

export interface StudentDirectoryEntry {
  id: string;
  name: string;
  code: string;
  email?: string;
  color: string;
}

export function fetchStudentDirectory(q?: string): Promise<StudentDirectoryEntry[]> {
  return apiFetch<StudentDirectoryEntry[]>(
    `/api/teacher/students${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
  );
}

export function addCourseStudents(
  courseId: string,
  studentIds: string[],
): Promise<{ ok: boolean; added: number }> {
  return apiFetch(`/api/teacher/courses/${courseId}/students`, {
    method: "POST",
    body: { studentIds },
  });
}

export function removeCourseStudent(
  courseId: string,
  studentId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/courses/${courseId}/students/${studentId}`, {
    method: "DELETE",
  });
}

export function fetchHeatmap(
  lessonId: string,
  _slideCount: number,
  scope: "class" | string = "class",
): Promise<SlideStat[]> {
  return apiFetch<SlideStat[]>(`/api/teacher/lessons/${lessonId}/heatmap`, {
    params: scope === "class" ? {} : { student_id: scope },
  });
}

// ---- Mutations ----

export interface CourseWriteInput {
  title: string;
  description?: string;
  level?: Level;
  status?: CourseStatus;
}

export function createCourse(input: CourseWriteInput): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>("/api/teacher/courses", { method: "POST", body: input });
}

export function updateCourse(
  courseId: string,
  patch: Partial<CourseWriteInput>,
): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>(`/api/teacher/courses/${courseId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteCourse(courseId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/courses/${courseId}`, { method: "DELETE" });
}

export function createModule(courseId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/courses/${courseId}/modules`, {
    method: "POST",
    body: { title },
  });
}

export function updateModule(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/modules/${moduleId}`, {
    method: "PATCH",
    body: { title },
  });
}

export function deleteModule(moduleId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/modules/${moduleId}`, { method: "DELETE" });
}

export function createLesson(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/modules/${moduleId}/lessons`, {
    method: "POST",
    body: { title },
  });
}

export function updateLesson(lessonId: string, title: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/lessons/${lessonId}`, {
    method: "PATCH",
    body: { title },
  });
}

export function deleteLesson(lessonId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/lessons/${lessonId}`, { method: "DELETE" });
}

export function uploadLessonPdf(
  lessonId: string,
  pdf: Blob,
  filename: string,
): Promise<{ ok: boolean; slides: number }> {
  const form = new FormData();
  form.append("pdf", pdf, filename);
  return apiFetchMultipart(`/api/teacher/lessons/${lessonId}/slides/upload`, form, "POST");
}

export function fetchLessonSlidesAdmin(lessonId: string): Promise<SlideAdmin[]> {
  return apiFetch<SlideAdmin[]>(`/api/teacher/lessons/${lessonId}/slides`);
}

export function rebuildLessonAois(lessonId: string): Promise<{ ok: boolean; slides: number }> {
  return apiFetch<{ ok: boolean; slides: number }>(
    `/api/teacher/lessons/${lessonId}/aoi/rebuild`,
    { method: "POST" },
  );
}

export function setSlideKey(slideId: string, isKey: boolean): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/teacher/slides/${slideId}`, {
    method: "PATCH",
    body: { isKey },
  });
}

export function deleteSlide(slideId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/teacher/slides/${slideId}`, {
    method: "DELETE",
  });
}

export function setSlideKeys(lessonId: string, orderIndexes: number[]): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/teacher/lessons/${lessonId}/slides/key`, {
    method: "POST",
    body: { orderIndexes },
  });
}

export function fetchLessonMastery(lessonId: string, studentId: string): Promise<LessonMastery> {
  return apiFetch<LessonMastery>(`/api/teacher/lessons/${lessonId}/mastery`, {
    params: { student_id: studentId },
  });
}
