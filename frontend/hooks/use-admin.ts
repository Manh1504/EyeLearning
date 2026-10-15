"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignTeachers,
  fetchCourseTeachers,
  fetchTeachers,
  unassignTeacher,
  type CourseTeacher,
} from "@/lib/api/admin";
import {
  fetchAdminCalibrationSettings,
  updateAdminCalibrationSettings,
  type CalibrationSettings,
} from "@/lib/api/calibration";

export function useTeacherDirectory(enabled = true) {
  return useQuery({
    queryKey: ["admin", "teachers"],
    queryFn: () => fetchTeachers(),
    enabled,
  });
}

export function useCourseTeachers(courseId: string) {
  return useQuery({
    queryKey: ["admin", "course-teachers", courseId],
    queryFn: () => fetchCourseTeachers(courseId),
    enabled: Boolean(courseId),
  });
}

export function useAssignTeachers(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teacherIds: string[]) => assignTeachers(courseId, teacherIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "course-teachers", courseId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
    },
  });
}

export function useUnassignTeacher(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teacher: CourseTeacher) => unassignTeacher(courseId, teacher.teacherId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "course-teachers", courseId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
    },
  });
}

export function useCalibrationSettings() {
  return useQuery<CalibrationSettings>({
    queryKey: ["admin", "calibration-settings"],
    queryFn: () => fetchAdminCalibrationSettings(),
  });
}

export function useUpdateCalibrationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { enabled: boolean; threshold: number }) =>
      updateAdminCalibrationSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "calibration-settings"], data);
    },
  });
}
